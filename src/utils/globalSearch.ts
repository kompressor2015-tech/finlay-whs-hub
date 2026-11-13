/**
 * The top bar search: one box that finds incidents, hazards, actions, chemicals and checks.
 * Respects the site switcher for the things that belong to a site.
 */

import { looseMatch } from './search.ts';
import { actionsInScope, inScope, type ScopeSite } from './siteScope.ts';
import { incidentTypeLabel } from './records.ts';
import type { HomeRaw } from './homeBuild.ts';
import { docTypeLabel } from './documents.ts';

export interface SearchHit {
  id: string;
  group: string;
  title: string;
  detail: string;
  href: string;
}

export const SEARCH_GROUPS = ['Incidents', 'Hazards', 'Actions', 'Chemicals', 'Documents', 'Checks', 'People'] as const;

const PER_GROUP = 5;

/** `people` is only passed for the WHS officer and admins, who are the ones who can open a person's file. */
export function searchAll(raw: HomeRaw, query: string, site: ScopeSite | null, people: { id: string; name: string; position: string; active?: boolean }[] = []): SearchHit[] {
  if (query.trim().length < 2) return [];
  const hits: SearchHit[] = [];
  const add = (group: string, items: SearchHit[]) => hits.push(...items.slice(0, PER_GROUP));

  add('Incidents', raw.incidents
    .filter(i => inScope(site, i) && looseMatch(query, [i.ref, i.description, i.site_name, i.unit_no, i.people, i.reporter_name]))
    .map(i => ({ id: i.id, group: 'Incidents', title: `${i.ref} · ${i.description.slice(0, 70)}`, detail: `${incidentTypeLabel(i.type)}${i.site_name ? ` · ${i.site_name}` : ''}`, href: `#/incidents/${i.id}` })));

  add('Hazards', raw.hazards
    .filter(h => inScope(site, h) && looseMatch(query, [h.ref, h.description, h.site_name, h.unit_no, h.reporter_name]))
    .map(h => ({ id: h.id, group: 'Hazards', title: `${h.ref} · ${h.description.slice(0, 70)}`, detail: h.site_name || 'Hazard', href: `#/hazards/${h.id}` })));

  add('Actions', actionsInScope(site, raw.actions, [...raw.incidents, ...raw.hazards, ...(raw.checks?.checks ?? [])])
    .filter(a => looseMatch(query, [a.title, a.source_ref, a.owner_name, a.unit_no]))
    .map(a => ({ id: a.id, group: 'Actions', title: a.title.slice(0, 80), detail: [a.source_ref, a.owner_name && `owner ${a.owner_name}`, a.status === 'done' ? 'done' : ''].filter(Boolean).join(' · '), href: '#/m/actions' })));

  add('Chemicals', (raw.register?.chemicals ?? [])
    .filter(c => c.active && looseMatch(query, [c.name, c.manufacturer, c.un_number, c.dg_class ? `class ${c.dg_class}` : '']))
    .map(c => ({ id: c.id, group: 'Chemicals', title: c.name, detail: [c.manufacturer, c.dg_class ? `Class ${c.dg_class}` : '', c.un_number ? `UN ${c.un_number}` : ''].filter(Boolean).join(' · '), href: `#/chemicals/${c.id}` })));

  add('Documents', (raw.documents ?? [])
    .filter(d => d.active && (!site || !d.site_id || d.site_id === site.id) && looseMatch(query, [d.doc_no, d.title, d.machine_model, docTypeLabel(d.doc_type)]))
    .map(d => ({ id: d.id, group: 'Documents', title: `${d.doc_no ? d.doc_no + ' · ' : ''}${d.title}`, detail: [docTypeLabel(d.doc_type), d.machine_model && `Model ${d.machine_model}`].filter(Boolean).join(' · '), href: `#/documents/${d.id}` })));

  add('Checks', (raw.checks?.checks ?? [])
    .filter(c => (c.kind === 'prestart' || inScope(site, c)) && looseMatch(query, [c.unit_no, c.task, c.checklist_name, c.done_by_name, c.site_name]))
    .map(c => ({
      id: c.id, group: 'Checks',
      title: c.kind === 'prestart' ? `Pre-start, unit ${c.unit_no}` : c.kind === 'take5' ? `Take 5: ${c.task}` : c.checklist_name,
      detail: `${c.done_by_name}${c.site_name ? ` · ${c.site_name}` : ''}`,
      href: `#/checks/${c.id}`,
    })));

  add('People', people
    .filter(p => looseMatch(query, [p.name, p.position]))
    .map(p => ({ id: p.id, group: 'People', title: p.name, detail: `${p.active === false ? 'Archived · ' : ''}${p.position || 'Worker file: incidents and claims'}`, href: `#/people/${p.id}` })));

  return hits;
}
