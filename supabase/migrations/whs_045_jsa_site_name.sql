-- JSAs are mostly done at customer sites, not Finlay sites, so the site can be typed in as well as picked.
-- Safe to run more than once.
alter table public.whs_jsas add column if not exists site_name text not null default '';

-- Existing JSAs that picked a Finlay site keep it by name.
update public.whs_jsas j set site_name = s.name
from public.whs_sites s
where j.site_id = s.id and j.site_name = '';

notify pgrst, 'reload schema';
