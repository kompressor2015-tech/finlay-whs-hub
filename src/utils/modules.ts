/**
 * The WHS app's modules, in menu order, with the build step each one arrives in.
 * Training and tickets is left out on purpose: it is handled in another system for now.
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
  { id: 'documents', label: 'Documents', about: 'Policies and safe work procedures, versions, review dates and read-and-sign.', step: 5 },
  { id: 'plant', built: true, label: 'Plant safety', about: 'The safety view of the fleet register: flags from pre-starts, inspections and defects.', step: 3 },
  { id: 'risk', label: 'Risk & SWMS', about: 'Risk register, risk assessments, SWMS and JSAs, with approval.', step: 6 },
  { id: 'contractors', label: 'Contractors', about: 'Contractor insurance, licences, inductions and SWMS sign-off.', step: 6 },
  { id: 'reports', label: 'Reports', about: 'Dashboards, trends and exports.', step: 6 },
];

export function moduleById(id: string): WhsModule | undefined {
  return MODULES.find(m => m.id === id);
}
