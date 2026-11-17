-- whs_038_volvo_coolant.sql
-- Volvo Penta Coolant VCS Ready Mixed 40/60: not dangerous goods (transport: not regulated) but GHS hazardous
-- (H302, H360D, H373). Taken from the EU SDS from AB Volvo Penta, which has no revision date on the copy found.
-- Confirm against the Australian SDS from a Volvo Penta dealer. Safe to run more than once.

do $body$
declare
  n_note text := $q$Class from the EU SDS (AB Volvo Penta, no revision date on the copy found): transport not regulated, so not DG. Hazardous: H302, H360D (may damage the unborn child), H373. Confirm against the Australian SDS from a Volvo Penta dealer and upload it.$q$;
  found int;
begin
  update public.whs_chemicals
     set dg_class = null, subsidiary = '', packing_group = null, un_number = null, aerosol = false,
         ghs_hazardous = true, class_confirmed = true,
         manufacturer = case when coalesce(manufacturer, '') = '' then 'AB Volvo Penta' else manufacturer end,
         h_statements = array['H302','H360D','H373']::text[],
         hazard_summary = $q$Harmful if swallowed. May damage the unborn child (reproductive toxicity). May damage the kidneys through prolonged or repeated swallowing. Not dangerous goods.$q$,
         ppe = case when coalesce(array_length(ppe, 1), 0) = 0 then array['Protective gloves','Safety glasses or goggles','Avoid skin contact. Pregnant workers should not handle it without advice']::text[] else ppe end,
         notes = btrim(regexp_replace(coalesce(notes, ''), '\s*(Upload the SDS to confirm the class\.|Upload the SDS\.|Enter the DG class from the SDS\.)', '', 'g') || E'\n' || n_note),
         updated_at = now()
   where name ilike 'Volvo Penta Coolant VCS%' and coalesce(notes, '') not like '%Class from the EU SDS (AB Volvo Penta%';
  get diagnostics found = row_count;
  raise notice 'Volvo Penta Coolant: % updated', found;
end
$body$;

notify pgrst, 'reload schema';
