-- WHS app step 16: recurring checks (fire extinguishers, first aid kits, emergency lighting,
-- evacuation drills and so on), set up per site, with a log of every time one was done.
-- A check says how often it is due and where the rule comes from. A line in the log says when it
-- was done, by whom (staff or a contractor), the result, and can hold the certificate or report.
-- Log lines cannot be edited. Only an administrator can remove one (entered by mistake).
-- Safe to re-run. Back up first as usual.

begin;

create table if not exists public.whs_recurring_checks (
  id             uuid primary key default gen_random_uuid(),
  site_id        text not null references public.whs_sites (id),
  name           text not null,
  category       text not null default '',
  interval_months int not null check (interval_months between 1 and 120),
  basis          text not null default '',
  rule_confirmed boolean not null default false,
  first_due      date,
  notes          text not null default '',
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid()
);
create index if not exists whs_recurring_checks_site_idx on public.whs_recurring_checks (site_id) where active;

create table if not exists public.whs_recurring_check_log (
  id             uuid primary key default gen_random_uuid(),
  check_id       uuid not null references public.whs_recurring_checks (id) on delete cascade,
  done_on        date not null,
  done_by_kind   text not null default 'staff' check (done_by_kind in ('staff', 'contractor')),
  done_by_name   text not null default '',
  company        text not null default '',
  result         text not null default 'passed' check (result in ('passed', 'failed')),
  notes          text not null default '',
  file_path      text,
  file_name      text,
  action_id      uuid,
  recorded_by_name text not null default '',
  created_at     timestamptz not null default now()
);
create index if not exists whs_recurring_check_log_idx on public.whs_recurring_check_log (check_id, done_on desc);

create or replace function public.whs_check_log_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.recorded_by_name := public.whs_actor_name();
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists whs_check_log_stamps on public.whs_recurring_check_log;
create trigger whs_check_log_stamps before insert on public.whs_recurring_check_log
  for each row execute function public.whs_check_log_stamps();

alter table public.whs_recurring_checks enable row level security;
alter table public.whs_recurring_check_log enable row level security;

drop policy if exists "whs read recurring checks" on public.whs_recurring_checks;
drop policy if exists "whs office add recurring checks" on public.whs_recurring_checks;
drop policy if exists "whs office edit recurring checks" on public.whs_recurring_checks;
drop policy if exists "whs admin delete recurring checks" on public.whs_recurring_checks;
create policy "whs read recurring checks" on public.whs_recurring_checks for select to authenticated using (public.whs_is_member());
create policy "whs office add recurring checks" on public.whs_recurring_checks for insert to authenticated with check (public.whs_is_office());
create policy "whs office edit recurring checks" on public.whs_recurring_checks for update to authenticated using (public.whs_is_office()) with check (public.whs_is_office());
create policy "whs admin delete recurring checks" on public.whs_recurring_checks for delete to authenticated using (public.whs_is_admin());

drop policy if exists "whs read check log" on public.whs_recurring_check_log;
drop policy if exists "whs office add check log" on public.whs_recurring_check_log;
drop policy if exists "whs admin delete check log" on public.whs_recurring_check_log;
create policy "whs read check log" on public.whs_recurring_check_log for select to authenticated using (public.whs_is_member());
create policy "whs office add check log" on public.whs_recurring_check_log for insert to authenticated with check (public.whs_is_office());
create policy "whs admin delete check log" on public.whs_recurring_check_log for delete to authenticated using (public.whs_is_admin());

revoke all on public.whs_recurring_checks, public.whs_recurring_check_log from anon;
revoke update on public.whs_recurring_check_log from authenticated;
grant select, insert, update on public.whs_recurring_checks to authenticated;
grant select, insert, delete on public.whs_recurring_check_log to authenticated;
grant delete on public.whs_recurring_checks to authenticated;

-- Certificates and reports (office read and upload, WHS officer delete)
insert into storage.buckets (id, name, public) values ('whs-check-files', 'whs-check-files', false)
on conflict (id) do update set public = false;

drop policy if exists "whs office read check files" on storage.objects;
drop policy if exists "whs office upload check files" on storage.objects;
drop policy if exists "whs officer delete check files" on storage.objects;
create policy "whs office read check files" on storage.objects for select to authenticated
  using (bucket_id = 'whs-check-files' and public.whs_is_office());
create policy "whs office upload check files" on storage.objects for insert to authenticated
  with check (bucket_id = 'whs-check-files' and public.whs_is_office());
create policy "whs officer delete check files" on storage.objects for delete to authenticated
  using (bucket_id = 'whs-check-files' and public.whs_is_officer());

notify pgrst, 'reload schema';
commit;
