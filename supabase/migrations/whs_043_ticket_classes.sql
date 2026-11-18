-- whs_043_ticket_classes.sql
-- A ticket can list the classes it covers (a high risk work licence card shows forklift, dogging, rigging
-- and so on, all with one number and one expiry). Safe to run more than once.
begin;
alter table public.whs_person_tickets add column if not exists classes text[] not null default '{}';
commit;
notify pgrst, 'reload schema';
