-- whs_037_waste_paint.sql
-- Waste Paint: there is no SDS for waste, so it is classed on its most hazardous likely contents
-- (solvent-based paints and thinners): Class 3, UN 1263, packing group II until the waste contractor confirms.
-- Safe to run more than once.

do $body$
declare
  n_note text := $q$Waste: no SDS exists for waste. Classed on the most hazardous likely contents (solvent-based paint and thinner): Class 3, UN 1263, packing group II (strictest) until the waste contractor confirms the class on their waste profile. Label the containers and keep them in a flammables cabinet.$q$;
  found int;
begin
  update public.whs_chemicals
     set dg_class = '3', subsidiary = '', packing_group = 'II', un_number = '1263', aerosol = false, combustible = null,
         ghs_hazardous = true, class_confirmed = true,
         notes = btrim(regexp_replace(coalesce(notes, ''), '\s*(Upload the SDS to confirm the class\.|Upload the SDS\.|Enter the DG class from the SDS\.)', '', 'g') || E'\n' || n_note),
         updated_at = now()
   where name ilike 'Waste Paint%' and coalesce(notes, '') not like '%no SDS exists for waste%';
  get diagnostics found = row_count;
  raise notice 'Waste Paint: % updated', found;
end
$body$;

notify pgrst, 'reload schema';
