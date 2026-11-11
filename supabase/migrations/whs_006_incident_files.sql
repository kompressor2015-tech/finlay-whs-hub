-- WHS app, step 6: the incident file
-- A full file for each incident: the people on it, a six-part investigation, and, for injuries,
-- the injury management trail for each injured person (claim, medical certificates, return to
-- work plan, contacts, correspondence and documents) for QLD, VIC and NSW.
--
--   whs_people                : one row per worker (Finlay employee), reused across incidents
--   whs_incident_people       : who was on an incident and in what role (injured, witness ...)
--   whs_incident_evidence     : photos, CCTV, sketches and other evidence, with files
--   whs_incident_statements   : statements asked for and received, with the signed copy
--   whs_incident_timeline     : what happened, step by step
--   whs_claims                : one claim per injured person per incident
--   whs_claim_certificates    : medical certificates
--   whs_claim_rtw_stages      : return to work stages
--   whs_claim_contacts        : doctor, physio, claim manager, return to work coordinator
--   whs_claim_log             : calls, emails and letters, with files
--   whs_claim_documents       : everything else filed against the claim
--   whs_claim_access_log      : who opened a claim file, and when
--   storage buckets whs-incident-files (office) and whs-claim-files (WHS officer and admins)
--
-- Who can do what:
--   Office roles (admin, WHS officer, supervisor) read and write the incident file and
--   investigation. The WHS officer and admins can delete.
--   Only the WHS officer and admins can see or change anything about a claim: the claim itself,
--   certificates, return to work, contacts, correspondence and documents. Supervisors cannot see
--   that a claim exists. Claim history and file views are logged by the database.
--   Closing an injury or notifiable incident needs all six investigation parts ticked and any
--   claim closed (or rejected).
-- Safe to run more than once. Only adds new whs_ objects and replaces two functions/policies.

-- 1. People -----------------------------------------------------------------------

create table if not exists public.whs_people (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(trim(name)) > 0),
  position          text not null default '',
  site_id           text references public.whs_sites (id),
  phone             text not null default '',
  emergency_contact text not null default '',
  profile_id        uuid references public.profiles (id) on delete set null,
  start_date        date,
  notes             text not null default '',
  active            boolean not null default true,
  created_by_name   text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists whs_people_name_idx on public.whs_people (lower(name));

-- 2. Extra columns on incidents and actions -----------------------------------------

alter table public.whs_incidents add column if not exists immediate_cause text not null default '';
alter table public.whs_incidents add column if not exists root_cause text not null default '';
alter table public.whs_incidents add column if not exists findings text not null default '';
alter table public.whs_incidents add column if not exists parts_done text[] not null default '{}';
alter table public.whs_incidents add column if not exists investigation_signed_by_name text not null default '';
alter table public.whs_incidents add column if not exists investigation_signed_at timestamptz;
alter table public.whs_incidents add column if not exists reviewed_by_name text not null default '';
alter table public.whs_incidents add column if not exists reviewed_at timestamptz;
alter table public.whs_incidents add column if not exists crew_briefed_on date;
alter table public.whs_incidents drop constraint if exists whs_incidents_parts_done_check;
alter table public.whs_incidents add constraint whs_incidents_parts_done_check
  check (parts_done <@ array['evidence', 'statements', 'timeline', 'why', 'findings', 'signoff']);

alter table public.whs_actions add column if not exists control_level text not null default '';
alter table public.whs_actions drop constraint if exists whs_actions_control_level_check;
alter table public.whs_actions add constraint whs_actions_control_level_check
  check (control_level in ('', 'eliminate', 'substitute', 'engineer', 'administrative', 'ppe'));

-- 3. Incident file tables ------------------------------------------------------------

create table if not exists public.whs_incident_people (
  id              uuid primary key default gen_random_uuid(),
  incident_id     uuid not null references public.whs_incidents (id) on delete cascade,
  person_id       uuid references public.whs_people (id) on delete set null,
  name            text not null check (length(trim(name)) > 0),
  role            text not null default 'involved' check (role in ('injured', 'witness', 'involved', 'first_aider', 'supervisor')),
  employer        text not null default 'Finlay',
  phone           text not null default '',
  notes           text not null default '',
  body_part       text not null default '',
  injury_nature   text not null default '',
  mechanism       text not null default '',
  treatment       text not null default '' check (treatment in ('', 'none', 'first_aid', 'doctor', 'hospital')),
  off_work_from   date,
  returned_on     date,
  created_by_name text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists whs_incident_people_incident_idx on public.whs_incident_people (incident_id);
create index if not exists whs_incident_people_person_idx on public.whs_incident_people (person_id);

create table if not exists public.whs_incident_evidence (
  id              uuid primary key default gen_random_uuid(),
  incident_id     uuid not null references public.whs_incidents (id) on delete cascade,
  kind            text not null default 'other' check (kind in ('photo', 'cctv', 'document', 'sketch', 'measurement', 'equipment', 'other')),
  description     text not null check (length(trim(description)) > 0),
  file_path       text not null default '',
  file_name       text not null default '',
  created_by_name text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists whs_incident_evidence_idx on public.whs_incident_evidence (incident_id, created_at);

create table if not exists public.whs_incident_statements (
  id              uuid primary key default gen_random_uuid(),
  incident_id     uuid not null references public.whs_incidents (id) on delete cascade,
  person_id       uuid references public.whs_people (id) on delete set null,
  name            text not null check (length(trim(name)) > 0),
  role            text not null default '',
  status          text not null default 'requested' check (status in ('requested', 'received', 'signed')),
  requested_on    date not null default current_date,
  file_path       text not null default '',
  file_name       text not null default '',
  notes           text not null default '',
  created_by_name text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists whs_incident_statements_idx on public.whs_incident_statements (incident_id, created_at);

create table if not exists public.whs_incident_timeline (
  id              uuid primary key default gen_random_uuid(),
  incident_id     uuid not null references public.whs_incidents (id) on delete cascade,
  happened_at     timestamptz not null,
  what            text not null check (length(trim(what)) > 0),
  created_by_name text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists whs_incident_timeline_idx on public.whs_incident_timeline (incident_id, happened_at);

-- 4. Claim tables (WHS officer and admins only) -----------------------------------------

create table if not exists public.whs_claims (
  id                  uuid primary key default gen_random_uuid(),
  incident_id         uuid not null references public.whs_incidents (id) on delete cascade,
  person_id           uuid not null references public.whs_people (id) on delete restrict,
  state               text not null check (state in ('QLD', 'VIC', 'NSW')),
  insurer             text not null default '',
  claim_no            text not null default '',
  status              text not null default 'not_lodged' check (status in ('not_lodged', 'lodged', 'accepted', 'rejected', 'under_review', 'closed')),
  injury_date         date,
  insurer_notified_at date,
  claim_lodged_on     date,
  decision_on         date,
  claim_manager_name  text not null default '',
  claim_manager_phone text not null default '',
  claim_manager_email text not null default '',
  excess_note         text not null default '',
  rtw_coordinator     text not null default '',
  rtw_status          text not null default 'none' check (rtw_status in ('none', 'draft', 'agreed', 'in_progress', 'complete')),
  rtw_goal            text not null default '',
  rtw_goal_date       date,
  rtw_next_review     date,
  off_work_from       date,
  returned_on         date,
  closed_on           date,
  steps               jsonb not null default '{}'::jsonb,
  notes               text not null default '',
  created_by_name     text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (incident_id, person_id)
);
create index if not exists whs_claims_person_idx on public.whs_claims (person_id);

create table if not exists public.whs_claim_certificates (
  id              uuid primary key default gen_random_uuid(),
  claim_id        uuid not null references public.whs_claims (id) on delete cascade,
  from_date       date not null,
  to_date         date not null,
  doctor_name     text not null default '',
  capacity        text not null default 'unfit' check (capacity in ('unfit', 'partial', 'fit')),
  restrictions    text not null default '',
  file_path       text not null default '',
  file_name       text not null default '',
  created_by_name text not null default '',
  created_at      timestamptz not null default now(),
  check (to_date >= from_date)
);
create index if not exists whs_claim_certificates_idx on public.whs_claim_certificates (claim_id, from_date);

create table if not exists public.whs_claim_rtw_stages (
  id              uuid primary key default gen_random_uuid(),
  claim_id        uuid not null references public.whs_claims (id) on delete cascade,
  stage_no        integer not null check (stage_no > 0),
  duties          text not null default '',
  hours           text not null default '',
  starts_on       date,
  status          text not null default 'planned' check (status in ('planned', 'current', 'done')),
  created_by_name text not null default '',
  created_at      timestamptz not null default now(),
  unique (claim_id, stage_no)
);

create table if not exists public.whs_claim_contacts (
  id              uuid primary key default gen_random_uuid(),
  claim_id        uuid not null references public.whs_claims (id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  role            text not null default '',
  org             text not null default '',
  phone           text not null default '',
  email           text not null default '',
  created_by_name text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists whs_claim_contacts_idx on public.whs_claim_contacts (claim_id);

create table if not exists public.whs_claim_log (
  id              uuid primary key default gen_random_uuid(),
  claim_id        uuid not null references public.whs_claims (id) on delete cascade,
  kind            text not null check (kind in ('call', 'meeting', 'email_in', 'email_out', 'letter_in', 'letter_out', 'form', 'note')),
  with_whom       text not null default '',
  what            text not null check (length(trim(what)) > 0),
  happened_at     timestamptz not null default now(),
  file_path       text not null default '',
  file_name       text not null default '',
  created_by_name text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists whs_claim_log_idx on public.whs_claim_log (claim_id, happened_at desc);

create table if not exists public.whs_claim_documents (
  id              uuid primary key default gen_random_uuid(),
  claim_id        uuid not null references public.whs_claims (id) on delete cascade,
  category        text not null default 'other' check (category in ('claim_forms', 'medical', 'return_to_work', 'insurer', 'worker', 'other')),
  title           text not null check (length(trim(title)) > 0),
  file_path       text not null,
  file_name       text not null default '',
  created_by_name text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists whs_claim_documents_idx on public.whs_claim_documents (claim_id, created_at desc);

create table if not exists public.whs_claim_access_log (
  id         bigint generated always as identity primary key,
  person_id  uuid,
  claim_id   uuid,
  what       text not null,
  actor_id   uuid not null default auth.uid(),
  actor_name text not null default '',
  at         timestamptz not null default now()
);
create index if not exists whs_claim_access_log_idx on public.whs_claim_access_log (person_id, at desc);

-- 5. Stamps: who and when are filled in by the database, never by the browser ------------

create or replace function public.whs_stamp_created()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by_name := public.whs_actor_name();
  else
    new.created_at := old.created_at;
    new.created_by_name := old.created_by_name;
  end if;
  return new;
end;
$$;

create or replace function public.whs_stamp_created_updated()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by_name := public.whs_actor_name();
  else
    new.created_at := old.created_at;
    new.created_by_name := old.created_by_name;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['whs_incident_people', 'whs_incident_evidence', 'whs_incident_statements', 'whs_incident_timeline',
                           'whs_claim_certificates', 'whs_claim_rtw_stages', 'whs_claim_contacts', 'whs_claim_log', 'whs_claim_documents']
  loop
    execute format('drop trigger if exists whs_stamp_created on public.%I', t);
    execute format('create trigger whs_stamp_created before insert or update on public.%I for each row execute function public.whs_stamp_created()', t);
  end loop;
  foreach t in array array['whs_people', 'whs_claims']
  loop
    execute format('drop trigger if exists whs_stamp_created on public.%I', t);
    execute format('create trigger whs_stamp_created before insert or update on public.%I for each row execute function public.whs_stamp_created_updated()', t);
  end loop;
end $$;

create or replace function public.whs_access_log_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.actor_id := auth.uid();
  new.actor_name := public.whs_actor_name();
  new.at := now();
  return new;
end;
$$;
drop trigger if exists whs_access_log_stamps on public.whs_claim_access_log;
create trigger whs_access_log_stamps before insert on public.whs_claim_access_log
  for each row execute function public.whs_access_log_stamps();

-- Claim history: written by the database. Read by the WHS officer and admins only.
create or replace function public.whs_claim_history()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.whs_log('claim', new.id, 'Claim file opened (' || new.state || ')');
    return new;
  end if;
  if new.status is distinct from old.status then
    perform public.whs_log('claim', new.id, 'Claim status: ' || replace(new.status, '_', ' '));
  end if;
  if new.rtw_status is distinct from old.rtw_status then
    perform public.whs_log('claim', new.id, 'Return to work: ' || replace(new.rtw_status, '_', ' '));
  end if;
  if new.returned_on is not null and old.returned_on is null then
    perform public.whs_log('claim', new.id, 'Returned to work');
  end if;
  return new;
end;
$$;
drop trigger if exists whs_claim_history on public.whs_claims;
create trigger whs_claim_history after insert or update on public.whs_claims
  for each row execute function public.whs_claim_history();

-- 6. Closing rule: injuries and notifiable incidents need the whole file done ----------------

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
      if new.type = 'injury' or cardinality(new.notifiable_reasons) > 0 then
        if (select count(distinct p) from unnest(new.parts_done) p) < 6 then
          raise exception 'Finish all six investigation parts before closing this incident';
        end if;
        if exists (select 1 from public.whs_claims c where c.incident_id = new.id and c.status not in ('closed', 'rejected')) then
          raise exception 'Close the claim before closing this incident';
        end if;
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

-- 7. Access rules ------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['whs_people', 'whs_incident_people', 'whs_incident_evidence', 'whs_incident_statements', 'whs_incident_timeline',
                           'whs_claims', 'whs_claim_certificates', 'whs_claim_rtw_stages', 'whs_claim_contacts', 'whs_claim_log',
                           'whs_claim_documents', 'whs_claim_access_log']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- People and the incident file: office roles read and write; WHS officer and admins delete
do $$
declare t text;
begin
  foreach t in array array['whs_people', 'whs_incident_people', 'whs_incident_evidence', 'whs_incident_statements', 'whs_incident_timeline']
  loop
    execute format('drop policy if exists "whs office read" on public.%I', t);
    execute format('drop policy if exists "whs office add" on public.%I', t);
    execute format('drop policy if exists "whs office change" on public.%I', t);
    execute format('drop policy if exists "whs officer delete" on public.%I', t);
    execute format('create policy "whs office read" on public.%I for select to authenticated using (public.whs_is_office())', t);
    execute format('create policy "whs office add" on public.%I for insert to authenticated with check (public.whs_is_office())', t);
    execute format('create policy "whs office change" on public.%I for update to authenticated using (public.whs_is_office()) with check (public.whs_is_office())', t);
    execute format('create policy "whs officer delete" on public.%I for delete to authenticated using (public.whs_is_officer())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Claims: WHS officer and admins only, for everything
do $$
declare t text;
begin
  foreach t in array array['whs_claims', 'whs_claim_certificates', 'whs_claim_rtw_stages', 'whs_claim_contacts', 'whs_claim_log', 'whs_claim_documents']
  loop
    execute format('drop policy if exists "whs officer all" on public.%I', t);
    execute format('create policy "whs officer all" on public.%I for all to authenticated using (public.whs_is_officer()) with check (public.whs_is_officer())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- The access log can be read and added to, never changed or removed
drop policy if exists "whs officer read access log" on public.whs_claim_access_log;
drop policy if exists "whs officer add access log" on public.whs_claim_access_log;
create policy "whs officer read access log" on public.whs_claim_access_log for select to authenticated using (public.whs_is_officer());
create policy "whs officer add access log" on public.whs_claim_access_log for insert to authenticated with check (public.whs_is_officer());
grant select, insert on public.whs_claim_access_log to authenticated;

-- History: office roles read it, except claim history, which is for the WHS officer and admins
drop policy if exists "whs office read history" on public.whs_history;
create policy "whs office read history" on public.whs_history for select to authenticated
  using (public.whs_is_office() and (record_type <> 'claim' or public.whs_is_officer()));

-- 8. Private stores for the files -----------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('whs-incident-files', 'whs-incident-files', false)
on conflict (id) do update set public = false;
insert into storage.buckets (id, name, public) values ('whs-claim-files', 'whs-claim-files', false)
on conflict (id) do update set public = false;

drop policy if exists "whs office read incident files" on storage.objects;
drop policy if exists "whs office upload incident files" on storage.objects;
drop policy if exists "whs officer delete incident files" on storage.objects;
create policy "whs office read incident files" on storage.objects for select to authenticated
  using (bucket_id = 'whs-incident-files' and public.whs_is_office());
create policy "whs office upload incident files" on storage.objects for insert to authenticated
  with check (bucket_id = 'whs-incident-files' and public.whs_is_office());
create policy "whs officer delete incident files" on storage.objects for delete to authenticated
  using (bucket_id = 'whs-incident-files' and public.whs_is_officer());

drop policy if exists "whs officer read claim files" on storage.objects;
drop policy if exists "whs officer upload claim files" on storage.objects;
drop policy if exists "whs officer delete claim files" on storage.objects;
create policy "whs officer read claim files" on storage.objects for select to authenticated
  using (bucket_id = 'whs-claim-files' and public.whs_is_officer());
create policy "whs officer upload claim files" on storage.objects for insert to authenticated
  with check (bucket_id = 'whs-claim-files' and public.whs_is_officer());
create policy "whs officer delete claim files" on storage.objects for delete to authenticated
  using (bucket_id = 'whs-claim-files' and public.whs_is_officer());
