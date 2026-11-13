/**
 * The WHS app's modules, in menu order, with the build step each one arrives in.
 */

export interface WhsModule {
  id: string;
  label: string;
  /** One line on what the module is for */
  about: string;
  /** Build step it arrives in (see claude/whs-app-decisions.md in the Project) */
  step: number;
  /** Built and working (otherwise a placeholder page) */
  built?: boolean;
}

export const MODULES: readonly WhsModule[] = [
  { id: 'incidents', built: true, label: 'Incidents', about: 'Injuries, damage and near misses, with investigations and the WHSQ notifiable check.', step: 2 },
  { id: 'hazards', built: true, label: 'Hazards', about: 'Something unsafe someone has seen, reported from a phone with a photo.', step: 2 },
  { id: 'actions', built: true, label: 'Actions', about: 'Every corrective action from every module, with an owner and a due date.', step: 2 },
  { id: 'inspections', built: true, label: 'Inspections & checks', about: 'Pre-starts by unit number, Take 5s, and yard and workshop checklists.', step: 3 },
  { id: 'chemicals', built: true, label: 'Chemicals & SDS', about: 'The chemical register by site, safety data sheets and their review dates.', step: 4 },
  { id: 'documents', built: true, label: 'Documents', about: 'The management system, work instructions, SWMS, machine risk assessments, policies and forms, with versions and review dates.', step: 5 },
  { id: 'people', built: true, label: 'People & claims', about: 'Each worker\'s incidents, workers compensation claim, medical certificates, return to work plan and correspondence, in one file.', step: 2 },
  { id: 'recurring', built: true, label: 'Recurring checks', about: 'Fire extinguisher, first aid kit, emergency lighting and drill checks for each site, with the rule each one comes from.', step: 7 },
  { id: 'training', built: true, label: 'Training & site cover', about: 'First aiders and fire wardens for each site, and tickets that have run out or are about to.', step: 7 },
  { id: 'sites', built: true, label: 'Sites', about: 'The sites, the other names each goes by, and how often stocktakes are due.', step: 2 },
  { id: 'plant', built: true, label: 'Plant safety', about: 'The safety view of the fleet register: flags from pre-starts, inspections and defects.', step: 3 },
  { id: 'risk', label: 'Risk & SWMS', about: 'Risk register, risk assessments, SWMS and JSAs, with approval.', step: 6 },
  { id: 'contractors', label: 'Contractors', about: 'Contractor insurance, licences, inductions and SWMS sign-off.', step: 6 },
  { id: 'reports', label: 'Reports', about: 'Dashboards, trends and exports.', step: 6 },
];

export function moduleById(id: string): WhsModule | undefined {
  return MODULES.find(m => m.id === id);
}
