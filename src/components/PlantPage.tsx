import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { clearFlag, latestFleetRatings, listChecks, listFleetUnits, listFlags, type FleetUnit } from '../services/checks.ts';
import type { WhsUser } from '../services/auth.ts';
import { hrefFor } from '../hooks/useRoute.ts';
import { isOfficeAccess } from '../utils/access.ts';
import { formatWhen } from '../utils/dates.ts';
import { looseMatch } from '../utils/search.ts';
import { flagByUnit, flagPill, openFlags, type Check, type PlantFlag } from '../utils/checks.ts';
import { ErrorNote, Field } from './Form.tsx';
import { Pill } from './Pill.tsx';

const th = 'px-2 py-3 font-semibold border-b border-[#EEEBE6] text-left';
const td = 'px-2 py-3 border-b border-line-soft align-top';

function ClearDialog({ flag, onClose, onDone }: { flag: PlantFlag | null; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (flag && !d.open) {
      setNote('');
      setError(null);
      d.showModal();
    }
    if (!flag && d.open) d.close();
  }, [flag]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!flag) return;
    if (!note.trim()) return setError('Say why the unit is safe to use again.');
    setBusy(true);
    const res = await clearFlag(flag.id, note.trim());
    setBusy(false);
    if (res.error) return setError(res.error);
    onDone();
  }

  return (
    <dialog ref={ref} onClose={onClose} className="rounded-xl border border-line p-0 w-[min(460px,calc(100vw-32px))] backdrop:bg-black/40">
      <form onSubmit={submit} className="p-5 flex flex-col gap-3.5">
        <h2 className="m-0 text-lg font-semibold">Clear the flag on unit <span className="text-finlay">{flag?.unit_no}</span></h2>
        <p className="m-0 text-sm text-muted">{flag?.reason}</p>
        <Field label="Why is it safe to use now?" htmlFor="clear-note">
          <textarea id="clear-note" rows={3} placeholder="e.g. Guard refitted and tested by [name]" className="w-full rounded-[10px] border border-[#D6D2CC] p-3 text-[15px]" value={note} onChange={e => setNote(e.target.value)} />
        </Field>
        <ErrorNote message={error} />
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="min-h-11 px-4 rounded-lg border border-line bg-white text-sm font-semibold cursor-pointer">Cancel</button>
          <button type="submit" disabled={busy} className="min-h-11 px-4 rounded-lg border-0 bg-ink text-white text-sm font-semibold cursor-pointer disabled:opacity-60">{busy ? 'Saving…' : 'Clear flag'}</button>
        </div>
      </form>
    </dialog>
  );
}

/** Safety flags on the fleet, and every unit with its last pre-start and the Fleet Hub's own checks. */
export function PlantPage({ user }: { user: WhsUser }) {
  const office = isOfficeAccess(user.access);
  const [flags, setFlags] = useState<PlantFlag[]>([]);
  const [units, setUnits] = useState<FleetUnit[]>([]);
  const [ratings, setRatings] = useState<Map<string, { rating: string; at: string }>>(new Map());
  const [prestarts, setPrestarts] = useState<Check[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState<PlantFlag | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const [f, u, r, c] = await Promise.all([listFlags(), listFleetUnits(), latestFleetRatings(), listChecks(60)]);
    setError(f.error ?? null);
    setFlags(f.data ?? []);
    setUnits(u);
    setRatings(r);
    setPrestarts((c.data ?? []).filter(x => x.kind === 'prestart'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = openFlags(flags);
  const byUnit = flagByUnit(flags);
  const lastByUnit = useMemo(() => {
    const m = new Map<string, Check>();
    for (const c of prestarts) if (!m.has(c.unit_no)) m.set(c.unit_no, c);
    return m;
  }, [prestarts]);
  const shown = units.filter(u => looseMatch(q, [u.unitNo, u.model, u.location, u.client]));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="m-0 text-[26px] font-bold">Plant safety</h1>
        <p className="mt-1.5 mb-0 text-muted text-[15px]">Safety flags on the fleet. Fleet details come from the Fleet Hub and are changed there.</p>
      </div>
      <ErrorNote message={error} />

      <section aria-label="Flagged units" className="flex flex-col gap-2.5">
        <h2 className="m-0 text-[17px] font-semibold">Flagged <span className="font-medium text-muted text-sm">{open.length} {open.length === 1 ? 'flag' : 'flags'}</span></h2>
        {open.length === 0 ? (
          <p className="m-0 bg-white border border-line rounded-xl px-4.5 py-5 text-sm text-muted">No units are flagged.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {open.map(f => {
              const p = flagPill(f.level);
              return (
                <div key={f.id} className={`bg-white border border-line rounded-xl overflow-hidden flex border-l-[6px] ${f.level === 'stop' ? 'border-l-finlay' : 'border-l-[#E0A030]'}`}>
                  <div className="px-4 py-3.5 flex flex-col gap-2 flex-1 min-w-0">
                    <div className="flex justify-between gap-2 items-center">
                      <span className="text-xl font-bold text-finlay">{f.unit_no} <span className="text-sm font-medium text-muted">{units.find(u => u.unitNo === f.unit_no)?.model}</span></span>
                      <Pill tone={p.tone}>{p.label}</Pill>
                    </div>
                    <div className="text-sm font-medium">{f.reason}</div>
                    <div className="text-[13px] text-muted">Raised {formatWhen(f.raised_at)} by {f.raised_by_name}</div>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {f.check_id && <a href={hrefFor({ name: 'check', id: f.check_id })} className="no-underline text-[13px] font-semibold border border-[#D6D2CC] rounded-lg px-3 min-h-10 flex items-center">Open pre-start</a>}
                      {office && <button type="button" onClick={() => setClearing(f)} className="text-[13px] font-semibold bg-ink text-white rounded-lg px-3 min-h-10 border-0 cursor-pointer">Clear flag</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <div className="flex flex-wrap justify-between gap-2.5 items-center">
          <h2 className="m-0 text-[17px] font-semibold">All units</h2>
          <label htmlFor="plant-q" className="sr-only">Search units</label>
          <input id="plant-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Unit, model or client" className="w-[260px] min-h-10 rounded-lg border border-[#D6D2CC] bg-white px-3 text-sm" />
        </div>
        <div className="bg-white border border-line rounded-xl overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[820px]">
            <thead>
              <tr className="text-muted text-xs uppercase tracking-wide">
                <th scope="col" className={`${th} pl-4`}>Unit</th><th scope="col" className={th}>Where</th><th scope="col" className={th}>Last pre-start</th>
                <th scope="col" className={th}>Workshop 360°</th><th scope="col" className={th}>Guarding</th><th scope="col" className={`${th} pr-4`}>WHS</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(u => {
                const flag = byUnit.get(u.unitNo);
                const last = lastByUnit.get(u.unitNo);
                const rating = ratings.get(u.unitNo);
                const p = flag ? flagPill(flag.level) : { label: 'OK', tone: 'green' as const };
                return (
                  <tr key={u.id}>
                    <td className={`${td} pl-4 whitespace-nowrap`}><span className="text-finlay font-bold">{u.unitNo}</span><span className="block text-xs text-muted">{u.model}</span></td>
                    <td className={`${td} text-muted`}>{u.client && /hire/i.test(u.status) ? `On hire · ${u.client}` : u.location || u.status}</td>
                    <td className={`${td} whitespace-nowrap`}>{last ? <a href={hrefFor({ name: 'check', id: last.id })}>{formatWhen(last.done_at)}</a> : '—'}</td>
                    <td className={`${td} whitespace-nowrap`}>{rating?.rating || '—'}</td>
                    <td className={`${td} whitespace-nowrap`}>{u.guarding ? u.guarding.charAt(0) + u.guarding.slice(1).toLowerCase().replace('_', ' ') : 'Not checked'}</td>
                    <td className={`${td} pr-4 whitespace-nowrap`}><Pill tone={p.tone}>{p.label}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {units.length === 0 && <p className="m-0 px-4 py-6 text-sm text-muted text-center">No units found in the fleet register.</p>}
        </div>
      </section>

      <ClearDialog flag={clearing} onClose={() => setClearing(null)} onDone={() => { setClearing(null); load(); }} />
    </div>
  );
}
