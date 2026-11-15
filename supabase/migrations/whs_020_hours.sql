-- WHS app step 20: hours worked, for injury rates (LTIFR and TRIFR).
-- One row per site per month. Hours come from payroll: an imported file or typed totals.
-- The WHS officer and administrators enter and change hours; office roles read them.
-- Every change is kept in whs_hours_log so a figure can always be traced. Safe to re-run.

begin;

create table if not exists public.whs_hours (
  id              uuid primary key default gen_random_uuid(),
  site_id         text not null references public.whs_sites (id),
  month           date not null check (month = date_trunc('month', month)::date),   -- first day of the month
  hours           numeric(12,2) not null check (hours >= 0),
  source          text not null default 'typed' check (source in ('typed', 'payroll')),
  note            text not null default '',
  entered_by_name text not null default '',
  updated_at      timestamptz not null default now(),
  unique (site_id, month)
);

create table if not exists public.whs_hours_log (
  id          bigint generated always as identity primary key,
  site_id     text not null,
  month       date not null,
  old_hours   numeric(12,2),
  new_hours   numeric(12,2) not null,
  source      text not null,
  actor_name  text not null default '',
  occurred_at timestamptz not null default now()
);
create index if not exists whs_hours_log_idx on public.whs_hours_log (site_id, month, occurred_at desc);

create or replace function public.whs_hours_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.entered_by_name := public.whs_actor_name();
  new.updated_at := now();
  insert into public.whs_hours_log (site_id, month, old_hours, new_hours, source, actor_name)
  values (new.site_id, new.month, case when tg_op = 'UPDATE' then old.hours else null end, new.hours, new.source, new.entered_by_name);
  return new;
end;
$$;
drop trigger if exists whs_hours_stamps on public.whs_hours;
create trigger whs_hours_stamps before insert or update on public.whs_hours
  for each row execute function public.whs_hours_stamps();

alter table public.whs_hours enable row level security;
alter table public.whs_hours_log enable row level security;

drop policy if exists "whs office read hours" on public.whs_hours;
drop policy if exists "whs officer add hours" on public.whs_hours;
drop policy if exists "whs officer change hours" on public.whs_hours;
drop policy if exists "whs admin delete hours" on public.whs_hours;
create policy "whs office read hours" on public.whs_hours for select to authenticated using (public.whs_is_office());
create policy "whs officer add hours" on public.whs_hours for insert to authenticated with check (public.whs_is_officer());
create policy "whs officer change hours" on public.whs_hours for update to authenticated using (public.whs_is_officer()) with check (public.whs_is_officer());
create policy "whs admin delete hours" on public.whs_hours for delete to authenticated using (public.whs_is_admin());

drop policy if exists "whs office read hours log" on public.whs_hours_log;
create policy "whs office read hours log" on public.whs_hours_log for select to authenticated using (public.whs_is_office());

revoke all on public.whs_hours, public.whs_hours_log from anon;
grant select, insert, update, delete on public.whs_hours to authenticated;
grant select on public.whs_hours_log to authenticated;

notify pgrst, 'reload schema';
commit;
