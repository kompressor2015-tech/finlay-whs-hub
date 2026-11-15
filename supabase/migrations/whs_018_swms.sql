-- WHS app step 18: SWMS (safe work method statements) written and approved in the app.
-- A SWMS has versions. A version is a draft, then awaiting approval, then approved. The WHS officer
-- or an administrator approves with a drawn signature. An approved version is locked: any change
-- makes a new version, and the older approved one is marked superseded. Every approval also counts
-- as a review. Reviews can be recorded without changes. Changes are written to the history.
-- Safe to re-run. Back up first as usual.

begin;

create sequence if not exists public.whs_swms_ref_seq;

create table if not exists public.whs_swms (
  id               uuid primary key default gen_random_uuid(),
  ref              text unique,
  title            text not null check (length(trim(title)) > 0),
  site_id          text references public.whs_sites (id),       -- null = all sites
  owner_name       text not null default 'WHS officer',
  review_months    int not null default 12 check (review_months > 0),
  reviewed_on      date,
  reviewed_by_name text not null default '',
  document_id      uuid references public.whs_documents (id) on delete set null,   -- the existing file, if linked
  status           text not null default 'active' check (status in ('active', 'retired')),
  created_by_name  text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.whs_swms_versions (
  id              uuid primary key default gen_random_uuid(),
  swms_id         uuid not null references public.whs_swms (id) on delete cascade,
  version         int not null,
  status          text not null default 'draft' check (status in ('draft', 'awaiting', 'approved', 'superseded')),
  work_covered    text not null default '',
  who_may         text not null default '',
  steps           jsonb not null default '[]'::jsonb,     -- [{step, hazard, before:[l,c], controls, after:[l,c], who, risk_id}]
  ppe             text not null default '',
  plant           text not null default '',
  permits         text not null default '',
  emergency       text not null default '',
  linked_risk_ids uuid[] not null default '{}',
  decision_note   text not null default '',
  created_by_name text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  submitted_by_name text not null default '',
  approved_at     timestamptz,
  approved_by_name text not null default '',
  signature_path  text,
  unique (swms_id, version)
);
create index if not exists whs_swms_versions_idx on public.whs_swms_versions (swms_id, version desc);

create table if not exists public.whs_swms_reviews (
  id               uuid primary key default gen_random_uuid(),
  swms_id          uuid not null references public.whs_swms (id) on delete cascade,
  reviewed_on      date not null,
  reviewed_by_name text not null default '',
  note             text not null default '',
  created_at       timestamptz not null default now()
);
create index if not exists whs_swms_reviews_idx on public.whs_swms_reviews (swms_id, reviewed_on desc);

-- The SWMS itself -----------------------------------------------------------------

create or replace function public.whs_swms_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.ref := 'SWMS-' || lpad(nextval('public.whs_swms_ref_seq')::text, 3, '0');
    new.created_by_name := public.whs_actor_name();
    new.created_at := now();
    new.updated_at := now();
    perform public.whs_log('swms', new.id, 'Created');
  else
    new.ref := old.ref;
    new.created_at := old.created_at;
    new.created_by_name := old.created_by_name;
    new.updated_at := now();
    if new.status is distinct from old.status then
      perform public.whs_log('swms', new.id, case new.status when 'retired' then 'Retired' else 'Put back in use' end);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists whs_swms_stamps on public.whs_swms;
create trigger whs_swms_stamps before insert or update on public.whs_swms
  for each row execute function public.whs_swms_stamps();

-- A version: who may move it between states, and what is locked -----------------------

create or replace function public.whs_swms_version_rules()
returns trigger language plpgsql security definer set search_path = public
as $$
declare r public.whs_swms_versions;
begin
  if tg_op = 'INSERT' then
    new.version := coalesce((select max(version) from public.whs_swms_versions where swms_id = new.swms_id), 0) + 1;
    new.status := 'draft';
    new.created_by_name := public.whs_actor_name();
    new.created_at := now();
    new.updated_at := now();
    new.submitted_at := null; new.approved_at := null; new.signature_path := null;
    new.submitted_by_name := ''; new.approved_by_name := ''; new.decision_note := '';
    perform public.whs_log('swms', new.swms_id, 'Version ' || new.version || ' started');
    return new;
  end if;

  -- Approved and superseded versions are locked. The only change allowed is approved to superseded.
  if old.status in ('approved', 'superseded') then
    if old.status = 'approved' and new.status = 'superseded' then
      new.updated_at := now();
      new := old; new.status := 'superseded';
      return new;
    end if;
    raise exception 'An approved version cannot be changed. Start a new version.';
  end if;

  new.swms_id := old.swms_id; new.version := old.version; new.created_by_name := old.created_by_name; new.created_at := old.created_at;
  new.updated_at := now();

  if old.status = 'draft' and new.status = 'draft' then
    new.submitted_at := null; new.approved_at := null; new.signature_path := null; new.approved_by_name := '';
    return new;
  end if;

  if old.status = 'draft' and new.status = 'awaiting' then
    if jsonb_array_length(new.steps) = 0 then raise exception 'Add at least one step before sending for approval.'; end if;
    new.submitted_at := now();
    new.submitted_by_name := public.whs_actor_name();
    new.decision_note := '';
    perform public.whs_log('swms', new.swms_id, 'Version ' || new.version || ' sent for approval');
    return new;
  end if;

  if old.status = 'awaiting' and new.status = 'awaiting' then
    -- Nothing but the approval decision fields can move while it waits
    new := old;
    return new;
  end if;

  if old.status = 'awaiting' and new.status = 'draft' then
    new.decision_note := coalesce(new.decision_note, '');
    new.signature_path := null; new.approved_at := null; new.approved_by_name := '';
    perform public.whs_log('swms', new.swms_id, 'Version ' || new.version || case when new.decision_note <> '' then ' sent back: ' || left(new.decision_note, 100) else ' taken back to draft' end);
    return new;
  end if;

  if old.status = 'awaiting' and new.status = 'approved' then
    if not public.whs_is_officer() then raise exception 'Only the WHS officer or an administrator can approve a SWMS.'; end if;
    if coalesce(btrim(new.signature_path), '') = '' then raise exception 'Approval needs a signature.'; end if;
    new.approved_at := now();
    new.approved_by_name := public.whs_actor_name();
    update public.whs_swms_versions set status = 'superseded' where swms_id = new.swms_id and status = 'approved' and id <> new.id;
    insert into public.whs_swms_reviews (swms_id, reviewed_on, note) values (new.swms_id, (now() at time zone 'Australia/Brisbane')::date, 'Approved version ' || new.version);
    perform public.whs_log('swms', new.swms_id, 'Version ' || new.version || ' approved');
    return new;
  end if;

  raise exception 'That change is not allowed (% to %).', old.status, new.status;
end;
$$;
drop trigger if exists whs_swms_version_rules on public.whs_swms_versions;
create trigger whs_swms_version_rules before insert or update on public.whs_swms_versions
  for each row execute function public.whs_swms_version_rules();

-- Reviews --------------------------------------------------------------------------

create or replace function public.whs_swms_review_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.reviewed_by_name := public.whs_actor_name();
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists whs_swms_review_stamps on public.whs_swms_reviews;
create trigger whs_swms_review_stamps before insert on public.whs_swms_reviews
  for each row execute function public.whs_swms_review_stamps();

create or replace function public.whs_swms_review_follow()
returns trigger language plpgsql security definer set search_path = public
as $$
declare sid uuid; d date; who text;
begin
  sid := coalesce(new.swms_id, old.swms_id);
  select reviewed_on, reviewed_by_name into d, who from public.whs_swms_reviews where swms_id = sid order by reviewed_on desc, created_at desc limit 1;
  update public.whs_swms set reviewed_on = d, reviewed_by_name = coalesce(who, '') where id = sid;
  if tg_op = 'INSERT' and new.note not like 'Approved version%' then perform public.whs_log('swms', sid, 'Reviewed'); end if;
  return null;
end;
$$;
drop trigger if exists whs_swms_review_follow on public.whs_swms_reviews;
create trigger whs_swms_review_follow after insert or delete on public.whs_swms_reviews
  for each row execute function public.whs_swms_review_follow();

-- Permissions ----------------------------------------------------------------------

alter table public.whs_swms enable row level security;
alter table public.whs_swms_versions enable row level security;
alter table public.whs_swms_reviews enable row level security;

drop policy if exists "whs read swms" on public.whs_swms;
drop policy if exists "whs office add swms" on public.whs_swms;
drop policy if exists "whs office edit swms" on public.whs_swms;
drop policy if exists "whs admin delete swms" on public.whs_swms;
create policy "whs read swms" on public.whs_swms for select to authenticated using (public.whs_is_member());
create policy "whs office add swms" on public.whs_swms for insert to authenticated with check (public.whs_is_office());
create policy "whs office edit swms" on public.whs_swms for update to authenticated using (public.whs_is_office()) with check (public.whs_is_office());
create policy "whs admin delete swms" on public.whs_swms for delete to authenticated using (public.whs_is_admin());

-- Drafts and versions waiting for approval are for the office. Anyone with WHS access reads approved ones.
drop policy if exists "whs read swms versions" on public.whs_swms_versions;
drop policy if exists "whs office add swms versions" on public.whs_swms_versions;
drop policy if exists "whs office edit swms versions" on public.whs_swms_versions;
drop policy if exists "whs office discard swms drafts" on public.whs_swms_versions;
create policy "whs read swms versions" on public.whs_swms_versions for select to authenticated
  using (public.whs_is_office() or (public.whs_is_member() and status in ('approved', 'superseded')));
create policy "whs office add swms versions" on public.whs_swms_versions for insert to authenticated with check (public.whs_is_office());
create policy "whs office edit swms versions" on public.whs_swms_versions for update to authenticated using (public.whs_is_office()) with check (public.whs_is_office());
create policy "whs office discard swms drafts" on public.whs_swms_versions for delete to authenticated using (public.whs_is_office() and status = 'draft');

drop policy if exists "whs read swms reviews" on public.whs_swms_reviews;
drop policy if exists "whs office add swms reviews" on public.whs_swms_reviews;
drop policy if exists "whs admin delete swms reviews" on public.whs_swms_reviews;
create policy "whs read swms reviews" on public.whs_swms_reviews for select to authenticated using (public.whs_is_member());
create policy "whs office add swms reviews" on public.whs_swms_reviews for insert to authenticated with check (public.whs_is_office());
create policy "whs admin delete swms reviews" on public.whs_swms_reviews for delete to authenticated using (public.whs_is_admin());

revoke all on public.whs_swms, public.whs_swms_versions, public.whs_swms_reviews from anon;
grant select, insert, update, delete on public.whs_swms to authenticated;
grant select, insert, update, delete on public.whs_swms_versions to authenticated;
grant select, insert, delete on public.whs_swms_reviews to authenticated;
revoke update on public.whs_swms_reviews from authenticated;
grant usage on sequence public.whs_swms_ref_seq to authenticated;

notify pgrst, 'reload schema';
commit;
