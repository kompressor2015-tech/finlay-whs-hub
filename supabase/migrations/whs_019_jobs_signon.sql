-- WHS app step 19: jobs and SWMS sign-on.
-- A job is a piece of work at a site (name, site, dates, a crew, and the SWMS that apply to it).
-- Sign-on: a worker reads an approved SWMS and signs with a drawn signature, on their own phone,
-- or a supervisor signs a worker or a contractor on. A sign-on is tied to one approved version, so a
-- new approved version needs everyone to sign on again. Sign-ons cannot be edited; only an administrator
-- can remove one entered by mistake. Signing on is never blocked by a lapsed ticket; the office sees a flag.
-- Safe to re-run. Run whs_018_swms.sql first.

begin;

create sequence if not exists public.whs_job_ref_seq;

-- Which worker record belongs to the person logged in
create or replace function public.whs_my_person_id()
returns uuid language sql stable security definer set search_path = public
as $$ select id from public.whs_people where profile_id = auth.uid() and active order by created_at limit 1 $$;

create table if not exists public.whs_jobs (
  id              uuid primary key default gen_random_uuid(),
  ref             text unique,
  name            text not null check (length(trim(name)) > 0),
  site_id         text references public.whs_sites (id),
  client          text not null default '',
  location        text not null default '',
  supervisor_name text not null default '',
  starts_on       date,
  ends_on         date,
  notes           text not null default '',
  status          text not null default 'active' check (status in ('active', 'closed')),
  created_by_name text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table if not exists public.whs_job_swms (
  job_id  uuid not null references public.whs_jobs (id) on delete cascade,
  swms_id uuid not null references public.whs_swms (id) on delete cascade,
  primary key (job_id, swms_id)
);

create table if not exists public.whs_job_people (
  job_id    uuid not null references public.whs_jobs (id) on delete cascade,
  person_id uuid not null references public.whs_people (id) on delete cascade,
  primary key (job_id, person_id)
);
create index if not exists whs_job_people_person_idx on public.whs_job_people (person_id);

create table if not exists public.whs_swms_signons (
  id               uuid primary key default gen_random_uuid(),
  swms_id          uuid not null references public.whs_swms (id) on delete cascade,
  version_id       uuid not null references public.whs_swms_versions (id) on delete cascade,
  job_id           uuid references public.whs_jobs (id) on delete set null,
  person_id        uuid references public.whs_people (id) on delete set null,
  signer_name      text not null default '',
  company          text not null default 'Finlay',
  signature_path   text not null default '',
  method           text not null default 'self' check (method in ('self', 'recorded')),
  recorded_by_name text not null default '',
  signed_at        timestamptz not null default now(),
  signer_key       text not null default '',
  job_key          text not null default ''
);
create unique index if not exists whs_swms_signons_once on public.whs_swms_signons (version_id, job_key, signer_key);
create index if not exists whs_swms_signons_swms_idx on public.whs_swms_signons (swms_id, signed_at desc);
create index if not exists whs_swms_signons_person_idx on public.whs_swms_signons (person_id);
create index if not exists whs_swms_signons_job_idx on public.whs_swms_signons (job_id);

-- Stamps ---------------------------------------------------------------------------------

create or replace function public.whs_job_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.ref := 'JOB-' || lpad(nextval('public.whs_job_ref_seq')::text, 3, '0');
    new.created_by_name := public.whs_actor_name();
    new.created_at := now();
  else
    new.ref := old.ref;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists whs_job_stamps on public.whs_jobs;
create trigger whs_job_stamps before insert or update on public.whs_jobs
  for each row execute function public.whs_job_stamps();

create or replace function public.whs_signon_rules()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v public.whs_swms_versions; s public.whs_swms; p public.whs_people;
begin
  select * into v from public.whs_swms_versions where id = new.version_id;
  if v.id is null or v.status <> 'approved' then
    raise exception 'That SWMS version is no longer the approved one. Open the SWMS again to sign on.';
  end if;
  select * into s from public.whs_swms where id = v.swms_id;
  if s.status <> 'active' then raise exception 'This SWMS has been retired.'; end if;
  if coalesce(btrim(new.signature_path), '') = '' then raise exception 'Signing on needs a signature.'; end if;

  new.swms_id := v.swms_id;
  new.signed_at := now();
  new.recorded_by_name := public.whs_actor_name();
  if new.person_id is not null then
    select * into p from public.whs_people where id = new.person_id;
    if p.id is null then raise exception 'That person was not found.'; end if;
    new.signer_name := p.name;
    new.company := 'Finlay';
    new.signer_key := new.person_id::text;
    new.method := case when new.person_id = public.whs_my_person_id() then 'self' else 'recorded' end;
  else
    new.signer_name := btrim(coalesce(new.signer_name, ''));
    new.company := btrim(coalesce(new.company, ''));
    if new.signer_name = '' then raise exception 'Add the name of the person signing on.'; end if;
    if new.company = '' then raise exception 'Add the company the person works for.'; end if;
    new.signer_key := lower(new.signer_name) || '|' || lower(new.company);
    new.method := 'recorded';
  end if;
  new.job_key := coalesce(new.job_id::text, '');
  perform public.whs_log('swms', new.swms_id, new.signer_name || ' signed on to version ' || v.version);
  return new;
end;
$$;
drop trigger if exists whs_signon_rules on public.whs_swms_signons;
create trigger whs_signon_rules before insert on public.whs_swms_signons
  for each row execute function public.whs_signon_rules();

-- Permissions ------------------------------------------------------------------------------

alter table public.whs_jobs enable row level security;
alter table public.whs_job_swms enable row level security;
alter table public.whs_job_people enable row level security;
alter table public.whs_swms_signons enable row level security;

drop policy if exists "whs read jobs" on public.whs_jobs;
drop policy if exists "whs office add jobs" on public.whs_jobs;
drop policy if exists "whs office edit jobs" on public.whs_jobs;
drop policy if exists "whs admin delete jobs" on public.whs_jobs;
create policy "whs read jobs" on public.whs_jobs for select to authenticated using (public.whs_is_member());
create policy "whs office add jobs" on public.whs_jobs for insert to authenticated with check (public.whs_is_office());
create policy "whs office edit jobs" on public.whs_jobs for update to authenticated using (public.whs_is_office()) with check (public.whs_is_office());
create policy "whs admin delete jobs" on public.whs_jobs for delete to authenticated using (public.whs_is_admin());

drop policy if exists "whs read job swms" on public.whs_job_swms;
drop policy if exists "whs office add job swms" on public.whs_job_swms;
drop policy if exists "whs office remove job swms" on public.whs_job_swms;
create policy "whs read job swms" on public.whs_job_swms for select to authenticated using (public.whs_is_member());
create policy "whs office add job swms" on public.whs_job_swms for insert to authenticated with check (public.whs_is_office());
create policy "whs office remove job swms" on public.whs_job_swms for delete to authenticated using (public.whs_is_office());

drop policy if exists "whs read job people" on public.whs_job_people;
drop policy if exists "whs office add job people" on public.whs_job_people;
drop policy if exists "whs office remove job people" on public.whs_job_people;
create policy "whs read job people" on public.whs_job_people for select to authenticated using (public.whs_is_office() or (public.whs_is_member() and person_id = public.whs_my_person_id()));
create policy "whs office add job people" on public.whs_job_people for insert to authenticated with check (public.whs_is_office());
create policy "whs office remove job people" on public.whs_job_people for delete to authenticated using (public.whs_is_office());

drop policy if exists "whs read signons" on public.whs_swms_signons;
drop policy if exists "whs add signons" on public.whs_swms_signons;
drop policy if exists "whs admin delete signons" on public.whs_swms_signons;
create policy "whs read signons" on public.whs_swms_signons for select to authenticated
  using (public.whs_is_office() or (public.whs_is_member() and person_id is not null and person_id = public.whs_my_person_id()));
-- A worker signs themselves on. Office roles can sign anyone on, including contractors.
create policy "whs add signons" on public.whs_swms_signons for insert to authenticated
  with check (public.whs_is_member() and ((person_id is not null and person_id = public.whs_my_person_id()) or public.whs_is_office()));
create policy "whs admin delete signons" on public.whs_swms_signons for delete to authenticated using (public.whs_is_admin());

revoke all on public.whs_jobs, public.whs_job_swms, public.whs_job_people, public.whs_swms_signons from anon;
grant select, insert, update, delete on public.whs_jobs to authenticated;
grant select, insert, delete on public.whs_job_swms to authenticated;
grant select, insert, delete on public.whs_job_people to authenticated;
grant select, insert, delete on public.whs_swms_signons to authenticated;
grant usage on sequence public.whs_job_ref_seq to authenticated;

notify pgrst, 'reload schema';
commit;
