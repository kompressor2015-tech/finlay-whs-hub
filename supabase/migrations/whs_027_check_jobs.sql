-- whs_027_check_jobs.sql
-- Repair and follow-up work that comes out of a check (for example the Somerton racking repairs):
-- the quote (amount, file), who approved it, the PO number, when it is booked and when it is done.
-- Also: spill kit service interval confirmed as 12 months. Loads the Bowen Storage repair proposal.
-- Safe to run more than once.

begin;

create table if not exists public.whs_check_jobs (
  id               uuid primary key default gen_random_uuid(),
  check_id         uuid not null references public.whs_recurring_checks (id) on delete cascade,
  title            text not null,
  supplier         text not null default '',
  quote_ref        text not null default '',
  quote_amount     numeric(12,2),
  po_number        text not null default '',
  status           text not null default 'quoted' check (status in ('quoted', 'approved', 'po_raised', 'done', 'cancelled')),
  booked_for       date,
  approved_by_name text not null default '',
  approved_on      date,
  notes            text not null default '',
  file_path        text,
  file_name        text,
  created_by_name  text not null default '',
  created_at       timestamptz not null default now()
);
create index if not exists whs_check_jobs_check_idx on public.whs_check_jobs (check_id);

create or replace function public.whs_check_job_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_name := case when auth.uid() is null then new.created_by_name else public.whs_actor_name() end;
    new.created_at := now();
    if auth.uid() is not null and new.status <> 'quoted' and not public.whs_is_officer() then
      raise exception 'Only a WHS officer can approve a quote.';
    end if;
  else
    new.check_id := old.check_id;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
    new.approved_by_name := old.approved_by_name;
    new.approved_on := old.approved_on;
    if old.status = 'quoted' and new.status in ('approved', 'po_raised', 'done') then
      if not public.whs_is_officer() then raise exception 'Only a WHS officer can approve a quote.'; end if;
      new.approved_by_name := public.whs_actor_name();
      new.approved_on := (now() at time zone 'Australia/Brisbane')::date;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists whs_check_job_stamps on public.whs_check_jobs;
create trigger whs_check_job_stamps before insert or update on public.whs_check_jobs
  for each row execute function public.whs_check_job_stamps();

alter table public.whs_check_jobs enable row level security;
drop policy if exists "whs office read check jobs" on public.whs_check_jobs;
drop policy if exists "whs office add check jobs" on public.whs_check_jobs;
drop policy if exists "whs office change check jobs" on public.whs_check_jobs;
drop policy if exists "whs admin delete check jobs" on public.whs_check_jobs;
create policy "whs office read check jobs" on public.whs_check_jobs for select to authenticated using (public.whs_is_office());
create policy "whs office add check jobs" on public.whs_check_jobs for insert to authenticated with check (public.whs_is_office());
create policy "whs office change check jobs" on public.whs_check_jobs for update to authenticated using (public.whs_is_office()) with check (public.whs_is_office());
create policy "whs admin delete check jobs" on public.whs_check_jobs for delete to authenticated using (public.whs_is_admin());
revoke all on public.whs_check_jobs from anon;
grant select, insert, update, delete on public.whs_check_jobs to authenticated;

-- Spill kit service: 12 months confirmed
update public.whs_recurring_checks
   set rule_confirmed = true, basis = 'Contractor compliance service of the site spill kits (EcoSpill), every 12 months.'
 where lower(name) = 'spill kit service';

-- Somerton racking repairs (Bowen Storage proposal PRM56999), PO raised, date to be confirmed
insert into public.whs_check_jobs (check_id, title, supplier, quote_ref, quote_amount, po_number, status, notes)
select c.id, 'Rack repairs from the October 2026 inspection', 'Bowen Storage', 'PRM56999', 6098.64, '', 'po_raised',
       '$6,098.64 incl GST. 50% progress claim and 50% on completion. PO raised by Finlay, PO number and booked date to be added. Covers the 8 amber findings in report RSIM01605.'
from public.whs_recurring_checks c
where c.site_id = 'somerton' and lower(c.name) = 'racking inspection'
  and not exists (select 1 from public.whs_check_jobs j where j.check_id = c.id and j.quote_ref = 'PRM56999');

notify pgrst, 'reload schema';
commit;
