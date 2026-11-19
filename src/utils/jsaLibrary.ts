/**
 * A pick-list of common tasks for a JSA, grouped by the stage of a job. Picking one fills in what is done,
 * the hazards and the usual controls. Ratings are not filled in: the crew rate each step for the job in front of them.
 * Everything can still be typed in by hand or changed after picking.
 */

export interface LibraryTask { step: string; hazards: string[]; controls: string[] }
export interface Stage { id: string; label: string; hint: string; tasks: LibraryTask[] }

export const STAGES: Stage[] = [
  {
    id: 'arrive', label: 'Arriving on site', hint: 'Getting to the job and finding out what is different about this site.',
    tasks: [
      { step: 'Travel to site and park', hazards: ['Vehicle collision on the road or site entry', 'Fatigue after a long drive'], controls: ['Plan the trip and take breaks', 'Follow the site speed limits and traffic rules', 'Park in the marked area, clear of plant routes'] },
      { step: 'Sign in and complete the site induction', hazards: ['Not knowing the site rules, hazards or emergency arrangements'], controls: ['Sign in at the gate or office', 'Complete the site induction before entering', 'Ask for the site contact, muster point and emergency number'] },
      { step: 'Walk to the work area on foot', hazards: ['Struck by moving plant or vehicles', 'Slips, trips and falls on uneven ground'], controls: ['Wear hi-vis, hard hat and safety boots', 'Use marked walkways and make eye contact with plant operators', 'Watch where you step'] },
      { step: 'Check the work area and talk to the site contact', hazards: ['Unknown site hazards', 'Other contractors working nearby'], controls: ['Agree the work area, access and exclusion zone with the site contact', 'Ask about other work in the area', 'Stop and report anything that has changed'] },
      { step: 'Check for overhead lines and underground services', hazards: ['Contact with overhead powerlines', 'Striking buried services'], controls: ['Look up before moving or raising anything', 'Keep the required clearance from lines', 'Ask the site contact for service plans before digging'] },
      { step: 'Check the ground and weather', hazards: ['Machine sinking, tilting or rolling on soft or sloping ground', 'Heat, cold, rain, wind or lightning'], controls: ['Set up on firm, level ground', 'Do not work in lightning or high wind', 'Take drinking water and sun protection'] },
      { step: 'Review the JSA and sign on', hazards: ['Crew not aware of the plan or each other\'s tasks'], controls: ['Talk through the steps and who does what', 'Everyone signs on to the JSA before starting', 'Add any site-specific hazards to the JSA'] },
    ],
  },
  {
    id: 'setup', label: 'Setting up', hint: 'Getting the machine, tools and area ready before the main work starts.',
    tasks: [
      { step: 'Pre-start inspection of the machine', hazards: ['Unexpected movement or start-up', 'Fluid leaks, damaged guards or hoses', 'Slips on oily surfaces'], controls: ['Complete the pre-start checklist', 'Report and tag out any defect', 'Do not start the machine with faults that affect safety'] },
      { step: 'Set up the exclusion zone and signs', hazards: ['Other people entering the work area', 'Plant and vehicles near the work'], controls: ['Barricade the area and display signs', 'Use a spotter where plant is moving', 'Brief the site contact on the zone'] },
      { step: 'Isolate and lock out the machine', hazards: ['Unexpected start-up', 'Stored energy (hydraulic, pneumatic, gravity)'], controls: ['Stop the engine and isolate the battery or main isolator', 'Apply personal locks and tags', 'Release stored energy and test that it is dead before work starts'] },
      { step: 'Set up access: ladders, platforms and walkways', hazards: ['Fall from height', 'Dropped objects', 'Slips and trips'], controls: ['Use fixed platforms and rails where fitted', 'Inspect ladders and keep three points of contact', 'Use a harness above 2 m and keep the area below clear'] },
      { step: 'Position the crane, truck or lifting equipment', hazards: ['Dropped or swinging load', 'Equipment tipping', 'Crush between load and machine'], controls: ['Use a licensed operator and a dogman where needed', 'Check lifting gear is inspected and rated for the load', 'Keep everyone clear of the load'] },
      { step: 'Unload tools, parts and consumables', hazards: ['Manual handling strain', 'Crush from heavy components', 'Dropped items'], controls: ['Use trolleys, pallet jacks or lifting aids', 'Get help with heavy items and use team lifts', 'Stack parts stable and clear of walkways'] },
      { step: 'Set up the work area and tools', hazards: ['Trips over leads and hoses', 'Faulty electrical tools', 'Poor lighting'], controls: ['Check tools and leads are tagged and in good condition', 'Use RCDs on power tools', 'Keep leads and hoses off walkways and add lighting if needed'] },
      { step: 'Set up spill kit and fire extinguisher', hazards: ['Fuel or oil spill reaching the ground or drains', 'Fire'], controls: ['Place a spill kit and extinguisher at the work area', 'Park drip trays under work points', 'Check the extinguisher is in date'] },
    ],
  },
  {
    id: 'job', label: 'Doing the job', hint: 'The main work, one step at a time. Break it into the tasks you will actually do.',
    tasks: [
      { step: 'Change screen mesh or media', hazards: ['Crush and pinch points', 'Fall from height', 'Cuts and manual handling of mesh', 'Dust and noise'], controls: ['Isolate and lock out first', 'Use platforms and a harness above 2 m', 'Wear gloves, eye and hearing protection', 'Lift mesh with aids or a team lift'] },
      { step: 'Replace crusher wear parts (liners, jaw plates, cheek plates)', hazards: ['Dropped or swinging heavy parts', 'Crush and pinch', 'Hot parts and flying particles', 'Manual handling'], controls: ['Use rated lifting gear and a dogman', 'Isolate and lock out and block moving parts', 'Wear gloves, eye protection and hard hat', 'Keep clear of the load path'] },
      { step: 'Work on or near a conveyor', hazards: ['Entanglement and crush at moving belts and rollers', 'Falling material', 'Dust'], controls: ['Isolate and lock out before any work', 'Replace guards before restarting', 'Never clean or adjust while the belt is running'] },
      { step: 'Replace or repair a conveyor belt', hazards: ['Tension in the belt (stored energy)', 'Crush and pinch', 'Cuts from tools and belt edges', 'Manual handling'], controls: ['Release belt tension and lock out', 'Use belt clamps and rated lifting gear', 'Wear cut-resistant gloves'] },
      { step: 'Hydraulic hose or component repair', hazards: ['Hydraulic fluid under pressure (injection injury)', 'Hot oil', 'Slips on spilled oil'], controls: ['Isolate and release pressure first', 'Wear gloves and eye protection', 'Use a drip tray and clean spills straight away', 'Use a piece of cardboard, not a hand, to check for leaks'] },
      { step: 'Engine service: oil, fuel and air filters', hazards: ['Hot oil and surfaces', 'Fuel spill and fire', 'Skin contact with oil and diesel'], controls: ['Let the engine cool and isolate it', 'Use drip trays and dispose of oil and filters properly', 'Wear gloves and no ignition sources near fuel'] },
      { step: 'Grease and lubricate', hazards: ['Moving parts', 'Slips on grease', 'Skin contact with grease'], controls: ['Stop and lock out the machine', 'Wipe up any spills', 'Wear gloves and wash hands after'] },
      { step: 'Welding, cutting or grinding', hazards: ['Fire and sparks', 'Burns and arc eye', 'Fumes and flying particles', 'Electric shock'], controls: ['Check the area is clear of fuel and flammables, with an extinguisher ready', 'Wear welding PPE, eye and face protection', 'Ventilate the area', 'Use a hot work permit if the site requires one'] },
      { step: 'Work under raised or suspended parts', hazards: ['Crush if the part falls or drops'], controls: ['Support the part with rated stands or blocks, never hydraulics or a jack alone', 'Keep the body clear of the load path', 'Lock out before reaching in'] },
      { step: 'Lifting and moving heavy components', hazards: ['Manual handling strain', 'Crush', 'Dropped load'], controls: ['Use a crane, forklift or lifting aid', 'Check the weight and the lifting points', 'Use team lifts for loads above safe limits'] },
      { step: 'Work in dusty conditions', hazards: ['Respirable dust and silica', 'Eye injury'], controls: ['Use water suppression where possible', 'Wear a P2 respirator and eye protection', 'Do not blow down with compressed air'] },
      { step: 'Work near operating plant', hazards: ['Struck by plant or material', 'Noise', 'Poor communication with operators'], controls: ['Agree signals and keep eye contact with operators', 'Wear hi-vis and hearing protection', 'Keep out of blind spots and use a spotter'] },
      { step: 'Tracking or moving the machine', hazards: ['Crush injury', 'Contact with overhead wires', 'Others in the path of travel'], controls: ['Use a second person to keep others away', 'Check the area and look up', 'Make sure the machine is out of isolation and the area is clear before moving'] },
      { step: 'Fault finding and electrical checks', hazards: ['Electric shock', 'Arc flash', 'Unexpected start-up'], controls: ['Only a licensed person does electrical work', 'Isolate, lock out and test before touching', 'Use insulated tools and a tested instrument'] },
    ],
  },
  {
    id: 'test', label: 'Testing and handover', hint: 'Putting the machine back into service and handing it over safely.',
    tasks: [
      { step: 'Final inspection of the work', hazards: ['Loose bolts, guards or fittings missed', 'Fluid leaks'], controls: ['Check torque, guards and fittings', 'Look for leaks and report anything not fixed to the supervisor', 'Check tools and parts are removed from the machine'] },
      { step: 'Remove locks and restore power', hazards: ['Someone still working on the machine when it is re-energised'], controls: ['Each person removes their own lock', 'Account for all crew before restarting', 'Warn others in the area'] },
      { step: 'Start up and test run', hazards: ['Unexpected movement', 'Noise', 'Exhaust fumes', 'Leaks under pressure'], controls: ['Sound the horn and check the area is clear', 'Run the engine in a ventilated area', 'Stay clear of moving parts and watch for leaks during the run'] },
      { step: 'Hand the machine back to the operator or site contact', hazards: ['Machine returned to service with faults or defects unknown to the operator'], controls: ['Brief them on what was done and anything outstanding', 'Complete the service sheet or worksheet', 'Remove all tags and signs that are no longer needed'] },
    ],
  },
  {
    id: 'packup', label: 'Packing up', hint: 'Cleaning up and making the area safe before you leave.',
    tasks: [
      { step: 'Clean up the work area', hazards: ['Slips, trips and falls', 'Skin contact with oil and chemicals'], controls: ['Remove rubbish, offcuts and worn parts', 'Use absorbent on spills and dispose of it correctly', 'Wear gloves'] },
      { step: 'Dispose of oil, filters and waste', hazards: ['Spillage to ground or drains', 'Skin contact', 'Manual handling of drums'], controls: ['Use sealed containers', 'Take waste away or use the site waste area', 'Keep a spill kit at hand'] },
      { step: 'Count tools and equipment', hazards: ['Tools left on or in the machine'], controls: ['Count tools against the list', 'Check inside and under the machine'] },
      { step: 'Remove barricades and signs', hazards: ['Trips', 'Vehicles near the work area'], controls: ['Pack up barricades and signs last', 'Tell the site contact the area is clear'] },
      { step: 'Load tools and equipment onto the vehicle', hazards: ['Manual handling strain', 'Falls from the vehicle tray', 'Unsecured load'], controls: ['Use lifting aids and get help for heavy items', 'Do not jump from trays', 'Secure the load before moving'] },
    ],
  },
  {
    id: 'leave', label: 'Leaving site', hint: 'Signing out and getting away safely.',
    tasks: [
      { step: 'Sign out and talk to the site contact', hazards: ['Site not told the work is finished or what was left'], controls: ['Sign out at the gate or office', 'Report any incidents, near misses and hazards', 'Pass on any follow-up work needed'] },
      { step: 'Load the machine onto a truck or trailer', hazards: ['Machine rolling or falling from the ramps', 'Crush', 'Overhead lines'], controls: ['Use a trained operator and a spotter', 'Check the truck width and ramp angle', 'Chain down the machine and check the load restraint'] },
      { step: 'Drive from site', hazards: ['Collision with site traffic or on the road', 'Fatigue', 'Unsecured load'], controls: ['Check the load and the area around the vehicle', 'Follow site speed limits and give way to plant', 'Take a break if tired before a long drive'] },
    ],
  },
];

export const stageById = (id: string): Stage | undefined => STAGES.find(s => s.id === id);

/** The stage whose label matches a step's section, if any. */
export const stageOf = (section: string): Stage | undefined => STAGES.find(s => s.label.toLowerCase() === section.trim().toLowerCase());

/** Adds lines to a block of text one per line, skipping any already there. */
export function mergeLines(existing: string, add: string[]): string {
  const have = existing.split('\n').map(l => l.trim()).filter(Boolean);
  const out = [...have];
  for (const a of add) if (!have.some(h => h.toLowerCase() === a.toLowerCase())) out.push(a);
  return out.join('\n');
}
