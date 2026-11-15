import { useCallback, useEffect, useState } from 'react';
import type { WhsUser } from '../services/auth.ts';
import { listPeople } from '../services/incidentFile.ts';
import { listTickets } from '../services/tickets.ts';
import { loadJobs, loadSignOns, myPersonId, removeSignOn } from '../services/signon.ts';
import { isOfficeAccess } from '../utils/access.ts';
import { formatDay } from '../utils/dates.ts';
import { jobTiming, signerKey, type Job, type SignOn } from '../utils/signon.ts';
import type { Swms, SwmsVersion } from '../utils/swms.ts';
import type { Ticket } from '../utils/tickets.ts';
import { askConfirm } from './ConfirmHost.tsx';
import { ErrorNote } from './Form.tsx';
import { Pill } from './Pill.tsx';
import { SignOnPanel } from './SignOnPanel.tsx';

const btn = 'min-h-10 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold cursor-pointer';
const primary = 'min-h-12 px-5 rounded-lg border-0 bg-finlay hover:bg-finlay-dark text-white text-[15px] font-bold cursor-pointer';

/** Sign on to the current approved version. Field staff sign themselves on; the office also sees the sheet and signs others on. */
export function SwmsSignOnSection({ swms, version, user }: { swms: Swms; version: SwmsVersion; user: WhsUser }) {
  const office = isOfficeAccess(user.access);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [signons, setSignons] = useState<SignOn[]>([]);
  const [mine, setMine] = useState<string | null>(null);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [open, setOpen] = useState<'self' | 'office' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [j, s, m] = await Promise.all([loadJobs(), loadSignOns(), myPersonId()]);
    if (j.error || s.error) { setError(j.error ?? s.error ?? null); return; }
    setError(null);
    const linked = new Set((j.data?.jobSwms ?? []).filter(l => l.swms_id === swms.id).map(l => l.job_id));
    setJobs((j.data?.jobs ?? []).filter(x => linked.has(x.id) && ['running', 'upcoming', 'undated'].includes(jobTiming(x))));
    setSignons((s.data ?? []).filter(x => x.swms_id === swms.id));
    setMine(m);
    if (office) {
      const [p, t] = await Promise.all([listPeople(), listTickets()]);
      setPeople((p.data ?? []).filter(x => x.active).map(x => ({ id: x.id, name: x.name })));
      setTickets(t.data ?? []);
    }
  }, [swms.id, office]);
  useEffect(() => { void load(); }, [load]);

  const current = signons.filter(s => s.version_id === version.id);
  const iSigned = mine ? current.find(s => s.person_id === mine) : undefined;
  const signedKeys = new Set(current.map(signerKey));
  // People who signed an earlier version and have not signed this one
  const againMap = new Map<string, SignOn>();
  for (const s of signons) if (s.version_id !== version.id && !signedKeys.has(signerKey(s))) againMap.set(signerKey(s), s);
  const again: SignOn[] = Array.from(againMap.values());
  const done = () => { setOpen(null); void load(); };

  return (
    <section className="bg-white border border-line rounded-xl p-4 flex flex-col gap-3 print:hidden" aria-label="Sign on">
      <h2 className="m-0 text-base font-bold">Sign on</h2>
      <ErrorNote message={error} />
      {iSigned ? (
        <div className="rounded-lg border border-[#BFE3C6] bg-[#E8F6EA] p-3 text-sm"><b>You are signed on</b> to version {version.version}, on {formatDay(iSigned.signed_at.slice(0, 10))}.</div>
      ) : open === 'self' ? (
        <SignOnPanel swms={swms} version={version} jobs={jobs} mode="self" personId={mine} onDone={done} />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-sm text-muted">Read the steps above, then sign on. Version {version.version} is the approved one.</p>
          <div><button type="button" className={primary} onClick={() => setOpen('self')}>Sign on</button></div>
        </div>
      )}

      {office && (
        <div className="border-t border-line-soft pt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="m-0 text-sm font-bold">Sign-on sheet, version {version.version}</h3>
            <span className="text-xs text-muted">{current.length} signed</span>
            {open !== 'office' && <button type="button" className={`${btn} ml-auto`} onClick={() => setOpen('office')}>Sign someone on</button>}
          </div>
          {open === 'office' && (
            <div className="border border-line rounded-xl p-3.5">
              <SignOnPanel swms={swms} version={version} jobs={jobs} mode="office" people={people} tickets={tickets} onDone={done} />
            </div>
          )}
          {current.length === 0 ? <p className="m-0 text-sm text-muted">No one has signed on to this version yet.</p> : (
            <div className="border border-line rounded-xl overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead><tr className="text-left"><th className="px-3 py-2 font-semibold">Name</th><th className="px-3 py-2 font-semibold">Company</th><th className="px-3 py-2 font-semibold">Job</th><th className="px-3 py-2 font-semibold">Signed</th><th className="px-3 py-2" /></tr></thead>
                <tbody>
                  {current.map(s => (
                    <tr key={s.id} className="border-t border-line-soft">
                      <td className="px-3 py-2 font-semibold">{s.signer_name}</td>
                      <td className="px-3 py-2">{s.company}</td>
                      <td className="px-3 py-2">{jobs.find(j => j.id === s.job_id)?.name ?? (s.job_id ? 'A job' : '—')}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDay(s.signed_at.slice(0, 10))}{s.method === 'recorded' && <span className="block text-xs text-muted">Recorded by {s.recorded_by_name}</span>}</td>
                      <td className="px-3 py-2 text-right">{user.access === 'admin' && <button type="button" className={btn} onClick={async () => { if (await askConfirm({ title: `Remove ${s.signer_name}'s sign-on?`, body: 'Only do this for a sign-on entered by mistake.', confirmLabel: 'Remove', danger: true })) { const r = await removeSignOn(s.id); if (r.error) setError(r.error); else void load(); } }}>Remove</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {again.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Pill tone="amber">Sign again</Pill>
              <span>Signed an earlier version only: {again.map(a => a.signer_name).join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
