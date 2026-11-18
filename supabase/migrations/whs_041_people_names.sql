-- whs_041_people_names.sql
-- A names-only list of current workers, readable by every WHS member (including field staff on a phone),
-- so forms can suggest names. Returns id, name and position only; no phone, email or other details.
-- Safe to run more than once.
begin;

create or replace function public.whs_people_names()
returns table (id uuid, name text, position text, site_id text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.name, p.position, p.site_id
  from public.whs_people p
  where p.active and p.archived_at is null and public.whs_is_member()
  order by p.name
$$;
revoke all on function public.whs_people_names() from public, anon;
grant execute on function public.whs_people_names() to authenticated;

commit;
notify pgrst, 'reload schema';
