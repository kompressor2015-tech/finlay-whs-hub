-- whs_034_lubricants_non_dg.sql
-- Marks plain lubricating oils, greases and Cat ELC coolant as NOT dangerous goods (ADG), which is the normal
-- classification for these product types. This is provisional: the note on each record says to confirm
-- Section 14 when the current SDS is uploaded. The combustible class (C1/C2) is left exactly as it is.
-- Only touches records still marked "class to confirm". Safe to run more than once.
-- Left out on purpose until their SDS is read: Waste Hydraulic Fluid, Loctite LB 8150, Molytec Nickel Anti-Seize,
-- Volvo Penta Coolant, VW G13 Coolant Additive.

do $body$
declare
  n_note text := $q$Non-DG: lubricating oil, grease or coolant (provisional). Confirm Section 14 when the current SDS is uploaded.$q$;
  found int;
begin
  update public.whs_chemicals
     set dg_class = null, subsidiary = '', packing_group = null, un_number = null, aerosol = false,
         class_confirmed = true,
         notes = case when coalesce(notes, '') = '' then n_note else notes || E'\n' || n_note end,
         updated_at = now()
   where active
     and coalesce(class_confirmed, false) = false
     and dg_class is null
     and (
       name ilike '5W30 Engine Oil%' or name ilike 'Air Tool Oil%' or name ilike 'Caltex 1000 THF%'
       or name ilike 'Cat ELC Advanced%' or name ilike 'Fuchs Renolit Blue LX%' or name ilike 'Gulf Western Compressor Oil%'
       or name ilike 'Hi-Tec Hydraulic 68%' or name ilike 'Mobil Mobilith SHC 220%' or name ilike 'Mobil Polyrex EM%'
       or name ilike 'Prolube Hyplex S 32%' or name ilike 'Prolube Hyplex S 46%'
       or name ilike 'Shell Gadus S2 V220%' or name ilike 'Shell Gadus S3 V460%'
       or name ilike 'Shell Omala S4 GX 150%' or name ilike 'Shell Omala S4 GXV Plus 150%'
       or name ilike 'Shell Spirax%' or name ilike 'Timken Grease NLGI 3%'
       or name ilike 'Valvoline EPG ISO 320%' or name ilike 'Volvo Penta Engine Oil%'
       or name ilike 'Waste Oil%'
     );
  get diagnostics found = row_count;
  raise notice 'Marked % records as non-DG (provisional).', found;
end
$body$;

notify pgrst, 'reload schema';
