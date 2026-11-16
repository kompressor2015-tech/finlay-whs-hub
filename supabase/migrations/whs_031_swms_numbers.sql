-- whs_031_swms_numbers.sql
-- Finlay's own SWMS numbers: only two have been written, so they are 001 (TTS620T service, Shadforths Aura,
-- FSC76, works commenced 15/01/2026) and 002 (replacement of hydraulic valve, FSC77). The numbers 099 and 100
-- came from the Word files and are replaced.
--   1. If SWMS 099 is still in the app, it becomes 001. If it is missing, it is loaded again as a DRAFT as 001.
--   2. SWMS 100 becomes 002.
-- Safe to run more than once.

begin;

update public.whs_swms set swms_number = '001' where swms_number = '099';
update public.whs_swms set swms_number = '002' where swms_number = '100';

do $$
declare sid uuid;
begin
  if exists (select 1 from public.whs_swms where swms_number = '001') then
    raise notice 'SWMS 001 is already in the app. Nothing added.';
    return;
  end if;
  insert into public.whs_swms (title, swms_number, risk_register_ref, owner_name, review_months)
    values ('Scheduled service and maintenance, Terex Finlay TTS620T', '001', 'FSC76', 'Daniel Sykes', 12)
    returning id into sid;
  insert into public.whs_swms_versions (swms_id, site_name, site_address, work_covered, high_risk_areas, author_position, supervisor_name, consulted, review_checks,
      who_may, qualifications, tools, sops, plant, ppe, expected_start, steps)
  values (sid, 'SHADFORTHS AURA (ON BEHALF OF SOILCYCLERS)', 'Castlereagh Crescent, Banya QLD',
    'Scheduled service, inspection, lubrication, adjustment, minor repairs, filter replacement, belt checks, and general maintenance carried out on-site by field service technician.',
    array['Chemical, fuel or refrigerant lines','Powered mobile plant'], 'Safety officer', 'TBA',
    '[{"name":"Daniel Sykes","signature_path":null},{"name":"Brooke Sampson","signature_path":null},{"name":"Mathew Smith","signature_path":null},{"name":"Nicholas Close","signature_path":null}]'::jsonb,
    array['checklist','environment'],
    'Tradesperson',
    E'Competency in mobile plant servicing\nMachine-specific familiarisation (TTS620T)\nLock Out / Tag Out (LOTO) training\nManual handling training\nSite induction (where required)\nWhite Card (construction sites, where applicable)',
    E'Manufacturer-approved hand tools\nTorque wrench\nGrease gun\nService filters (oil, fuel, air, hydraulic)\nOils, lubricants, coolants\nSpill kit\nLock out / tag out devices\nFire extinguisher (vehicle-mounted)\nMobile phone / radio',
    'Safe Work Instructions TTS620T Service',
    'Terex Finlay TTS620T',
    E'Mandatory PPE: steel-capped safety boots\nLong sleeve high-visibility clothing\nSafety glasses\nCut-resistant gloves\nHearing protection (when plant or nearby equipment is operating)\nHard hat (if required by site)\nTask-specific PPE as required: face shield\nRespiratory protection (dust, fumes)\nChemical-resistant gloves (oils, fuels)',
    date '2026-01-15',
    jsonb_build_array(
      jsonb_build_object('section','Site arrival setup','step','Arrive on site and report to site contact','hazard','Interaction with mobile plant, site traffic','before',jsonb_build_array(3,4),'controls',E'Site induction, communication with site contact, establish exclusion zone, hi-vis PPE','after',jsonb_build_array(1,3),'who','Technician','risk_id',null),
      jsonb_build_object('section','Site arrival setup','step','Assess work area and ground conditions','hazard','Uneven ground, slips/trips','before',jsonb_build_array(3,3),'controls',E'Park on stable ground, chock wheels, good housekeeping','after',jsonb_build_array(1,3),'who','Technician','risk_id',null),
      jsonb_build_object('section','Site arrival setup','step','Shut down machine','hazard','Unexpected start-up, moving parts','before',jsonb_build_array(5,4),'controls',E'Follow manufacturer shutdown procedure, idle down','after',jsonb_build_array(1,3),'who','Technician','risk_id',null),
      jsonb_build_object('section','Site arrival setup','step','Isolate plant (LOTO)','hazard','Stored energy, electrical shock','before',jsonb_build_array(5,3),'controls',E'Remove ignition key, apply LOTO, release hydraulic pressure, verify zero energy (SOP-LOTO-001)','after',jsonb_build_array(1,2),'who','Technician','risk_id',null),
      jsonb_build_object('section','Site arrival setup','step','Allow machine to cool','hazard','Burns from hot components','before',jsonb_build_array(4,2),'controls',E'Allow adequate cool-down time, PPE','after',jsonb_build_array(1,2),'who','Technician','risk_id',null),
      jsonb_build_object('section','Perform service','step','Access service points','hazard','Falls from height','before',jsonb_build_array(3,4),'controls',E'Use fixed access ladders and platforms, maintain three points of contact','after',jsonb_build_array(1,2),'who','Technician','risk_id',null),
      jsonb_build_object('section','Perform service','step','Remove guards or panels (if required)','hazard','Pinch points, sharp edges','before',jsonb_build_array(4,3),'controls',E'Confirm isolation, use tools correctly, gloves, remove only necessary guards','after',jsonb_build_array(1,2),'who','Technician','risk_id',null),
      jsonb_build_object('section','Perform service','step','Perform service tasks (filters, oils, lubrication)','hazard','Manual handling, chemical exposure','before',jsonb_build_array(4,2),'controls',E'Use correct lifting techniques, SDS compliance, chemical PPE, SOP-MECH-012','after',jsonb_build_array(1,2),'who','Technician','risk_id',null),
      jsonb_build_object('section','Perform service','step','Drain and replace fluids','hazard','Hot fluids, spills, environmental harm','before',jsonb_build_array(4,3),'controls',E'Controlled draining, drip trays, spill kits, SOP-ENV-004','after',jsonb_build_array(1,2),'who','Technician','risk_id',null),
      jsonb_build_object('section','Perform service','step','Inspect belts, rollers, hydraulics','hazard','Pinch points, sharp edges','before',jsonb_build_array(4,3),'controls',E'Hands clear, isolation confirmed, visual inspection only','after',jsonb_build_array(1,2),'who','Technician','risk_id',null),
      jsonb_build_object('section','Perform service','step','Refit guards and panels','hazard','Incorrect refit leading to exposure','before',jsonb_build_array(4,3),'controls',E'Reinstall all guards, torque fasteners correctly','after',jsonb_build_array(1,2),'who','Technician','risk_id',null),
      jsonb_build_object('section','Perform service','step','Remove tools and housekeeping','hazard','Tool left in machine','before',jsonb_build_array(3,3),'controls',E'Tool check, clean work area','after',jsonb_build_array(1,2),'who','Technician','risk_id',null),
      jsonb_build_object('section','Perform service','step','Remove LOTO and recommission','hazard','Unexpected movement','before',jsonb_build_array(4,3),'controls',E'Clear exclusion zone, warn personnel, controlled start-up','after',jsonb_build_array(1,3),'who','Technician','risk_id',null),
      jsonb_build_object('section','Perform service','step','Functional testing','hazard','Noise, moving plant','before',jsonb_build_array(3,3),'controls',E'Hearing protection, stand clear of moving parts','after',jsonb_build_array(1,3),'who','Technician','risk_id',null),
      jsonb_build_object('section','Perform service','step','Complete documentation and sign off','hazard','Incomplete records','before',jsonb_build_array(1,3),'controls',E'Complete service report and SWMS sign-off','after',jsonb_build_array(1,1),'who','Technician','risk_id',null),
      jsonb_build_object('section','Leave site','step','Leave site','hazard',E'Damage to property or plant\nStruck by moving objects','before',jsonb_build_array(2,3),'controls',E'Areas left in a clean and tidy state\nSign out procedures of principal contractor followed\nLock and secure site if required\nTraffic management procedures of principal contractor followed','after',jsonb_build_array(1,2),'who','Site manager, operator','risk_id',null)
    ));
end $$;

notify pgrst, 'reload schema';
commit;
