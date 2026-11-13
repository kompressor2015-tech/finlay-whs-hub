-- ==============================================================================
-- FINLAY WHS - MIGRATION whs_015: TICKETS AND TRAINING, SITE ROLES, ARCHIVING PEOPLE
-- ==============================================================================
-- Adds, to the people table: first aider and fire warden flags, and archiving
-- (someone who has left drops out of lists and reminders but nothing is deleted).
-- Adds the tickets and training table (first aid, CPR, fire warden, licences...) with
-- expiry dates and the certificate file, and a private store for the certificates.
-- Office roles read and add; only the WHS officer and admins archive or delete.
-- Safe to run again.
-- ==============================================================================

begin;

alter table public.whs_people add column if not exists is_first_aider boolean not null default false;
alter table public.whs_people add column if not exists is_fire_warden boolean not null default false;
alter table public.whs_people add column if not exists warden_role text not null default '';
alter table public.whs_people add column if not exists left_on date;
alter table public.whs_people add column if not exists archived_at timestamptz;
alter table public.whs_people add column if not exists archived_by_name text not null default '';

alter table public.whs_people drop constraint if exists whs_people_warden_role_check;
alter table public.whs_people add constraint whs_people_warden_role_check check (warden_role in ('', 'chief', 'warden'));

-- Archiving: active goes false, and the database stamps who and when. Only the WHS officer and
-- admins can archive, bring back, or change the site roles.
create or replace function public.whs_people_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.active is distinct from old.active
       or new.is_first_aider is distinct from old.is_first_aider
       or new.is_fire_warden is distinct from old.is_fire_warden
       or new.warden_role is distinct from old.warden_role then
      if not public.whs_is_officer() then
        raise exception 'Only the WHS officer or an administrator can archive people or set site roles';
      end if;
    end if;
    if old.active and not new.active then
      new.archived_at := now();
      new.archived_by_name := public.whs_actor_name();
      new.is_first_aider := false;
      new.is_fire_warden := false;
      new.warden_role := '';
    elsif not old.active and new.active then
      new.archived_at := null;
      new.archived_by_name := '';
      new.left_on := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists whs_people_stamps on public.whs_people;
create trigger whs_people_stamps before update on public.whs_people
  for each row execute function public.whs_people_stamps();

-- Tickets and training -----------------------------------------------------------------------

create table if not exists public.whs_person_tickets (
  id               uuid primary key default gen_random_uuid(),
  person_id        uuid not null references public.whs_people (id) on delete cascade,
  name             text not null check (length(trim(name)) > 0),
  number           text not null default '',
  issued_on        date,
  expires_on       date,                       -- null = does not expire
  provider         text not null default '',   -- who trained or issued it (training company, contractor)
  file_path        text not null default '',
  file_name        text not null default '',
  notes            text not null default '',
  created_by_name  text not null default '',
  created_at       timestamptz not null default now()
);
create index if not exists whs_person_tickets_person_idx on public.whs_person_tickets (person_id, name, issued_on desc);
create index if not exists whs_person_tickets_expiry_idx on public.whs_person_tickets (expires_on);

create or replace function public.whs_ticket_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_name := public.whs_actor_name();
    new.created_at := now();
  else
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
    new.person_id := old.person_id;
  end if;
  return new;
end;
$$;
drop trigger if exists whs_ticket_stamps on public.whs_person_tickets;
create trigger whs_ticket_stamps before insert or update on public.whs_person_tickets
  for each row execute function public.whs_ticket_stamps();

alter table public.whs_person_tickets enable row level security;
drop policy if exists "whs office read tickets" on public.whs_person_tickets;
drop policy if exists "whs office add tickets" on public.whs_person_tickets;
drop policy if exists "whs office change tickets" on public.whs_person_tickets;
drop policy if exists "whs officer delete tickets" on public.whs_person_tickets;
create policy "whs office read tickets" on public.whs_person_tickets for select to authenticated using (public.whs_is_office());
create policy "whs office add tickets" on public.whs_person_tickets for insert to authenticated with check (public.whs_is_office());
create policy "whs office change tickets" on public.whs_person_tickets for update to authenticated using (public.whs_is_office()) with check (public.whs_is_office());
create policy "whs officer delete tickets" on public.whs_person_tickets for delete to authenticated using (public.whs_is_officer());
grant select, insert, update, delete on public.whs_person_tickets to authenticated;

-- Private store for the certificates ----------------------------------------------------------

insert into storage.buckets (id, name, public) values ('whs-training-files', 'whs-training-files', false)
on conflict (id) do update set public = false;

drop policy if exists "whs office read training files" on storage.objects;
drop policy if exists "whs office upload training files" on storage.objects;
drop policy if exists "whs officer delete training files" on storage.objects;
create policy "whs office read training files" on storage.objects for select to authenticated
  using (bucket_id = 'whs-training-files' and public.whs_is_office());
create policy "whs office upload training files" on storage.objects for insert to authenticated
  with check (bucket_id = 'whs-training-files' and public.whs_is_office());
create policy "whs officer delete training files" on storage.objects for delete to authenticated
  using (bucket_id = 'whs-training-files' and public.whs_is_officer());

notify pgrst, 'reload schema';
commit;
