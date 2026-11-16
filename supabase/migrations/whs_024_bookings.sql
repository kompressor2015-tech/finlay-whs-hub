-- whs_024_bookings.sql
-- 1. Bookings: a date booked for a recurring check or for a person's ticket/training that is due or expired
--    (who is doing it, a reference, notes). A booking is open until the work is recorded or it is cancelled.
-- 2. Starts the two contractor checks the owner supplied reports for, with their history:
--      Somerton: annual racking inspection, Bowen Storage, 6/10/2026 (report RSIM01605, proposal PRM56999)
--      Burpengary: spill kit compliance service, EcoSpill, 6/11/2026 (case 5702, 2 kits)
-- 3. Adds the 8 amber findings from the Somerton rack report as actions.
-- Safe to run more than once.

begin;

create table if not exists public.whs_bookings (
  id               uuid primary key default gen_random_uuid(),
  subject_type     text not null check (subject_type in ('check', 'ticket')),
  check_id         uuid references public.whs_recurring_checks (id) on delete cascade,
  person_id        uuid references public.whs_people (id) on delete cascade,
  ticket_name      text not null default '',
  booked_for       date not null,
  provider         text not null default '',
  reference        text not null default '',
  notes            text not null default '',
  status           text not null default 'booked' check (status in ('booked', 'cancelled')),
  created_by_name  text not null default '',
  created_at       timestamptz not null default now(),
  constraint whs_bookings_subject check (
    (subject_type = 'check' and check_id is not null) or
    (subject_type = 'ticket' and person_id is not null and length(trim(ticket_name)) > 0))
);
create index if not exists whs_bookings_check_idx on public.whs_bookings (check_id) where status = 'booked';
create index if not exists whs_bookings_person_idx on public.whs_bookings (person_id, ticket_name) where status = 'booked';

create or replace function public.whs_booking_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_name := public.whs_actor_name();
    new.created_at := now();
  else
    -- only the booking details and status can change
    new.subject_type := old.subject_type;
    new.check_id := old.check_id;
    new.person_id := old.person_id;
    new.ticket_name := old.ticket_name;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
drop trigger if exists whs_booking_stamps on public.whs_bookings;
create trigger whs_booking_stamps before insert or update on public.whs_bookings
  for each row execute function public.whs_booking_stamps();

alter table public.whs_bookings enable row level security;
drop policy if exists "whs office read bookings" on public.whs_bookings;
drop policy if exists "whs office add bookings" on public.whs_bookings;
drop policy if exists "whs office change bookings" on public.whs_bookings;
drop policy if exists "whs admin delete bookings" on public.whs_bookings;
create policy "whs office read bookings" on public.whs_bookings for select to authenticated using (public.whs_is_office());
create policy "whs office add bookings" on public.whs_bookings for insert to authenticated with check (public.whs_is_office());
create policy "whs office change bookings" on public.whs_bookings for update to authenticated using (public.whs_is_office()) with check (public.whs_is_office());
create policy "whs admin delete bookings" on public.whs_bookings for delete to authenticated using (public.whs_is_admin());
revoke all on public.whs_bookings from anon;
grant select, insert, update, delete on public.whs_bookings to authenticated;

-- Somerton racking inspection --------------------------------------------------------------
insert into public.whs_recurring_checks (site_id, name, category, interval_months, basis, rule_confirmed, notes)
select 'somerton', 'Racking inspection', 'Storage', 12,
       'Annual inspection by the racking contractor (Bowen Storage report: "Annual Inspection 2026"). Interval to confirm against AS 4084.', false,
       'Contractor: Bowen Storage. 66-72 Freight Drive, Somerton.'
where exists (select 1 from public.whs_sites where id = 'somerton')
  and not exists (select 1 from public.whs_recurring_checks where site_id = 'somerton' and lower(name) = 'racking inspection');

insert into public.whs_recurring_check_log (check_id, done_on, done_by_kind, done_by_name, company, result, notes)
select c.id, date '2026-10-06', 'contractor', '', 'Bowen Storage', 'passed',
       'Report RSIM01605: annual inspection, 8 amber findings, none red. Repairs quoted in proposal PRM56999 ($6,098.64 incl GST, 50% progress claim and 50% on completion), not yet signed off. Each finding is an action. Report and proposal to be attached.'
from public.whs_recurring_checks c
where c.site_id = 'somerton' and lower(c.name) = 'racking inspection'
  and not exists (select 1 from public.whs_recurring_check_log l where l.check_id = c.id and l.done_on = date '2026-10-06');

-- Burpengary spill kit service -------------------------------------------------------------
insert into public.whs_recurring_checks (site_id, name, category, interval_months, basis, rule_confirmed, notes)
select 'burpengary', 'Spill kit service', 'Emergency', 12,
       'Contractor compliance service of the site spill kits (EcoSpill). Interval to confirm.', false,
       'Contractor: EcoSpill. Two kits at Burpengary: oil and fuel (hydrocarbon) and general purpose.'
where exists (select 1 from public.whs_sites where id = 'burpengary')
  and not exists (select 1 from public.whs_recurring_checks where site_id = 'burpengary' and lower(name) = 'spill kit service');

insert into public.whs_recurring_check_log (check_id, done_on, done_by_kind, done_by_name, company, result, notes)
select c.id, date '2026-11-06', 'contractor', 'Aaron Halpin', 'EcoSpill', 'passed',
       'Case 5702 (task 92880): on-site spill kit compliance service, assess, recondition and replenish, 2 kits (oil and fuel, general purpose). Signed off by Wayne Jones. Service report to be attached.'
from public.whs_recurring_checks c
where c.site_id = 'burpengary' and lower(c.name) = 'spill kit service'
  and not exists (select 1 from public.whs_recurring_check_log l where l.check_id = c.id and l.done_on = date '2026-11-06');

-- The 8 amber findings from the Somerton rack report, as actions -----------------------------
insert into public.whs_actions (title, source_type, source_ref, due, created_by)
select v.title, 'other', 'Rack inspection RSIM01605 · Somerton · amber', date '2026-12-16',
       coalesce(auth.uid(), (select id from public.profiles order by id limit 1))
from (values
  ('Racking: install orange upright protector 400mm, Run 1 Fr2 (recommendation)'),
  ('Racking: install 4 orange upright protectors 400mm, Run 2 Fr2-5 (recommendation)'),
  ('Racking: replace damaged Stow upright 12 6250mm high, Run 2 Fr5'),
  ('Racking: install orange upright protector 400mm, Run 3 Fr2 (recommendation)'),
  ('Racking: secure top pallet loads, Run 3 B2 L5 RHS; end frame height must cover at least 50% of top pallet loads (refit)'),
  ('Racking: install orange upright protector 400mm, Run 4 Fr2 (recommendation)'),
  ('Racking: store non-AS pallets on mesh decks or AS slave pallets, Run 7 B5 L3 (refit)'),
  ('Racking: install monkey mesh backing, Run 7 bays 1-5 (neighbour fence and driveway), 2700mm high from 2250mm (recommendation)')
) as v(title)
where exists (select 1 from public.profiles)
  and not exists (select 1 from public.whs_actions a where a.title = v.title and a.source_ref like 'Rack inspection RSIM01605%');

notify pgrst, 'reload schema';
commit;
