-- whs_044_jsa.sql
-- Job Safety Analysis (JSA): a quick, job-specific risk assessment of the steps of a task, with hazards, controls
-- and a before/after rating. Not a SWMS: a JSA that covers high risk construction work is flagged as needing one.
-- Office roles write them (supervisor, WHS officer, admin); every WHS member can read them. Safe to run more than once.
begin;

create sequence if not exists public.whs_jsa_ref_seq;

create table if not exists public.whs_jsas (
  id              uuid primary key default gen_random_uuid(),
  ref             text unique,
  title           text not null check (length(trim(title)) > 0),
  site_id         text references public.whs_sites (id),
  location        text not null default '',
  done_on         date,
  supervisor_name text not null default '',
  crew            text not null default '',          -- names of the crew, separated by commas
  work_covered    text not null default '',
  steps           jsonb not null default '[]'::jsonb, -- same shape as a SWMS step
  high_risk_areas text[] not null default '{}',       -- ticked high risk construction work: needs a SWMS
  ppe             text not null default '',
  permits         text not null default '',
  emergency       text not null default '',
  status          text not null default 'draft' check (status in ('draft', 'completed')),
  completed_at    timestamptz,
  completed_by_name text not null default '',
  created_by_name text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists whs_jsas_site_idx on public.whs_jsas (site_id, done_on desc);

create or replace function public.whs_jsa_stamps()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.ref := 'JSA-' || lpad(nextval('public.whs_jsa_ref_seq')::text, 3, '0');
    new.created_by_name := public.whs_actor_name();
    new.created_at := now();
    new.status := 'draft';
    new.completed_at := null;
    new.completed_by_name := '';
  else
    new.ref := old.ref;
    new.created_at := old.created_at;
    new.created_by_name := old.created_by_name;
    if new.status = 'completed' and old.status <> 'completed' then
      new.completed_at := now();
      new.completed_by_name := public.whs_actor_name();
    elsif new.status = 'draft' then
      new.completed_at := null;
      new.completed_by_name := '';
    else
      new.completed_at := old.completed_at;
      new.completed_by_name := old.completed_by_name;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists whs_jsa_stamps on public.whs_jsas;
create trigger whs_jsa_stamps before insert or update on public.whs_jsas
  for each row execute function public.whs_jsa_stamps();

alter table public.whs_jsas enable row level security;
drop policy if exists "whs read jsas" on public.whs_jsas;
drop policy if exists "whs office add jsas" on public.whs_jsas;
drop policy if exists "whs office edit jsas" on public.whs_jsas;
drop policy if exists "whs officer delete jsas" on public.whs_jsas;
create policy "whs read jsas" on public.whs_jsas for select to authenticated using (public.whs_is_member());
create policy "whs office add jsas" on public.whs_jsas for insert to authenticated with check (public.whs_is_office());
create policy "whs office edit jsas" on public.whs_jsas for update to authenticated using (public.whs_is_office()) with check (public.whs_is_office());
create policy "whs officer delete jsas" on public.whs_jsas for delete to authenticated using (public.whs_is_officer());
revoke all on public.whs_jsas from anon;
grant select, insert, update, delete on public.whs_jsas to authenticated;
grant usage on sequence public.whs_jsa_ref_seq to authenticated;

commit;
notify pgrst, 'reload schema';
