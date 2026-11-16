-- whs_030_seed_swms_100.sql
-- Loads SWMS 100 (replacement of a hydraulic valve, Terex-Finlay jaw TRX1480JTOMT11083, Fisherman Island
-- Cargo Terminal, dated 20/03/2026) into the app as a DRAFT. Open it, check it, then send it for approval
-- and sign. Run once, after whs_018_swms.sql. Safe to re-run: it does nothing if SWMS 100 is already there.
-- Changes from the Word file: "Technian" corrected to "Technician". Nothing else was altered.
do $$
declare sid uuid;
begin
  if exists (select 1 from public.whs_swms where swms_number = '100') then
    raise notice 'SWMS 100 is already in the app. Nothing added.';
    return;
  end if;
  insert into public.whs_swms (title, swms_number, risk_register_ref, owner_name, review_months)
    values ('Replacement of hydraulic valve, Terex-Finlay jaw TRX1480JTOMT11083', '100', 'FSC77', 'Daniel Sykes', 12)
    returning id into sid;
  insert into public.whs_swms_versions (swms_id, site_name, site_address, work_covered, legislation, high_risk_areas, author_position, supervisor_name, consulted,
      who_may, qualifications, tools, plant, ppe, decision_note, steps)
  values (sid, 'FISHERMAN ISLAND CARGO TERMINAL', 'BERTH 3, PORT DRIVE, PORT OF BRISBANE',
    'TRX1480JTOMT11083, replacement of hydraulic valve.',
    E'Work Health and Safety Act 2011 (QLD)\nWork Health and Safety Regulation 2011 (QLD) (Part 5.1 Plant)\nManaging the Risks of Plant in the Workplace Code of Practice 2021\nMaritime Safety Queensland (MSQ) Guidelines\nPort of Brisbane Pty Ltd (PBPL) Environmental & Safety Inductions\nAS 4024.1-2019 (Safety of Machinery - General Principles)',
    array['Chemical, fuel or refrigerant lines','Energised electrical installation or service','Powered mobile plant','Hazardous substance'],
    'Technician', '', 
    '[{"name":"Daniel Sykes","signature_path":null},{"name":"Brooke Sampson","signature_path":null},{"name":"Mark Blackwell","signature_path":null}]'::jsonb,
    'Fitter & turner', 'Fitter & turner', 'Hand tools as required (including static plant, electrical, pneumatic)', 'TRX1480JTOMT11083, Terex-Finlay jaw',
    E'Mandatory PPE: steel-capped safety boots\nLong sleeve high-visibility clothing\nSafety glasses\nCut-resistant gloves\nHearing protection (when plant or nearby equipment is operating)\nHard hat (if required by site)',
    E'Loaded from the Word file SWMS_J1480-1083 (author Mark Blackwell, 20/03/2026). Check before approval: (1) the Word file lists the approver as Brooke Sampson, Service Administrator, with no signature; (2) a step covers falls from height but "Height > 2 Metres" and the work at height permit are not ticked; (3) hazardous substance is ticked but no SDS is listed for the hydraulic oil; (4) permits required and expected start date were blank.',
    jsonb_build_array(
      jsonb_build_object('section','','step','Arrive on site and report to Security','hazard','Interaction with mobile plant, site traffic','before',jsonb_build_array(3,4),'controls','Site induction, communication with site contact, obtain escort to ship, establish exclusion zone, hi-vis PPE','after',jsonb_build_array(1,3),'who','Technician','risk_id',null),
      jsonb_build_object('section','','step','Assess work area and ground conditions','hazard','Uneven ground, slips/trips','before',jsonb_build_array(3,3),'controls','Park on stable ground, chock wheels, good housekeeping','after',jsonb_build_array(1,3),'who','Technician','risk_id',null),
      jsonb_build_object('section','','step','Isolate plant (LOTO)','hazard','Stored energy, electrical shock','before',jsonb_build_array(5,3),'controls','Apply LOTO, release hydraulic pressure, verify zero energy','after',jsonb_build_array(1,2),'who','Technician','risk_id',null),
      jsonb_build_object('section','','step','Access service point','hazard','Falls from height','before',jsonb_build_array(3,4),'controls','Use fixed access ladders and platforms. Maintain 3 points of contact','after',jsonb_build_array(1,2),'who','Technician','risk_id',null),
      jsonb_build_object('section','','step','Remove guard panel','hazard','Pinch points, sharp edges','before',jsonb_build_array(4,3),'controls','Confirm isolation, use tools correctly, gloves, remove necessary guards only.','after',jsonb_build_array(1,2),'who','Technician','risk_id',null),
      jsonb_build_object('section','','step','Apply spill catchment','hazard','Hydraulic spills, slips, trips','before',jsonb_build_array(3,2),'controls','Place heavy-duty drip trays under the valve and hose connections, locate spill kit if available','after',jsonb_build_array(1,1),'who','Technician','risk_id',null),
      jsonb_build_object('section','','step','Remove/replacement of hydraulic valve','hazard','Manual handling, chemical exposure','before',jsonb_build_array(4,2),'controls','SDS Compliance, chemical PPE.','after',jsonb_build_array(1,2),'who','Technician','risk_id',null),
      jsonb_build_object('section','','step','System testing and re-pressurisation of valve','hazard','Component failure under pressure, "pinhole" leaks (injection injury)','before',jsonb_build_array(4,2),'controls',E'Clear all non-essential personnel\nNever use hands to check for leaks\nSlowly cycle function to air-bleed the system','after',jsonb_build_array(1,2),'who','Technician','risk_id',null),
      jsonb_build_object('section','','step','Clean up and sign off','hazard','Slip hazards from residue, incorrect waste disposal.','before',jsonb_build_array(3,2),'controls',E'Wipe down all surfaces with degreaser; dispose of oily rags in approved hazardous waste bins.\nRemove all LOTO devices.\nReport completion to the VWW Cargo Op Manager','after',jsonb_build_array(1,1),'who','Technician','risk_id',null)
    ));
end $$;
