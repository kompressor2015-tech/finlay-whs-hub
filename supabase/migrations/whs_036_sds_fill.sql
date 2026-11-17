-- whs_036_sds_fill.sql
-- Fills the chemical register from the SDS uploaded on 17 Nov 2026 and removes the "Upload the SDS" notes
-- on those products. Classes come from section 14 of each SDS. Products are matched by name.
-- First aid, spill and PPE are only filled where the record is still blank. Safe to run more than once.
-- Held back: Paint Remover (the SDS supplied is an aerosol; the register has a 4 L container).

do $body$
declare
  found int;
  clean text := '\s*(Upload the SDS to confirm the class\.|Upload the SDS\.|Enter the DG class from the SDS\.|Class from the can label \(flammable aerosol\)\.)';
begin
  update public.whs_chemicals set
    manufacturer = $q$Dulux Protective Coatings Australia (DuluxGroup (Australia) Pty Ltd)$q$,
    supplier_phone = $q$1800 220 770 (24 hour emergency). Dulux 13 23 77$q$,
    hazard_summary = $q$Flammable paint (Class 3, PG III). Skin, eye and respiratory irritant. May cause cancer (H350).$q$,
    h_statements = array['H226','H315','H319','H335','H350']::text[],
    dg_class = $q$3$q$,
    subsidiary = '',
    packing_group = $q$III$q$,
    un_number = $q$1263$q$,
    aerosol = false,
    ghs_hazardous = true,
    class_confirmed = true,
    ppe = case when coalesce(array_length(ppe,1),0) = 0 then array['Protective gloves (nitrile)','Safety glasses or goggles','Overalls or protective clothing','Organic vapour respirator if ventilation is not enough']::text[] else ppe end,
    first_aid = case when coalesce(first_aid,'') = '' then $q$Inhaled: move to fresh air and keep at rest, seek medical advice if effects persist. Skin: remove contaminated clothing and flush skin with running water, seek medical advice if irritation occurs. Eyes: wash out immediately with water for 15 minutes and seek medical advice. Swallowed: rinse mouth, do NOT induce vomiting, seek medical advice. Poisons Information 13 11 26.$q$ else first_aid end,
    spill = case when coalesce(spill,'') = '' then $q$Remove all ignition sources and clear the area. Wear protective equipment. Contain and soak up with absorbent (sand, earth or inert material) using non-sparking tools, collect into labelled containers for disposal. Keep out of drains and waterways. Ventilate.$q$ else spill end,
    notes = btrim(regexp_replace(coalesce(notes,''), clean, '', 'g') || E'\n' || $q$SDS 22 Feb 2025, v9.0. ADG Class 3, PG III, UN 1263, proper shipping name PAINT, Hazchem 3Y, flash point above 23 C. Covers the 371-Line Quick Dry Enamel tint bases.$q$), updated_at = now()
   where name ilike $q$371-Line Metalshield QD Enamel Tint Bases%$q$ and notes not like '%' || $q$SDS 22 Feb 2025, v9.0. ADG Class 3, PG III, UN 1263, proper $q$ || '%';
  get diagnostics found = row_count;
  raise notice '%: % updated', $q$371-Line Metalshield QD Enamel Tint Bases%$q$, found;
  update public.whs_chemicals set
    manufacturer = $q$Dulux Protective Coatings Australia (DuluxGroup (Australia) Pty Ltd)$q$,
    supplier_phone = $q$1800 220 770 (24 hour emergency). Dulux 13 23 77$q$,
    hazard_summary = $q$Highly flammable thinner (flash point -7 C). Fatal if swallowed and enters airways. Skin, eye and respiratory irritant. May cause drowsiness or dizziness.$q$,
    h_statements = array['H225','H304','H315','H319','H335','H336']::text[],
    dg_class = $q$3$q$,
    subsidiary = '',
    packing_group = $q$III$q$,
    un_number = $q$1263$q$,
    aerosol = false,
    ghs_hazardous = true,
    class_confirmed = true,
    ppe = case when coalesce(array_length(ppe,1),0) = 0 then array['Protective gloves (nitrile)','Safety glasses or goggles','Overalls or protective clothing','Organic vapour respirator if ventilation is not enough']::text[] else ppe end,
    first_aid = case when coalesce(first_aid,'') = '' then $q$Inhaled: move to fresh air and keep at rest, seek medical advice if effects persist. Skin: remove contaminated clothing and flush skin with running water, seek medical advice if irritation occurs. Eyes: wash out immediately with water for 15 minutes and seek medical advice. Swallowed: rinse mouth, do NOT induce vomiting, seek medical advice. Poisons Information 13 11 26.$q$ else first_aid end,
    spill = case when coalesce(spill,'') = '' then $q$Remove all ignition sources and clear the area. Wear protective equipment. Contain and soak up with absorbent (sand, earth or inert material) using non-sparking tools, collect into labelled containers for disposal. Keep out of drains and waterways. Ventilate.$q$ else spill end,
    notes = btrim(regexp_replace(coalesce(notes,''), clean, '', 'g') || E'\n' || $q$SDS 29 Aug 2024, v9.0 (965-63023). ADG Class 3, UN 1263, proper shipping name PAINT RELATED MATERIAL, Hazchem 3Y. The SDS gives PG III in section 14 but classifies the product as Flammable Liquid Category 2 (H225) with flash point -7 C, which would normally be PG II. Recorded as the SDS states; ask Dulux to confirm.$q$), updated_at = now()
   where name ilike $q$Dulux Urethane Thinner%$q$ and notes not like '%' || $q$SDS 29 Aug 2024, v9.0 (965-63023). ADG Class 3, UN 1263, pro$q$ || '%';
  get diagnostics found = row_count;
  raise notice '%: % updated', $q$Dulux Urethane Thinner%$q$, found;
  update public.whs_chemicals set
    manufacturer = $q$Dulux Protective Coatings Australia (DuluxGroup (Australia) Pty Ltd)$q$,
    supplier_phone = $q$1800 220 770 (24 hour emergency). Dulux 13 23 77$q$,
    hazard_summary = $q$Flammable paint (Class 3, PG III). May cause cancer (H350) and may damage fertility or the unborn child (H360). Skin and eye irritant. May cause drowsiness or dizziness.$q$,
    h_statements = array['H226','H315','H319','H336','H350','H360']::text[],
    dg_class = $q$3$q$,
    subsidiary = '',
    packing_group = $q$III$q$,
    un_number = $q$1263$q$,
    aerosol = false,
    ghs_hazardous = true,
    class_confirmed = true,
    ppe = case when coalesce(array_length(ppe,1),0) = 0 then array['Protective gloves (nitrile)','Safety glasses or goggles','Overalls or protective clothing','Organic vapour respirator if ventilation is not enough']::text[] else ppe end,
    first_aid = case when coalesce(first_aid,'') = '' then $q$Inhaled: move to fresh air and keep at rest, seek medical advice if effects persist. Skin: remove contaminated clothing and flush skin with running water, seek medical advice if irritation occurs. Eyes: wash out immediately with water for 15 minutes and seek medical advice. Swallowed: rinse mouth, do NOT induce vomiting, seek medical advice. Poisons Information 13 11 26.$q$ else first_aid end,
    spill = case when coalesce(spill,'') = '' then $q$Remove all ignition sources and clear the area. Wear protective equipment. Contain and soak up with absorbent (sand, earth or inert material) using non-sparking tools, collect into labelled containers for disposal. Keep out of drains and waterways. Ventilate.$q$ else spill end,
    notes = btrim(regexp_replace(coalesce(notes,''), clean, '', 'g') || E'\n' || $q$SDS 6 Nov 2025, v9.1 (381-Line Dulux Super Enamel High Gloss). ADG Class 3, PG III, UN 1263, proper shipping name PAINT, Hazchem 3Y, flash point above 23 C. Confirm this is the same product as the 15 L tin held.$q$), updated_at = now()
   where name ilike $q$Dulux Enamel$q$ and notes not like '%' || $q$SDS 6 Nov 2025, v9.1 (381-Line Dulux Super Enamel High Gloss$q$ || '%';
  get diagnostics found = row_count;
  raise notice '%: % updated', $q$Dulux Enamel$q$, found;
  update public.whs_chemicals set
    manufacturer = $q$Colourtrend Paints Australia Pty Ltd$q$,
    supplier_phone = $q$02 9756 2400. Emergency 0439 624 009$q$,
    hazard_summary = $q$Oil based enamel paint. Flammable liquid (Class 3, PG III) per the 2010 SDS.$q$,
    h_statements = h_statements,
    dg_class = $q$3$q$,
    subsidiary = '',
    packing_group = $q$III$q$,
    un_number = $q$1263$q$,
    aerosol = false,
    ghs_hazardous = true,
    class_confirmed = false,
    ppe = case when coalesce(array_length(ppe,1),0) = 0 then array['Protective gloves (nitrile)','Safety glasses or goggles','Overalls or protective clothing','Organic vapour respirator if ventilation is not enough']::text[] else ppe end,
    first_aid = case when coalesce(first_aid,'') = '' then $q$Inhaled: move to fresh air and keep at rest, seek medical advice if effects persist. Skin: remove contaminated clothing and flush skin with running water, seek medical advice if irritation occurs. Eyes: wash out immediately with water for 15 minutes and seek medical advice. Swallowed: rinse mouth, do NOT induce vomiting, seek medical advice. Poisons Information 13 11 26.$q$ else first_aid end,
    spill = case when coalesce(spill,'') = '' then $q$Remove all ignition sources and clear the area. Wear protective equipment. Contain and soak up with absorbent (sand, earth or inert material) using non-sparking tools, collect into labelled containers for disposal. Keep out of drains and waterways. Ventilate.$q$ else spill end,
    notes = btrim(regexp_replace(coalesce(notes,''), clean, '', 'g') || E'\n' || $q$Class from the 2010 SDS (Australis Oil Based Enamel Gloss F817-Line, Issue 2, 7 Oct 2010): ADG Class 3, PG III, UN 1263, PAINT, Hazchem 3Y. That SDS is over 5 years old, so ask Colourtrend (02 9756 2400) for a current one and re-check the class and H statements.$q$), updated_at = now()
   where name ilike $q$Colourtrend Australis Oil Based Enamel%$q$ and notes not like '%' || $q$Class from the 2010 SDS (Australis Oil Based Enamel Gloss F8$q$ || '%';
  get diagnostics found = row_count;
  raise notice '%: % updated', $q$Colourtrend Australis Oil Based Enamel%$q$, found;
  update public.whs_chemicals set
    manufacturer = $q$Hempel (Wattyl) Australia Pty Ltd$q$,
    supplier_phone = $q$13 11 26 Poisons Information (24 hour). Wattyl 02 8867 3333$q$,
    hazard_summary = $q$Extremely flammable aerosol. May damage fertility or the unborn child (H360). Skin irritant. May cause drowsiness or dizziness. May damage organs (central nervous system) through prolonged exposure.$q$,
    h_statements = array['H222','H229','H315','H336','H360','H373']::text[],
    dg_class = $q$2.1$q$,
    subsidiary = '',
    packing_group = null,
    un_number = $q$1950$q$,
    aerosol = true,
    ghs_hazardous = true,
    class_confirmed = true,
    ppe = case when coalesce(array_length(ppe,1),0) = 0 then array['Protective gloves','Safety glasses or goggles','Protective clothing','Respirator if ventilation is not enough']::text[] else ppe end,
    first_aid = case when coalesce(first_aid,'') = '' then $q$Inhaled: fresh air, rest, medical advice if unwell. Skin: remove contaminated clothing and wash with soap and water. Eyes: rinse with water for 15 minutes. Swallowed: rinse mouth, do not induce vomiting, get medical advice. Poisons Information 13 11 26.$q$ else first_aid end,
    spill = case when coalesce(spill,'') = '' then $q$Remove ignition sources, ventilate, wear protective equipment, soak up with absorbent and collect into a labelled container. Keep out of drains.$q$ else spill end,
    notes = btrim(regexp_replace(coalesce(notes,''), clean, '', 'g') || E'\n' || $q$SDS 29 Oct 2024 (Killrust Satin Enamel Aerosol CB Classic Cream, product 115301.530, version 5). ADG Class 2.1, UN 1950, AEROSOLS, no packing group. Flash point (propellant) -22 C. Covers this product range; the can held may be a different colour.$q$), updated_at = now()
   where name ilike $q$Wattyl Killrust Aerosol%$q$ and notes not like '%' || $q$SDS 29 Oct 2024 (Killrust Satin Enamel Aerosol CB Classic Cr$q$ || '%';
  get diagnostics found = row_count;
  raise notice '%: % updated', $q$Wattyl Killrust Aerosol%$q$, found;
  update public.whs_chemicals set
    manufacturer = $q$Briolf Coatings S.A.U. (Roberlo), Spain$q$,
    supplier_phone = $q$+34 972 478060 (Spain). No Australian emergency number on the SDS$q$,
    hazard_summary = $q$Extremely flammable aerosol. Pressurised container: may burst if heated. Eye irritant. May cause drowsiness or dizziness.$q$,
    h_statements = array['H222','H229','H319','H336']::text[],
    dg_class = $q$2.1$q$,
    subsidiary = '',
    packing_group = null,
    un_number = $q$1950$q$,
    aerosol = true,
    ghs_hazardous = true,
    class_confirmed = true,
    ppe = case when coalesce(array_length(ppe,1),0) = 0 then array['Protective gloves','Safety glasses or goggles','Protective clothing','Respirator if ventilation is not enough']::text[] else ppe end,
    notes = btrim(regexp_replace(coalesce(notes,''), clean, '', 'g') || E'\n' || $q$SDS on file is for AIRCOLOR FILLEX FILL-ONE prefill SB (Briolf/Roberlo, EU format, revised 25 Sep 2026, version 2): UN 1950 AEROSOLS, Class 2.1, no packing group, propellant flash point -41 C. This can is the Inspection Plate Green RDE, so check that SDS covers it or get its own from the supplier. Overseas SDS: ask for an Australian one.$q$), updated_at = now()
   where name ilike $q$Roberlo Aircolor Spray Prefill%$q$ and notes not like '%' || $q$SDS on file is for AIRCOLOR FILLEX FILL-ONE prefill SB (Brio$q$ || '%';
  get diagnostics found = row_count;
  raise notice '%: % updated', $q$Roberlo Aircolor Spray Prefill%$q$, found;
  update public.whs_chemicals set
    manufacturer = $q$Henkel Australia Pty Ltd$q$,
    supplier_phone = $q$1800 032 379 (24 hour emergency). Henkel 03 9724 6444$q$,
    hazard_summary = $q$Anaerobic thread sealant. Skin and eye irritant, skin sensitiser, may cause respiratory irritation. Harmful to aquatic life.$q$,
    h_statements = array['H315','H317','H319','H335','H402']::text[],
    dg_class = null,
    subsidiary = '',
    packing_group = null,
    un_number = null,
    aerosol = false,
    ghs_hazardous = true,
    class_confirmed = true,
    ppe = case when coalesce(array_length(ppe,1),0) = 0 then array['Protective gloves','Safety glasses with side shields','Respirator if ventilation is not enough']::text[] else ppe end,
    notes = btrim(regexp_replace(coalesce(notes,''), clean, '', 'g') || E'\n' || $q$Not dangerous goods (ADG, IMDG, IATA). SDS 12 Dec 2022 (Henkel Australia, SDS 153648, v1.3). Flash point above 93 C.$q$), updated_at = now()
   where name ilike $q$Loctite 545 Thread Sealant%$q$ and notes not like '%' || $q$Not dangerous goods (ADG, IMDG, IATA). SDS 12 Dec 2022 (Henk$q$ || '%';
  get diagnostics found = row_count;
  raise notice '%: % updated', $q$Loctite 545 Thread Sealant%$q$, found;
  update public.whs_chemicals set
    manufacturer = $q$Henkel Ltd (UK)$q$,
    supplier_phone = $q$+44 1442 278497 (24 hour, UK). Henkel Australia 1800 032 379$q$,
    hazard_summary = $q$Anaerobic retaining compound. Skin irritant and sensitiser, causes serious eye damage, may cause respiratory irritation. Harmful to aquatic life with long lasting effects.$q$,
    h_statements = array['H315','H317','H318','H335','H412']::text[],
    dg_class = null,
    subsidiary = '',
    packing_group = null,
    un_number = null,
    aerosol = false,
    ghs_hazardous = true,
    class_confirmed = true,
    ppe = case when coalesce(array_length(ppe,1),0) = 0 then array['Protective gloves','Safety glasses or goggles','Respirator if ventilation is not enough']::text[] else ppe end,
    notes = btrim(regexp_replace(coalesce(notes,''), clean, '', 'g') || E'\n' || $q$Not dangerous goods (ADR/IMDG/IATA). SDS 1 Aug 2023 (Henkel UK, SDS 450822, v12.0). This is a UK/EU format SDS, so ask Henkel Australia for the Australian one.$q$), updated_at = now()
   where name ilike $q$Loctite 638 Retaining Compound%$q$ and notes not like '%' || $q$Not dangerous goods (ADR/IMDG/IATA). SDS 1 Aug 2023 (Henkel $q$ || '%';
  get diagnostics found = row_count;
  raise notice '%: % updated', $q$Loctite 638 Retaining Compound%$q$, found;
  update public.whs_chemicals set
    manufacturer = $q$BP Australia Pty Ltd$q$,
    supplier_phone = $q$1800 638 556 (24 hour emergency). BP technical helpline 1300 139 700$q$,
    hazard_summary = $q$Extremely flammable liquid. Fatal if swallowed and enters airways. May cause genetic defects and cancer. Skin irritant. May cause drowsiness or dizziness.$q$,
    h_statements = array['H224','H304','H315','H336','H340','H350']::text[],
    dg_class = $q$3$q$,
    subsidiary = '',
    packing_group = $q$II$q$,
    un_number = $q$1203$q$,
    aerosol = false,
    ghs_hazardous = true,
    class_confirmed = true,
    notes = btrim(regexp_replace(coalesce(notes,''), clean, '', 'g') || E'\n' || $q$SDS 13 Jan 2025 (BP Unleaded 91, SDS 0000002733). ADG Class 3, PG II, UN 1203, MOTOR SPIRIT, Hazchem 3YE, flash point below -40 C. Marine pollutant for sea transport.$q$), updated_at = now()
   where name ilike $q$Unleaded Petrol (ULP)%$q$ and notes not like '%' || $q$SDS 13 Jan 2025 (BP Unleaded 91, SDS 0000002733). ADG Class $q$ || '%';
  get diagnostics found = row_count;
  raise notice '%: % updated', $q$Unleaded Petrol (ULP)%$q$, found;
end
$body$;

notify pgrst, 'reload schema';
