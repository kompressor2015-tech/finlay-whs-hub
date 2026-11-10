-- ==============================================================================
-- FINLAY WHS - MIGRATION whs_001: WHS ROLES ON THE SHARED PROFILES TABLE
-- ==============================================================================
-- Run once in the Supabase dashboard (the same project as the Fleet Hub):
-- SQL Editor > New query > paste > Run. Safe to run again; all-or-nothing.
--
-- BEFORE YOU RUN IT
--   Back up first: the free plan has no point-in-time restore.
--   Database > Backups, or run the fleet app's "Export everything".
--
-- WHAT IT DOES
--   * Adds one new column, profiles.whs_role, for access to the WHS app:
--       whs_officer : everything in the WHS app
--       supervisor  : runs their site: reports, checks, actions, investigations
--       field       : reports and checks from a phone
--       (empty)     : no access to the WHS app
--     Fleet admins are WHS admins automatically.
--   * Only an admin can change someone's whs_role (the same protection as the fleet role).
--   * Adds helper functions that the WHS tables' access rules will use from step 2.
--
-- WHAT IT DOES NOT TOUCH
--   The fleet role column (admin / user / sales), its rules and every fleet table.
--   The Fleet Hub ignores the new column, so nothing changes for fleet users.
--
-- AFTER YOU RUN IT: give people WHS access, for example
--   update public.profiles set whs_role = 'whs_officer' where email = 'someone@finlay.com.au';
--   update public.profiles set whs_role = 'supervisor'  where email = 'someone@finlay.com.au';
--   update public.profiles set whs_role = 'field'       where email = 'someone@finlay.com.au';
--
--   Someone who only uses the WHS app still needs a login (Authentication > Users > Add user).
--   New logins get the fleet role 'user'. If they should not change fleet data, set their
--   fleet role to read-only:  update public.profiles set role = 'sales' where email = '...';
-- ==============================================================================

begin;

-- 1. The new column ------------------------------------------------------------

alter table public.profiles add column if not exists whs_role text;

alter table public.profiles drop constraint if exists profiles_whs_role_check;
alter table public.profiles
  add constraint profiles_whs_role_check
  check (whs_role is null or whs_role in ('whs_officer', 'supervisor', 'field'));

-- 2. Only admins can change whs_role ---------------------------------------------
-- A separate trigger, so the fleet app's own guard (guard_profile_changes) is left as it is.
-- The SQL editor runs with no signed-in user, so it is allowed through (that is how you set roles).

create or replace function public.guard_whs_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.whs_role is distinct from old.whs_role then
    raise exception 'Only an admin can change a user''s WHS role';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_whs_role on public.profiles;
create trigger guard_whs_role
  before update on public.profiles
  for each row execute function public.guard_whs_role();

-- 3. Helper functions for the WHS access rules -----------------------------------

-- 'admin', 'whs_officer', 'supervisor', 'field', or null (no WHS access)
create or replace function public.whs_access()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_admin() then 'admin'
    else (
      select whs_role from public.profiles
      where id::text = auth.uid()::text and status = 'ACTIVE'
    )
  end
$$;

-- anyone who may use the WHS app
create or replace function public.whs_is_member()
returns boolean language sql stable security definer set search_path = public
as $$ select public.whs_access() is not null $$;

-- office roles: see and manage the whole business's WHS records
create or replace function public.whs_is_office()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.whs_access(), '') in ('admin', 'whs_officer', 'supervisor') $$;

-- WHS officer or admin: settings, approvals, closing out investigations
create or replace function public.whs_is_officer()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.whs_access(), '') in ('admin', 'whs_officer') $$;

revoke all on function public.whs_access(), public.whs_is_member(), public.whs_is_office(), public.whs_is_officer() from public;
grant execute on function public.whs_access(), public.whs_is_member(), public.whs_is_office(), public.whs_is_officer() to authenticated;

commit;

-- CHECK IT WORKED (optional): lists everyone with their fleet and WHS roles.
--   select email, role, whs_role, status from public.profiles order by email;
