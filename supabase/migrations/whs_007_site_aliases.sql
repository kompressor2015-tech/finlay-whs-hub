-- WHS app step 7: "also known as" names for sites, so a record reported against "Brisbane Yard"
-- (the fleet app's name) shows up under Burpengary Yard in the site switcher.
-- Adds one column to whs_sites. Safe to re-run. Back up first as usual.

alter table public.whs_sites add column if not exists also_known_as text[] not null default '{}';

-- Burpengary Yard is "Brisbane Yard" in the fleet app.
update public.whs_sites
   set also_known_as = array(select distinct unnest(also_known_as || array['Brisbane Yard']))
 where id = 'burpengary';

-- Link each WHS site to its fleet depot where the names line up and nothing is linked yet.
update public.whs_sites s
   set depot_site_id = (select d.id::text from public.depot_sites d where d.name ilike '%brisbane yard%' order by d.name limit 1)
 where s.id = 'burpengary' and s.depot_site_id is null;
