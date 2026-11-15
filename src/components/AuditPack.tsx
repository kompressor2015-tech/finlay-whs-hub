import { useState } from 'react';
import type { WhsUser } from '../services/auth.ts';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { listIncidents, listHazards, listActions } from '../services/records.ts';
import { listClaims } from '../services/claims.ts';
import { listTickets } from '../services/tickets.ts';
import { listPeople } from '../services/incidentFile.ts';
import { loadRisks } from '../services/risks.ts';
import { loadSwms } from '../services/swms.ts';
import { loadSignOns } from '../services/signon.ts';
import { loadRegister } from '../services/chemicals.ts';
import { listDocuments } from '../services/documents.ts';
import { loadChecks } from '../services/recurringChecks.ts';
import { listChecksForPack } from '../services/reports.ts';
import { buildPack, coverSheet, SECTIONS, type PackInput, type SectionId } from '../utils/auditPack.ts';
import { addDays, brisbaneDay } from '../utils/dates.ts';
import { downloadXlsx } from '../utils/xlsx.ts';
import { ErrorNote, inputClass } from './Form.tsx';

const primary = 'min-h-10 px-4 rounded-lg border-0 bg-finlay hover:bg-finlay-dark text-white text-sm font-bold cursor-pointer disabled:opacity-60';

/** The audit pack: tick what the auditor needs, choose the dates, download one Excel file. */
export function AuditPack({ user, officer }: { user: WhsUser; officer: boolean }) {
  const { site, sites } = useSiteScope();
  const today = brisbaneDay(new Date());
  const [from, setFrom] = useState(addDays(today, -365));
  const [to, setTo] = useState(today);
  const available = SECTIONS.filter(s => !s.officerOnly || officer);
  const [picked, setPicked] = useState<Set<SectionId>>(new Set(available.filter(s => s.id !== 'claims').map(s => s.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const toggle = (id: SectionId) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const build = async () => {
    setBusy(true); setError(null); setDone(null);
    try {
      const want = (id: SectionId) => picked.has(id);
      const input: PackInput = { from, to, site, siteNames: Object.fromEntries(sites.map(s => [s.id, s.name])) };
      const needIncidents = want('incidents') || want('actions') || want('claims');
      const [inc, haz, act, chk, rec, tix, ppl, risks, swms, sign, chem, docs, claims] = await Promise.all([
        needIncidents ? listIncidents() : null, want('hazards') || want('actions') ? listHazards() : null, want('actions') ? listActions() : null,
        want('checks') ? listChecksForPack(from, to) : null, want('recurring') ? loadChecks() : null,
        want('training') ? listTickets() : null, want('training') || want('claims') ? listPeople() : null,
        want('risks') ? loadRisks() : null, want('swms') ? loadSwms() : null, want('swms') ? loadSignOns() : null,
        want('chemicals') ? loadRegister() : null, want('documents') ? listDocuments() : null, want('claims') && officer ? listClaims() : null,
      ]);
      const failed = [inc, haz, act, rec, tix, ppl, risks, swms, sign, chem, docs, claims].find(r => r && 'error' in r && r.error);
      if (failed && 'error' in failed && failed.error) { setError(failed.error); return; }
      input.incidents = inc?.data; input.hazards = haz?.data; input.actions = act?.data;
      input.checks = (chk ?? undefined) as PackInput['checks'];
      input.recurring = rec?.data ? { checks: rec.data.checks, log: rec.data.log } : undefined;
      input.tickets = tix?.data; input.people = ppl?.data ? Object.fromEntries(ppl.data.map(p => [p.id, p.name])) : undefined;
      input.risks = risks?.data?.risks;
      input.swms = swms?.data ? { swms: swms.data.swms, versions: swms.data.versions, signOns: sign?.data ?? [] } : undefined;
      input.chemicals = chem?.data ? { chemicals: chem.data.chemicals, sds: chem.data.sds } : undefined;
      input.documents = docs?.data; input.claims = claims?.data;
      const order = SECTIONS.map(s => s.id).filter(id => picked.has(id));
      const sheets = buildPack(order, input);
      const file = `Finlay WHS audit pack ${from} to ${to}${site ? ` ${site.name}` : ''}.xlsx`;
      downloadXlsx(file, [coverSheet(input, sheets, user.name), ...sheets]);
      setDone(`Built ${sheets.length} sheet${sheets.length === 1 ? '' : 's'}: ${file}`);
    } finally { setBusy(false); }
  };

  return (
    <section className="bg-white border border-line rounded-xl p-4 flex flex-col gap-4 max-w-[860px]">
      <div>
        <h1 className="m-0 text-xl font-bold">Audit pack</h1>
        <p className="m-0 mt-1 text-sm text-muted">One Excel file with a sheet for each thing you tick. Site: <b>{site?.name ?? 'All sites'}</b> (change it at the top of the screen).</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">From<input type="date" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} className={`${inputClass} !min-h-10`} /></label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">To<input type="date" value={to} min={from} onChange={e => e.target.value && setTo(e.target.value)} className={`${inputClass} !min-h-10`} /></label>
      </div>
      <fieldset className="border-0 p-0 m-0 flex flex-col gap-2">
        <legend className="text-sm font-semibold mb-1">What to include</legend>
        {available.map(s => (
          <label key={s.id} className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-1 w-5 h-5" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
            <span><span className="font-semibold text-[15px]">{s.label}</span><span className="block text-xs text-muted">{s.about}{s.dated ? '' : ' (as they stand today, not limited to the dates)'}</span></span>
          </label>
        ))}
      </fieldset>
      <ErrorNote message={error} />
      {done && <div className="rounded-xl border border-[#BFE0C5] bg-[#E3F3E6] p-3 text-sm">{done}</div>}
      <div><button type="button" className={primary} disabled={busy || picked.size === 0} onClick={() => void build()}>{busy ? 'Building…' : 'Build and download'}</button></div>
    </section>
  );
}
