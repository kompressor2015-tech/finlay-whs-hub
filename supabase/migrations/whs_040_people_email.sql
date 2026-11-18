-- whs_040_people_email.sql
-- Work email on each person's file (used to send reminders such as online training). Safe to run more than once.
begin;
alter table public.whs_people add column if not exists email text not null default '';
commit;
notify pgrst, 'reload schema';
