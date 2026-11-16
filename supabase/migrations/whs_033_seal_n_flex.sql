-- whs_033_seal_n_flex.sql
-- Fills in SEAL N FLEX FC GREY (Bostik) from its SDS dated 25 Jul 2022. Updates the record if it is already in
-- the chemical register (matched by name), otherwise adds it. Not dangerous goods (ADG, IATA, IMDG: not regulated).
-- The SDS file itself is uploaded in the app, which records the issue date. Safe to run more than once.

begin;

with v as (
  select
    'SEAL N FLEX FC GREY'::text as name,
    'Bostik Australia Pty Ltd'::text as manufacturer,
    '1800 033 111 (24 hour emergency). Office 03 9279 9333'::text as supplier_phone,
    'Adhesive and sealant paste containing isocyanates (MDI). Skin and eye irritant, skin and respiratory sensitiser, suspected carcinogen. Scheduled poison S6. Reacts violently with water.'::text as hazard_summary,
    array['H315','H317','H319','H334','H351']::text[] as h_statements,
    array['Safety glasses with side shields or goggles','Impervious gloves','Long-sleeved clothing','Respirator with A/P2 filter if ventilation is not enough']::text[] as ppe,
    E'Eyes: rinse with plenty of water for at least 15 minutes, remove contact lenses, get medical attention if irritation persists. Skin: wash off with soap and water for at least 15 minutes. Inhaled: move to fresh air, get medical attention. Swallowed: do not induce vomiting, rinse mouth, get medical attention. Poisons Information 13 11 26.'::text as first_aid,
    'Stop the leak if safe, keep people away and upwind, ventilate, pick up into labelled containers, clean the area. Prevent it entering drains.'::text as spill,
    E'Not dangerous goods (ADG, IATA, IMDG not regulated). No flash point given in the SDS, so combustible class is left blank. Store locked up, dry, cool and well ventilated (10 to 35 C). Keep from strong acids, bases and oxidisers. Protect from moisture: hazardous polymerisation may occur. SDS 25 Jul 2022, Revision 1.'::text as notes
), upd as (
  update public.whs_chemicals c
     set manufacturer = v.manufacturer, supplier_phone = v.supplier_phone, hazard_summary = v.hazard_summary, h_statements = v.h_statements,
         ppe = v.ppe, first_aid = v.first_aid, spill = v.spill, notes = v.notes,
         dg_class = null, subsidiary = '', packing_group = null, un_number = null, aerosol = false, combustible = null,
         ghs_hazardous = true, class_confirmed = true, active = true, updated_at = now()
    from v
   where c.name ilike 'SEAL N FLEX%'
  returning c.id
)
insert into public.whs_chemicals (name, manufacturer, supplier_phone, hazard_summary, h_statements, ppe, first_aid, spill, notes, ghs_hazardous, class_confirmed)
select v.name, v.manufacturer, v.supplier_phone, v.hazard_summary, v.h_statements, v.ppe, v.first_aid, v.spill, v.notes, true, true
from v
where not exists (select 1 from upd);

notify pgrst, 'reload schema';
commit;
