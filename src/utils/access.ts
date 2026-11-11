/**
 * Who can use the WHS app, and what they see.
 *
 * Logins and the `profiles` table are shared with the fleet app. The fleet role
 * (`role`: admin / user / sales) is left alone; the WHS app reads a separate
 * `whs_role` column so one person can be, for example, a fleet "user" and a WHS
 * "supervisor" at the same time without the fleet app noticing.
 *
 *   fleet admin  : treated as a WHS admin (everything)
 *   whs_officer  : everything in the WHS app
 *   supervisor   : runs their site: reports, checks, actions, investigations
 *   field        : reports and checks from a phone, their own items
 *   (no whs_role): no access to the WHS app
 */

export type FleetRole = 'admin' | 'user' | 'sales';
export type WhsRole = 'whs_officer' | 'supervisor' | 'field';
export type WhsAccess = 'admin' | WhsRole;

export const WHS_ROLES: readonly WhsRole[] = ['whs_officer', 'supervisor', 'field'];

export function isWhsRole(value: unknown): value is WhsRole {
  return typeof value === 'string' && (WHS_ROLES as readonly string[]).includes(value);
}

/** The person's level of access to the WHS app, or null when they have none. */
export function whsAccessFor(profile: { role?: unknown; whs_role?: unknown; status?: unknown }): WhsAccess | null {
  if (profile.status && profile.status !== 'ACTIVE') return null;
  if (profile.role === 'admin') return 'admin';
  return isWhsRole(profile.whs_role) ? profile.whs_role : null;
}

export function accessLabel(access: WhsAccess): string {
  switch (access) {
    case 'admin':
      return 'Administrator';
    case 'whs_officer':
      return 'WHS officer';
    case 'supervisor':
      return 'Supervisor';
    case 'field':
      return 'Field staff';
  }
}

/** Office roles see the whole business; field staff start on the phone layout. */
export function isOfficeAccess(access: WhsAccess): boolean {
  return access !== 'field';
}

/** Modules that only office roles open (field staff report and check from the phone). */
const OFFICE_ONLY = new Set(['reports', 'risk', 'contractors']);

/** Injury management (claims, certificates, doctors) is for the WHS officer and admins only. */
const OFFICER_ONLY = new Set(['people']);

export function isOfficerAccess(access: WhsAccess): boolean {
  return access === 'admin' || access === 'whs_officer';
}

export function canOpenModule(access: WhsAccess, moduleId: string): boolean {
  if (OFFICER_ONLY.has(moduleId)) return isOfficerAccess(access);
  return isOfficeAccess(access) || !OFFICE_ONLY.has(moduleId);
}
