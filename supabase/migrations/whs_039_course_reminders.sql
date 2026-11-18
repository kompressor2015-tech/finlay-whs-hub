-- whs_039_course_reminders.sql
-- "Reminder sent" tick for company-wide courses (Training & site cover): who has been emailed, and when.
-- One row per person and course. Ticking adds it, un-ticking deletes it. Safe to run more than once.

begin;

create table if not exists public.whs_course_reminders (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references public.whs_people (id) on delete cascade,
  course       text not null,
  sent_at      timestamptz not null default now(),
  sent_by_name text not null default ''
);
create unique index if not exists whs_course_reminders_uq on public.whs_course_reminders (person_id, lower(course));

create or replace function public.whs_course_reminder_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.sent_by_name := public.whs_actor_name();
  if tg_op = 'INSERT' then new.sent_at := coalesce(new.sent_at, now()); else new.sent_at := old.sent_at; end if;
  return new;
end;
$$;
drop trigger if exists whs_course_reminder_stamps on public.whs_course_reminders;
create trigger whs_course_reminder_stamps before insert or update on public.whs_course_reminders
  for each row execute function public.whs_course_reminder_stamps();

alter table public.whs_course_reminders enable row level security;
drop policy if exists "whs office read course reminders" on public.whs_course_reminders;
drop policy if exists "whs office add course reminders" on public.whs_course_reminders;
drop policy if exists "whs office delete course reminders" on public.whs_course_reminders;
create policy "whs office read course reminders" on public.whs_course_reminders for select to authenticated using (public.whs_is_office());
create policy "whs office add course reminders" on public.whs_course_reminders for insert to authenticated with check (public.whs_is_office());
create policy "whs office delete course reminders" on public.whs_course_reminders for delete to authenticated using (public.whs_is_office());
revoke all on public.whs_course_reminders from anon;
grant select, insert, delete on public.whs_course_reminders to authenticated;

commit;

notify pgrst, 'reload schema';
