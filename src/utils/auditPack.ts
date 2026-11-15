/**
 * The audit pack: the records an auditor asks for, one sheet per section, for a date range and site.
 * Pure: it takes what has been loaded and builds the sheets.
 */

import { brisbaneDay, formatDay } from './dates.ts';
import { inScope, type ScopeSite } from './siteScope.ts';
import { incidentTypeLabel, type Hazard, type Incident, type WhsAction } from './records.ts';
import type { Check } from './checks.ts';
import type { Claim } from './claims.ts';
import type { Risk } from './risks.ts';
import type { Swms, SwmsVersion } from './swms.ts';
import type { SignOn } from './signon.ts';
import type { Ticket } from './tickets.ts';
import type { RecurringCheck, CheckLogLine } from './recurringChecks.ts';
import type { WhsDocument } from './documents.ts';
import type { Chemical, Sds } from './chemicals.ts';
import { riskCode } from './risks.ts';
import type { Sheet, Cell } from './xlsx.ts';

export type SectionId = 'incidents' | 'hazards' | 'actions' | 'checks' | 'recurring' | 'training' | 'risks' | 'swms' | 'chemicals' | 'documents' | 'claims';

export const SECTIONS: { id: SectionId; label: string; about: string; officerOnly?: boolean; dated: boolean }[] = [
  { id: 'incidents', label: 'Incident register', about: 'Every incident with type, status, notifiable and investigation dates.', dated: true },
  { id: 'hazards', label: 'Hazard register', about: 'Hazards reported, how serious, and when closed.', dated: true },
  { id: 'actions', label: 'Corrective actions', about: 'Every action with owner, due date and when it was done.', dated: true },
  { id: 'checks', label: 'Inspections, pre-starts and Take 5s', about: 'The checks done, one line each (answers are in the app).', dated: true },
  { id: 'recurring', label: 'Recurring checks', about: 'Fire extinguishers, first aid kits, emergency lighting and drills: the rule and each time done.', dated: true },
  { id: 'training', label: 'Training tickets', about: 'Every ticket and licence with expiry.', dated: false },
  { id: 'risks', label: 'Risk register', about: 'Risks with before and after ratings under the Finlay matrix.', dated: false },
  { id: 'swms', label: 'SWMS, approvals and sign-ons', about: 'Each SWMS version, who approved it and when, and how many have signed on.', dated: false },
  { id: 'chemicals', label: 'Chemical register and SDS', about: 'Chemicals with the date of their current safety data sheet.', dated: false },
  { id: 'documents', label: 'Document register', about: 'Management system documents with review dates.', dated: false },
  { id: 'claims', label: 'Workers compensation claims', about: 'Claim status and time off work. Only the WHS officer and admins can include this.', officerOnly: true, dated: true },
];

export interface PackInput {
  from: string; // YYYY-MM-DD
  to: string;
  site: ScopeSite | null;
  siteNames: Record<string, string>;
  incidents?: Incident[];
  hazards?: Hazard[];
  actions?: WhsAction[];
  checks?: Pick<Check, 'id' | 'kind' | 'checklist_name' | 'unit_no' | 'site_id' | 'site_name' | 'done_by_name' | 'done_at' | 'result' | 'issue_count'>[];
  recurring?: { checks: RecurringCheck[]; log: CheckLogLine[] };
  tickets?: Ticket[];
  people?: Record<string, string>;
  risks?: Risk[];
  swms?: { swms: Swms[]; versions: SwmsVersion[]; signOns: SignOn[] };
  chemicals?: { chemicals: Chemical[]; sds: Sds[] };
  documents?: WhsDocument[];
  claims?: Claim[];
}

const d = (v: string | null | undefined) => (v ? formatDay(brisbaneDay(v)) : '');
const within = (iso: string | null | undefined, from: string, to: string) => {
  if (!iso) return false;
  const day = brisbaneDay(iso);
  return day >= from && day <= to;
};
const siteOf = (i: PackInput, id: string | null | undefined, name?: string | null) => (id && i.siteNames[id]) || name || '';
const keep = (i: PackInput, rec: { site_id?: string | null; site_name?: string | null }) => inScope(i.site, rec);

function incidents(i: PackInput): Sheet {
  const rows = (i.incidents ?? []).filter(x => within(x.occurred_at, i.from, i.to) && keep(i, x)).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  return { name: 'Incidents', columns: ['Ref', 'Date', 'Type', 'Site', 'People', 'Description', 'Status', 'Notifiable', 'WHSQ called', 'Investigation due', 'Closed'],
    rows: rows.map(x => [x.ref, d(x.occurred_at), incidentTypeLabel(x.type), siteOf(i, x.site_id, x.site_name), x.people, x.description, x.status, x.notifiable ? 'Yes' : 'No', d(x.whsq_called_at), d(x.investigation_due), d(x.closed_at)]) };
}
function hazards(i: PackInput): Sheet {
  const rows = (i.hazards ?? []).filter(x => within(x.created_at, i.from, i.to) && keep(i, x)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { name: 'Hazards', columns: ['Ref', 'Reported', 'Site', 'Description', 'Severity', 'Made safe', 'Status', 'Closed', 'Reported by'],
    rows: rows.map(x => [x.ref, d(x.created_at), siteOf(i, x.site_id, x.site_name), x.description, x.severity, x.made_safe, x.status, d(x.closed_at), x.reporter_name]) };
}
function actions(i: PackInput): Sheet {
  const inc = new Map((i.incidents ?? []).map(x => [x.id, x])); const haz = new Map((i.hazards ?? []).map(x => [x.id, x]));
  const rows = (i.actions ?? []).filter(a => {
    if (!within(a.created_at, i.from, i.to)) return false;
    if (!i.site) return true;
    const src = a.source_id ? (inc.get(a.source_id) ?? haz.get(a.source_id)) : null;
    return !!src && keep(i, src);
  }).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { name: 'Actions', columns: ['Action', 'From', 'Owner', 'Created', 'Due', 'Status', 'Done', 'Note'],
    rows: rows.map(a => [a.title, a.source_ref, a.owner_name, d(a.created_at), d(a.due), a.status, d(a.done_at), a.done_note]) };
}
function checks(i: PackInput): Sheet {
  const rows = (i.checks ?? []).filter(c => within(c.done_at, i.from, i.to) && keep(i, c)).sort((a, b) => a.done_at.localeCompare(b.done_at));
  return { name: 'Checks', columns: ['Date', 'Kind', 'Checklist', 'Unit', 'Site', 'Done by', 'Result', 'Issues'],
    rows: rows.map(c => [d(c.done_at), c.kind, c.checklist_name, c.unit_no, siteOf(i, c.site_id, c.site_name), c.done_by_name, c.result, c.issue_count]) };
}
function recurring(i: PackInput): Sheet[] {
  const r = i.recurring; if (!r) return [];
  const byId = new Map(r.checks.map(c => [c.id, c]));
  const sites = (c: RecurringCheck) => !i.site || c.site_id === i.site.id;
  return [
    { name: 'Recurring checks', columns: ['Site', 'Check', 'Category', 'Every (months)', 'Rule it comes from', 'Rule confirmed'],
      rows: r.checks.filter(sites).map(c => [siteOf(i, c.site_id), c.name, c.category, c.interval_months, c.basis, c.rule_confirmed ? 'Yes' : 'To confirm']) },
    { name: 'Recurring check log', columns: ['Date', 'Site', 'Check', 'Done by', 'Company', 'Result', 'Notes'],
      rows: r.log.filter(l => l.done_on >= i.from && l.done_on <= i.to).filter(l => { const c = byId.get(l.check_id); return !!c && sites(c); })
        .sort((a, b) => a.done_on.localeCompare(b.done_on)).map(l => { const c = byId.get(l.check_id)!; return [formatDay(l.done_on), siteOf(i, c.site_id), c.name, l.done_by_name, l.company, l.result, l.notes]; }) },
  ];
}
function training(i: PackInput): Sheet {
  return { name: 'Tickets', columns: ['Person', 'Ticket', 'Number', 'Issued', 'Expires', 'Provider'],
    rows: (i.tickets ?? []).map(t => [i.people?.[t.person_id] ?? '', t.name, t.number, formatDay(t.issued_on), formatDay(t.expires_on), t.provider]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) };
}
function risks(i: PackInput): Sheet {
  const rows = (i.risks ?? []).filter(r => !i.site || r.site_id === i.site.id || !r.site_id);
  return { name: 'Risk register', columns: ['Ref', 'Risk', 'Category', 'Site', 'Before', 'After', 'Owner', 'Reviewed', 'Review every (months)', 'Status'],
    rows: rows.map(r => [r.ref, r.title, r.category, siteOf(i, r.site_id) || 'All sites', riskCode(r.before_likelihood, r.before_consequence), r.after_likelihood ? riskCode(r.after_likelihood, r.after_consequence) : '', r.owner_name, formatDay(r.reviewed_on), r.review_months, r.status]) };
}
function swms(i: PackInput): Sheet[] {
  const s = i.swms; if (!s) return [];
  const list = s.swms.filter(x => !i.site || x.site_id === i.site.id || !x.site_id);
  const ids = new Set(list.map(x => x.id));
  const rows: Cell[][] = [];
  for (const sw of list) {
    for (const v of s.versions.filter(v => v.swms_id === sw.id).sort((a, b) => a.version - b.version)) {
      const signed = s.signOns.filter(o => o.version_id === v.id).length;
      rows.push([sw.swms_number || sw.ref, sw.title, v.version, v.status, v.supervisor_name, formatDay(v.expected_start), signed]);
    }
  }
  return [{ name: 'SWMS', columns: ['SWMS', 'Title', 'Version', 'Status', 'Supervisor', 'Expected start', 'Sign-ons'], rows },
    { name: 'SWMS sign-ons', columns: ['SWMS', 'Version', 'Signed by', 'Company', 'Date', 'How'],
      rows: s.signOns.filter(o => ids.has(o.swms_id) && within(o.signed_at, i.from, i.to)).sort((a, b) => a.signed_at.localeCompare(b.signed_at)).map(o => {
        const sw = list.find(x => x.id === o.swms_id)!; const v = s.versions.find(x => x.id === o.version_id);
        return [sw.swms_number || sw.ref, v?.version ?? '', o.signer_name, o.company, d(o.signed_at), o.method === 'self' ? 'Signed on phone' : `Recorded by ${o.recorded_by_name}`];
      }) }];
}
function chemicals(i: PackInput): Sheet {
  const c = i.chemicals; if (!c) return { name: 'Chemicals', columns: [], rows: [] };
  const latest = new Map<string, Sds>();
  for (const s of c.sds) { const cur = latest.get(s.chemical_id); if (!cur || s.issue_date > cur.issue_date) latest.set(s.chemical_id, s); }
  return { name: 'Chemicals', columns: ['Chemical', 'Manufacturer', 'DG class', 'Packing group', 'UN number', 'SDS issue date', 'SDS on file', 'Class checked'],
    rows: c.chemicals.filter(x => x.active).map(x => { const s = latest.get(x.id); return [x.name, x.manufacturer, x.dg_class ?? '', x.packing_group ?? '', x.un_number ?? '', s ? formatDay(s.issue_date) : '', s ? 'Yes' : 'No', x.class_confirmed ? 'Yes' : 'No']; }) };
}
function documents(i: PackInput): Sheet {
  return { name: 'Documents', columns: ['Number', 'Title', 'Type', 'Site', 'Owner', 'Reviewed', 'Review every (months)'],
    rows: (i.documents ?? []).filter(x => x.active && (!i.site || !x.site_id || x.site_id === i.site.id)).map(x => [x.doc_no, x.title, x.doc_type, siteOf(i, x.site_id) || 'All sites', x.owner_name, formatDay(x.reviewed_on), x.review_months]) };
}
function claims(i: PackInput): Sheet {
  const inc = new Map((i.incidents ?? []).map(x => [x.id, x]));
  const rows = (i.claims ?? []).filter(c => {
    const day = c.injury_date ?? c.created_at;
    return within(day, i.from, i.to) && (!i.site || keep(i, inc.get(c.incident_id) ?? {}));
  });
  return { name: 'Claims', columns: ['Incident', 'Worker', 'State', 'Claim number', 'Status', 'Injury date', 'Off work from', 'Returned', 'Return to work'],
    rows: rows.map(c => [inc.get(c.incident_id)?.ref ?? '', i.people?.[c.person_id] ?? '', c.state, c.claim_no, c.status, formatDay(c.injury_date), formatDay(c.off_work_from), formatDay(c.returned_on), c.rtw_status]) };
}

export function buildPack(sections: SectionId[], input: PackInput): Sheet[] {
  const out: Sheet[] = [];
  for (const id of sections) {
    if (id === 'incidents') out.push(incidents(input));
    else if (id === 'hazards') out.push(hazards(input));
    else if (id === 'actions') out.push(actions(input));
    else if (id === 'checks') out.push(checks(input));
    else if (id === 'recurring') out.push(...recurring(input));
    else if (id === 'training') out.push(training(input));
    else if (id === 'risks') out.push(risks(input));
    else if (id === 'swms') out.push(...swms(input));
    else if (id === 'chemicals') out.push(chemicals(input));
    else if (id === 'documents') out.push(documents(input));
    else if (id === 'claims') out.push(claims(input));
  }
  return out;
}

/** A cover sheet saying what the pack holds. */
export function coverSheet(input: PackInput, sheets: Sheet[], who: string, now: Date = new Date()): Sheet {
  return { name: 'Cover', columns: ['Finlay WHS audit pack', ''],
    rows: [['Site', input.site?.name ?? 'All sites'], ['From', formatDay(input.from)], ['To', formatDay(input.to)], ['Built', formatDay(brisbaneDay(now))], ['Built by', who], ['', ''],
      ...sheets.map(s => [s.name, `${s.rows.length} rows`] as Cell[])] };
}
