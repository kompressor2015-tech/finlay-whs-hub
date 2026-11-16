-- whs_029_log_attach.sql
-- Lets the office attach (or replace) the report or certificate on a check history line after the
-- fact. Only the file columns can change; the date, result, who and notes stay locked.
-- Safe to run more than once.

begin;

drop policy if exists "whs office attach check log file" on public.whs_recurring_check_log;
create policy "whs office attach check log file" on public.whs_recurring_check_log
  for update to authenticated using (public.whs_is_office()) with check (public.whs_is_office());

grant update (file_path, file_name) on public.whs_recurring_check_log to authenticated;

notify pgrst, 'reload schema';
commit;
