/**
 * The site switcher: which site the whole app is looking at. "All sites" is null.
 * Records are matched by the site they were reported against, by id or by the site's name.
 */

export interface ScopeSite {
  id: string;
  name: string;
}

export const ALL_SITES = 'all';

/** The word that identifies a site in free text, e.g. "Burpengary Yard" -> "burpengary". */
export function siteKey(name: string): string {
  return name.trim().toLowerCase().split(/\s+/)[0] ?? '';
}

export function pickSite(sites: ScopeSite[], id: string | null | undefined): ScopeSite | null {
  return (id && id !== ALL_SITES && sites.find(s => s.id === id)) || null;
}

/** True when the record belongs to the chosen site. With no site chosen, everything is in. */
export function inScope(site: ScopeSite | null, rec: { site_id?: string | null; site_name?: string | null }): boolean {
  if (!site) return true;
  if (rec.site_id && (rec.site_id === site.id)) return true;
  const key = siteKey(site.name);
  return !!key && (rec.site_name ?? '').toLowerCase().includes(key);
}

/**
 * Actions belong to a site through what they came from (an incident, hazard or inspection at that
 * site). Actions raised by hand have no site, so they only show under "All sites".
 */
export function actionsInScope<A extends { source_id: string | null }>(
  site: ScopeSite | null,
  actions: A[],
  sources: { id: string; site_id?: string | null; site_name?: string | null }[],
): A[] {
  if (!site) return actions;
  const ids = new Set(sources.filter(s => inScope(site, s)).map(s => s.id));
  return actions.filter(a => a.source_id !== null && ids.has(a.source_id));
}
