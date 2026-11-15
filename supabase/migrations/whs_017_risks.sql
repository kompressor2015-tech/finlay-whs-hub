-- WHS app step 17: the risk register.
-- A risk is rated before controls and after controls on one 5 by 5 grid (likelihood by
-- consequence), has controls in the five control levels, an owner, and a review log.
-- Changes to ratings, controls and status are written to the history by the database.
-- Safe to re-run. Back up first as usual.

begin;

create sequence if not exists public.whs_risk_ref_seq;

create table if not exists public.whs_risks (
  id                 uuid primary key default gen_random_uuid(),
  ref                text unique,
  title              text not null check (length(trim(title)) > 0),
  category           text not null default '',
  site_id            text references public.whs_sites (id),          -- null = all sites
  description        text not null default '',                       -- what could happen, and to whom
  before_likelihood  int not null check (before_likelihood between 1 and 5),
  before_consequence int not null check (before_consequence between 1 and 5),
  after_likelihood   int check (after_likelihood between 1 and 5),
  after_consequence  int check (after_consequence between 1 and 5),
  owner_name         text not null default 'WHS officer',
  review_months      int not null default 12 check (review_months > 0),
  reviewed_on        date,
  reviewed_by_name   text not null default '',
  notes              text not null default '',
  status             text not null default 'active' check (status in ('active', 'retired')),
  created_by_name    text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check ((after_likelihood is null) = (after_consequence is null))
);
create index if not exists whs_risks_status_idx on public.whs_risks (status, category);

create table if not exists public.whs_risk_controls (
  id            uuid primary key default gen_random_uuid(),
  risk_id       uuid not null references public.whs_risks (id) on delete cascade,
  control_level text not null check (control_level in ('eliminate', 'substitute', 'engineer', 'administrative', 'ppe')),
  what          text not null check (length(trim(what)) > 0),
  created_at    timestamptz not null default now()
);
create index if not exists whs_risk_controls_idx on public.whs_risk_controls (risk_id);

create table if not exists public.whs_risk_reviews (
  id               uuid primary key default gen_random_uuid(),
  risk_id          uuid not null references public.whs_risks (id) on delete cascade,
  reviewed_on      date not null,
  reviewed_by_name text not null default '',
  note             text not null default '',
  created_at       timestamptz not null default now()
);
create index if not exists whs_risk_reviews_idx on public.whs_risk_reviews (risk_id, reviewed_on desc);

-- Stamps and history --------------------------------------------------------------

create or replace function public.whs_risk_level(l int, c int)
returns text language sql immutable
as $$ select case when l is null or c is null then null
                  when l * c >= 17 then 'extreme' when l * c >= 10 then 'high'
                  when l * c >= 5 then 'medium' else 'low' end $$;

create or replace function public.whs_risk_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.ref := 'RSK-' || lpad(nextval('public.whs_risk_ref_seq')::text, 4, '0');
    new.created_by_name := public.whs_actor_name();
    new.created_at := now();
    new.updated_at := now();
    perform public.whs_log('risk', new.id, 'Added to the register');
  else
    new.ref := old.ref;
    new.created_at := old.created_at;
    new.created_by_name := old.created_by_name;
    new.updated_at := now();
    if (new.before_likelihood, new.before_consequence) is distinct from (old.before_likelihood, old.before_consequence) then
      perform public.whs_log('risk', new.id, 'Rating before controls changed from ' || public.whs_risk_level(old.before_likelihood, old.before_consequence) || ' to ' || public.whs_risk_level(new.before_likelihood, new.before_consequence));
    end if;
    if (new.after_likelihood, new.after_consequence) is distinct from (old.after_likelihood, old.after_consequence) then
      perform public.whs_log('risk', new.id, 'Rating after controls changed from ' || coalesce(public.whs_risk_level(old.after_likelihood, old.after_consequence), 'not rated') || ' to ' || coalesce(public.whs_risk_level(new.after_likelihood, new.after_consequence), 'not rated'));
    end if;
    if new.status is distinct from old.status then
      perform public.whs_log('risk', new.id, case new.status when 'retired' then 'Retired from the register' else 'Put back on the register' end);
    end if;
    if new.owner_name is distinct from old.owner_name then
      perform public.whs_log('risk', new.id, 'Owner changed to ' || new.owner_name);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists whs_risk_stamps on public.whs_risks;
create trigger whs_risk_stamps before insert or update on public.whs_risks
  for each row execute function public.whs_risk_stamps();

create or replace function public.whs_risk_control_log()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.whs_log('risk', new.risk_id, 'Control added: ' || left(new.what, 80));
    return new;
  end if;
  perform public.whs_log('risk', old.risk_id, 'Control removed: ' || left(old.what, 80));
  return old;
end;
$$;
drop trigger if exists whs_risk_control_log on public.whs_risk_controls;
create trigger whs_risk_control_log after insert or delete on public.whs_risk_controls
  for each row execute function public.whs_risk_control_log();

-- A review line stamps who did it, and the risk's review date follows the newest line
create or replace function public.whs_risk_review_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
declare rid uuid; d date; who text;
begin
  if tg_op = 'INSERT' then
    new.reviewed_by_name := public.whs_actor_name();
    new.created_at := now();
    return new;
  end if;
  rid := coalesce(new.risk_id, old.risk_id);
  select reviewed_on, reviewed_by_name into d, who from public.whs_risk_reviews where risk_id = rid order by reviewed_on desc, created_at desc limit 1;
  update public.whs_risks set reviewed_on = d, reviewed_by_name = coalesce(who, '') where id = rid;
  return null;
end;
$$;
drop trigger if exists whs_risk_review_stamps on public.whs_risk_reviews;
create trigger whs_risk_review_stamps before insert on public.whs_risk_reviews
  for each row execute function public.whs_risk_review_stamps();
create or replace function public.whs_risk_review_follow()
returns trigger language plpgsql security definer set search_path = public
as $$
declare rid uuid; d date; who text;
begin
  rid := coalesce(new.risk_id, old.risk_id);
  select reviewed_on, reviewed_by_name into d, who from public.whs_risk_reviews where risk_id = rid order by reviewed_on desc, created_at desc limit 1;
  update public.whs_risks set reviewed_on = d, reviewed_by_name = coalesce(who, '') where id = rid;
  perform public.whs_log('risk', rid, case tg_op when 'INSERT' then 'Reviewed' else 'A review line was removed' end);
  return null;
end;
$$;
drop trigger if exists whs_risk_review_follow on public.whs_risk_reviews;
create trigger whs_risk_review_follow after insert or delete on public.whs_risk_reviews
  for each row execute function public.whs_risk_review_follow();

-- Permissions ---------------------------------------------------------------------

alter table public.whs_risks enable row level security;
alter table public.whs_risk_controls enable row level security;
alter table public.whs_risk_reviews enable row level security;

drop policy if exists "whs read risks" on public.whs_risks;
drop policy if exists "whs office add risks" on public.whs_risks;
drop policy if exists "whs office edit risks" on public.whs_risks;
drop policy if exists "whs admin delete risks" on public.whs_risks;
create policy "whs read risks" on public.whs_risks for select to authenticated using (public.whs_is_member());
create policy "whs office add risks" on public.whs_risks for insert to authenticated with check (public.whs_is_office());
create policy "whs office edit risks" on public.whs_risks for update to authenticated using (public.whs_is_office()) with check (public.whs_is_office());
create policy "whs admin delete risks" on public.whs_risks for delete to authenticated using (public.whs_is_admin());

drop policy if exists "whs read risk controls" on public.whs_risk_controls;
drop policy if exists "whs office add risk controls" on public.whs_risk_controls;
drop policy if exists "whs office remove risk controls" on public.whs_risk_controls;
create policy "whs read risk controls" on public.whs_risk_controls for select to authenticated using (public.whs_is_member());
create policy "whs office add risk controls" on public.whs_risk_controls for insert to authenticated with check (public.whs_is_office());
create policy "whs office remove risk controls" on public.whs_risk_controls for delete to authenticated using (public.whs_is_office());

drop policy if exists "whs read risk reviews" on public.whs_risk_reviews;
drop policy if exists "whs office add risk reviews" on public.whs_risk_reviews;
drop policy if exists "whs admin delete risk reviews" on public.whs_risk_reviews;
create policy "whs read risk reviews" on public.whs_risk_reviews for select to authenticated using (public.whs_is_member());
create policy "whs office add risk reviews" on public.whs_risk_reviews for insert to authenticated with check (public.whs_is_office());
create policy "whs admin delete risk reviews" on public.whs_risk_reviews for delete to authenticated using (public.whs_is_admin());

revoke all on public.whs_risks, public.whs_risk_controls, public.whs_risk_reviews from anon;
grant select, insert, update, delete on public.whs_risks to authenticated;
grant select, insert, delete on public.whs_risk_controls to authenticated;
grant select, insert, delete on public.whs_risk_reviews to authenticated;
grant usage on sequence public.whs_risk_ref_seq to authenticated;
revoke update on public.whs_risk_reviews from authenticated;

notify pgrst, 'reload schema';
commit;
