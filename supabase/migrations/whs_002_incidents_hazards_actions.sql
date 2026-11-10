-- ==============================================================================
-- FINLAY WHS - MIGRATION whs_002: INCIDENTS, HAZARDS, ACTIONS
-- ==============================================================================
-- Run once in the Supabase dashboard (the same project as the Fleet Hub):
-- SQL Editor > New query > CLEAR THE EDITOR FIRST > paste > Run.
-- Safe to run again; all-or-nothing. Needs whs_001_roles.sql to have been run.
--
-- BEFORE YOU RUN IT: back up (the free plan has no point-in-time restore).
--
-- WHAT IT ADDS (all new, all named whs_...; no fleet table or rule is changed)
--   whs_incidents : incident reports, the WHSQ notifiable details and the investigation
--   whs_hazards   : hazard reports with a risk level
--   whs_actions   : corrective actions from incidents, hazards and (later) inspections
--   whs_history   : who did what and when, written by the database, not the app
--   whs-photos    : a private storage bucket for report photos
--
-- WHO CAN DO WHAT
--   Anyone with WHS access (fleet admins, whs_officer, supervisor, field) can report.
--   Field staff see only their own reports and actions given to them.
--   Office roles (admin, whs_officer, supervisor) see and update everything.
--   Only an admin or WHS officer can close an incident, and only when its actions are done.
--   Notifiable incidents can never be deleted (records are kept at least 5 years).
-- ==============================================================================

begin;

-- 1. Reference numbers: INC-0001, HAZ-0001 ------------------------------------

create sequence if not exists public.whs_incident_ref_seq;
create sequence if not exists public.whs_hazard_ref_seq;

-- 2. Tables ----------------------------------------------------------------------

create table if not exists public.whs_incidents (
  id                 uuid primary key default gen_random_uuid(),
  ref                text unique,
  type               text not null check (type in ('injury', 'near_miss', 'damage', 'spill')),
  occurred_at        timestamptz not null,
  site_id            text,                        -- depot_sites.id, or null for a client site
  site_name          text not null default '',
  location_detail    text not null default '',
  machine_id         text,                        -- stock_machines.id (the fleet register)
  unit_no            text not null default '',    -- copied at the time, so it reads right later
  people             text not null default '',
  description        text not null default '',
  immediate_action   text not null default '',
  photos             text[] not null default '{}',
  notifiable_reasons text[] not null default '{}' check (notifiable_reasons <@ array['death', 'serious', 'dangerous']),
  notifiable         boolean generated always as (cardinality(notifiable_reasons) > 0) stored,
  whsq_called_at     timestamptz,
  whsq_called_by     text not null default '',
  whsq_reference     text not null default '',
  site_released_at   timestamptz,
  site_released_by   text not null default '',
  status             text not null default 'new' check (status in ('new', 'investigating', 'actions', 'closed')),
  investigation_lead uuid references public.profiles (id) on delete set null,
  investigation_due  date,
  why_chain          text[] not null default '{}',
  factors            text[] not null default '{}',
  closed_at          timestamptz,
  closed_by          uuid,
  reported_by        uuid not null default auth.uid(),
  reporter_name      text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.whs_hazards (
  id               uuid primary key default gen_random_uuid(),
  ref              text unique,
  description      text not null,
  site_id          text,
  site_name        text not null default '',
  location_detail  text not null default '',
  machine_id       text,
  unit_no          text not null default '',
  photos           text[] not null default '{}',
  severity         text not null check (severity in ('minor', 'injury', 'serious', 'fatal')),
  made_safe        text not null default 'no' check (made_safe in ('yes', 'partly', 'no')),
  made_safe_note   text not null default '',
  status           text not null default 'new' check (status in ('new', 'actioned', 'closed')),
  closed_at        timestamptz,
  reported_by      uuid not null default auth.uid(),
  reporter_name    text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.whs_actions (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  source_type  text not null default 'other' check (source_type in ('incident', 'hazard', 'inspection', 'other')),
  source_id    uuid,
  source_ref   text not null default '',
  machine_id   text,
  unit_no      text not null default '',
  owner_id     uuid references public.profiles (id) on delete set null,
  owner_name   text not null default '',
  due          date,
  status       text not null default 'not_started' check (status in ('not_started', 'in_progress', 'done')),
  done_note    text not null default '',
  done_at      timestamptz,
  done_by      uuid,
  created_by   uuid not null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.whs_history (
  id           bigint generated always as identity primary key,
  record_type  text not null,     -- incident, hazard, action
  record_id    uuid not null,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid,
  actor_name   text not null default 'System',
  what         text not null
);

create index if not exists whs_incidents_occurred_idx on public.whs_incidents (occurred_at desc);
create index if not exists whs_hazards_created_idx on public.whs_hazards (created_at desc);
create index if not exists whs_actions_source_idx on public.whs_actions (source_type, source_id);
create index if not exists whs_actions_open_idx on public.whs_actions (due) where status <> 'done';
create index if not exists whs_history_record_idx on public.whs_history (record_type, record_id, occurred_at desc);

-- 3. Stamps the database fills in (the app cannot fake these) ---------------------

create or replace function public.whs_actor_name()
returns text language sql stable security definer set search_path = public
as $$ select coalesce((select coalesce(nullif(name, ''), email) from public.profiles where id = auth.uid()), 'System') $$;

create or replace function public.whs_log(p_type text, p_id uuid, p_what text)
returns void language sql security definer set search_path = public
as $$
  insert into public.whs_history (record_type, record_id, actor_id, actor_name, what)
  values (p_type, p_id, auth.uid(), public.whs_actor_name(), p_what)
$$;
revoke all on function public.whs_log(text, uuid, text) from public, anon, authenticated;

create or replace function public.whs_incident_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.ref := 'INC-' || lpad(nextval('public.whs_incident_ref_seq')::text, 4, '0');
    new.reported_by := coalesce(auth.uid(), new.reported_by);
    new.reporter_name := public.whs_actor_name();
    new.status := 'new';
    new.closed_at := null;
    new.closed_by := null;
    new.created_at := now();
  else
    new.ref := old.ref;
    new.reported_by := old.reported_by;
    new.reporter_name := old.reporter_name;
    new.created_at := old.created_at;
    if new.status = 'closed' and old.status is distinct from 'closed' then
      if auth.uid() is not null and not public.whs_is_officer() then
        raise exception 'Only an admin or the WHS officer can close an incident';
      end if;
      if exists (select 1 from public.whs_actions a
                 where a.source_type = 'incident' and a.source_id = new.id and a.status <> 'done') then
        raise exception 'Finish all of this incident''s actions before closing it';
      end if;
      new.closed_at := now();
      new.closed_by := auth.uid();
    elsif new.status <> 'closed' then
      new.closed_at := null;
      new.closed_by := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists whs_incident_stamps on public.whs_incidents;
create trigger whs_incident_stamps before insert or update on public.whs_incidents
  for each row execute function public.whs_incident_stamps();

create or replace function public.whs_incident_history()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.whs_log('incident', new.id, 'Reported' || case when new.notifiable then ' (notifiable)' else '' end);
    return new;
  end if;
  if new.status is distinct from old.status then
    perform public.whs_log('incident', new.id, case new.status
      when 'investigating' then 'Investigation started'
      when 'actions' then 'Investigation finished; actions under way'
      when 'closed' then 'Closed'
      else 'Reopened' end);
  end if;
  if new.notifiable and not old.notifiable then
    perform public.whs_log('incident', new.id, 'Marked notifiable');
  end if;
  if new.whsq_called_at is not null and old.whsq_called_at is null then
    perform public.whs_log('incident', new.id, 'WHSQ notified');
  end if;
  if new.site_released_at is not null and old.site_released_at is null then
    perform public.whs_log('incident', new.id, 'Site released');
  end if;
  if new.investigation_lead is distinct from old.investigation_lead and new.investigation_lead is not null then
    perform public.whs_log('incident', new.id, 'Investigation lead assigned');
  end if;
  return new;
end;
$$;

drop trigger if exists whs_incident_history on public.whs_incidents;
create trigger whs_incident_history after insert or update on public.whs_incidents
  for each row execute function public.whs_incident_history();

create or replace function public.whs_hazard_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.ref := 'HAZ-' || lpad(nextval('public.whs_hazard_ref_seq')::text, 4, '0');
    new.reported_by := coalesce(auth.uid(), new.reported_by);
    new.reporter_name := public.whs_actor_name();
    new.status := 'new';
    new.created_at := now();
  else
    new.ref := old.ref;
    new.reported_by := old.reported_by;
    new.reporter_name := old.reporter_name;
    new.created_at := old.created_at;
    new.closed_at := case when new.status = 'closed' then coalesce(old.closed_at, now()) else null end;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists whs_hazard_stamps on public.whs_hazards;
create trigger whs_hazard_stamps before insert or update on public.whs_hazards
  for each row execute function public.whs_hazard_stamps();

create or replace function public.whs_hazard_history()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.whs_log('hazard', new.id, 'Reported');
  elsif new.status is distinct from old.status then
    perform public.whs_log('hazard', new.id, case new.status
      when 'actioned' then 'Reviewed; action set' when 'closed' then 'Closed' else 'Reopened' end);
  end if;
  return new;
end;
$$;

drop trigger if exists whs_hazard_history on public.whs_hazards;
create trigger whs_hazard_history after insert or update on public.whs_hazards
  for each row execute function public.whs_hazard_history();

create or replace function public.whs_action_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    -- The owner (not an office role) may only move their action along, not rewrite it.
    if auth.uid() is not null and not public.whs_is_office() then
      if new.title is distinct from old.title or new.owner_id is distinct from old.owner_id
         or new.due is distinct from old.due or new.source_id is distinct from old.source_id then
        raise exception 'Only an office role can change an action''s details';
      end if;
    end if;
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.done_at := now();
    new.done_by := auth.uid();
  elsif new.status <> 'done' then
    new.done_at := null;
    new.done_by := null;
  end if;
  new.owner_name := coalesce((select coalesce(nullif(name, ''), email) from public.profiles where id = new.owner_id), new.owner_name);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists whs_action_stamps on public.whs_actions;
create trigger whs_action_stamps before insert or update on public.whs_actions
  for each row execute function public.whs_action_stamps();

create or replace function public.whs_action_history()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  label text := '"' || left(new.title, 80) || '"';
begin
  if tg_op = 'INSERT' then
    perform public.whs_log('action', new.id, 'Action added: ' || label);
    if new.source_id is not null and new.source_type in ('incident', 'hazard') then
      perform public.whs_log(new.source_type, new.source_id, 'Action added: ' || label);
    end if;
  elsif new.status is distinct from old.status then
    perform public.whs_log('action', new.id, case new.status
      when 'done' then 'Done' when 'in_progress' then 'Started' else 'Set back to not started' end);
    if new.status = 'done' and new.source_id is not null and new.source_type in ('incident', 'hazard') then
      perform public.whs_log(new.source_type, new.source_id, 'Action done: ' || label);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists whs_action_history on public.whs_actions;
create trigger whs_action_history after insert or update on public.whs_actions
  for each row execute function public.whs_action_history();

-- 4. Access rules -----------------------------------------------------------------

alter table public.whs_incidents enable row level security;
alter table public.whs_hazards   enable row level security;
alter table public.whs_actions   enable row level security;
alter table public.whs_history   enable row level security;

drop policy if exists "whs read incidents" on public.whs_incidents;
drop policy if exists "whs report incidents" on public.whs_incidents;
drop policy if exists "whs office update incidents" on public.whs_incidents;
drop policy if exists "whs officer delete incidents" on public.whs_incidents;
create policy "whs read incidents" on public.whs_incidents for select to authenticated
  using (public.whs_is_office() or (public.whs_is_member() and reported_by = auth.uid()));
create policy "whs report incidents" on public.whs_incidents for insert to authenticated
  with check (public.whs_is_member());
create policy "whs office update incidents" on public.whs_incidents for update to authenticated
  using (public.whs_is_office()) with check (public.whs_is_office());
create policy "whs officer delete incidents" on public.whs_incidents for delete to authenticated
  using (public.whs_is_officer() and not notifiable);

drop policy if exists "whs read hazards" on public.whs_hazards;
drop policy if exists "whs report hazards" on public.whs_hazards;
drop policy if exists "whs office update hazards" on public.whs_hazards;
drop policy if exists "whs officer delete hazards" on public.whs_hazards;
create policy "whs read hazards" on public.whs_hazards for select to authenticated
  using (public.whs_is_office() or (public.whs_is_member() and reported_by = auth.uid()));
create policy "whs report hazards" on public.whs_hazards for insert to authenticated
  with check (public.whs_is_member());
create policy "whs office update hazards" on public.whs_hazards for update to authenticated
  using (public.whs_is_office()) with check (public.whs_is_office());
create policy "whs officer delete hazards" on public.whs_hazards for delete to authenticated
  using (public.whs_is_officer());

drop policy if exists "whs read actions" on public.whs_actions;
drop policy if exists "whs office add actions" on public.whs_actions;
drop policy if exists "whs update actions" on public.whs_actions;
drop policy if exists "whs officer delete actions" on public.whs_actions;
create policy "whs read actions" on public.whs_actions for select to authenticated
  using (public.whs_is_office() or (public.whs_is_member() and owner_id = auth.uid()));
create policy "whs office add actions" on public.whs_actions for insert to authenticated
  with check (public.whs_is_office());
create policy "whs update actions" on public.whs_actions for update to authenticated
  using (public.whs_is_office() or (public.whs_is_member() and owner_id = auth.uid()))
  with check (public.whs_is_office() or (public.whs_is_member() and owner_id = auth.uid()));
create policy "whs officer delete actions" on public.whs_actions for delete to authenticated
  using (public.whs_is_officer());

-- History: office roles read it; nobody writes it except the database itself.
drop policy if exists "whs office read history" on public.whs_history;
create policy "whs office read history" on public.whs_history for select to authenticated
  using (public.whs_is_office());
revoke insert, update, delete on public.whs_history from anon, authenticated;

grant select, insert, update, delete on public.whs_incidents, public.whs_hazards, public.whs_actions to authenticated;
grant select on public.whs_history to authenticated;
grant usage on sequence public.whs_incident_ref_seq, public.whs_hazard_ref_seq to authenticated;

-- 5. Photos: a private bucket --------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('whs-photos', 'whs-photos', false)
on conflict (id) do update set public = false;

drop policy if exists "whs read photos" on storage.objects;
drop policy if exists "whs upload photos" on storage.objects;
drop policy if exists "whs officer delete photos" on storage.objects;
create policy "whs read photos" on storage.objects for select to authenticated
  using (bucket_id = 'whs-photos' and (public.whs_is_office() or owner = auth.uid()));
create policy "whs upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'whs-photos' and public.whs_is_member());
create policy "whs officer delete photos" on storage.objects for delete to authenticated
  using (bucket_id = 'whs-photos' and public.whs_is_officer());

commit;

-- CHECK IT WORKED (optional):
--   select ref, type, status from public.whs_incidents;   -- empty, no error
--   select id, public from storage.buckets where id = 'whs-photos';   -- public must be false
