-- whs_033_seal_n_flex.sql
-- Fills in SEAL N FLEX FC GREY (Bostik) from its SDS dated 25 Jul 2022. Updates the record if it is already in
-- the chemical register (matched by name), otherwise adds it. Not dangerous goods (ADG, IATA, IMDG: not regulated).
-- The SDS file itself is uploaded in the app, which records the issue date. Safe to run more than once.

do $body$
declare
  n_manufacturer text := $q$Bostik Australia Pty Ltd$q$;
  n_phone        text := $q$1800 033 111 (24 hour emergency). Office 03 9279 9333$q$;
  n_summary      text := $q$Adhesive and sealant paste containing isocyanates (MDI). Skin and eye irritant, skin and respiratory sensitiser, suspected carcinogen. Scheduled poison S6. Reacts violently with water.$q$;
  n_h            text[] := array['H315','H317','H319','H334','H351'];
  n_ppe          text[] := array['Safety glasses with side shields or goggles','Impervious gloves','Long-sleeved clothing','Respirator with A/P2 filter if ventilation is not enough'];
  n_first_aid    text := $q$Eyes: rinse with plenty of water for at least 15 minutes, remove contact lenses, get medical attention if irritation persists. Skin: wash off with soap and water for at least 15 minutes. Inhaled: move to fresh air, get medical attention. Swallowed: do not induce vomiting, rinse mouth, get medical attention. Poisons Information 13 11 26.$q$;
  n_spill        text := $q$Stop the leak if safe, keep people away and upwind, ventilate, collect the spill into labelled containers and clean the area. Prevent it entering drains.$q$;
  n_notes        text := $q$Not dangerous goods (ADG, IATA, IMDG not regulated). No flash point given in the SDS, so combustible class is left blank. Store locked up, dry, cool and well ventilated (10 to 35 C). Keep from strong acids, bases and oxidisers. Protect from moisture: hazardous polymerisation may occur. SDS 25 Jul 2022, Revision 1.$q$;
  found int;
begin
  update public.whs_chemicals
     set manufacturer = n_manufacturer, supplier_phone = n_phone, hazard_summary = n_summary, h_statements = n_h,
         ppe = n_ppe, first_aid = n_first_aid, spill = n_spill, notes = n_notes,
         dg_class = null, subsidiary = '', packing_group = null, un_number = null, aerosol = false, combustible = null,
         ghs_hazardous = true, class_confirmed = true, active = true, updated_at = now()
   where name ilike 'SEAL N FLEX%';
  get diagnostics found = row_count;
  if found = 0 then
    insert into public.whs_chemicals (name, manufacturer, supplier_phone, hazard_summary, h_statements, ppe, first_aid, spill, notes, ghs_hazardous, class_confirmed)
    values ('SEAL N FLEX FC GREY', n_manufacturer, n_phone, n_summary, n_h, n_ppe, n_first_aid, n_spill, n_notes, true, true);
    raise notice 'SEAL N FLEX FC GREY added.';
  else
    raise notice 'SEAL N FLEX updated (% record).', found;
  end if;
end
$body$;

notify pgrst, 'reload schema';
