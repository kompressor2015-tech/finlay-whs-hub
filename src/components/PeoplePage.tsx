import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WhsUser } from '../services/auth.ts';
import { listAppointmentsFor, listCertificates, listClaims } from '../services/claims.ts';
import { createPerson, listPeople } from '../services/incidentFile.ts';
import { go, hrefFor } from '../hooks/useRoute.ts';
import { claimAttention, claimStatus, daysOffWork, isOpen, isOffWork, STATES, type Certificate, type Claim, type ClaimAttention } from '../utils/claims.ts';
import type { Person } from '../utils/incidentFile.ts';
import { ErrorNote, Field, inputClass } from './Form.tsx';
import { Pill } from './Pill.tsx';

const card = 'bg-white border border-line rounded-xl';
const toneBg: Record<string, string> = { red: 'bg-[#FDE8E8] text-[#9B1218]', amber: 'bg-[#FFF1D6] text-[#7A4B00]', green: 'bg-[#E3F4E6] text-[#1F6B2E]', blue: 'bg-[#E4EEFC] text-[#1C4A8F]', grey: 'bg-[#ECECEC] text-[#4A4A50]' };

/** Everyone with a file, open claims first. WHS officer and admin only. */
export function PeoplePage({ user: _user }: { user: WhsUser }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [att, setAtt] = useState<Record<string, ClaimAttention[]>>({});
  const [q, setQ] = useState('');
  const [only, setOnly] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([listPeople(), listClaims()]);
    setError(p.error ?? c.error ?? null);
    setPeople(p.data ?? []);
    const list = c.data ?? [];
    setClaims(list);
    const appts = (await listAppointmentsFor(list.filter(isOpen).map(x => x.id))).data ?? [];
    const certs = await Promise.all(list.filter(isOpen).map(async x => [x, (await listCertificates(x.id)).data ?? []] as [Claim, Certificate[]]));
    const next: Record<string, ClaimAttention[]> = {};
    for (const [x, cs] of certs) next[x.id] = claimAttention(x, cs, x.injury_date ? `${x.injury_date}T12:00:00+10:00` : x.created_at, new Date(), appts.filter(a => a.claim_id === x.id));
    setAtt(next);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return people
      .map(p => ({ p, mine: claims.filter(c => c.person_id === p.id) }))
      .filter(r => (!only || r.mine.length > 0) && (!t || r.p.name.toLowerCase().includes(t) || r.p.position.toLowerCase().includes(t)))
      .sort((a, b) => {
        const score = (m: Claim[]) => m.reduce((s, c) => s + (att[c.id] ?? []).reduce((n, x) => n + (x.tone === 'red' ? 100 : x.tone === 'amber' ? 10 : 1), 0), 0);
        return score(b.mine) - score(a.mine) || a.p.name.localeCompare(b.p.name);
      });
  }, [people, claims, att, q, only]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-bold">People &amp; claims</h1>
          <p className="mt-1.5 mb-0 text-muted text-[15px]">Each worker&apos;s incidents, claim, certificates, return to work and correspondence. Visible to the WHS officer and admins only.</p>
        </div>
        <button type="button" className="min-h-10 px-4 rounded-lg border border-[#D6D2CC] bg-white text-[13px] font-semibold cursor-pointer" onClick={() => setAdding(!adding)}>+ Add a person</button>
      </div>
      <ErrorNote message={error} />
      {adding && (
        <div className={`${card} px-4.5 py-4 grid grid-cols-2 gap-3`}>
          <Field label="Name" htmlFor="np-n"><input id="np-n" className={inputClass} value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="Position" htmlFor="np-p" optional><input id="np-p" className={inputClass} value={position} onChange={e => setPosition(e.target.value)} /></Field>
          <div className="col-span-2"><button type="button" disabled={!name.trim()} className="min-h-10 px-4 rounded-lg border-0 bg-ink text-white text-[13px] font-semibold cursor-pointer disabled:opacity-60" onClick={async () => {
            const res = await createPerson({ name: name.trim(), position: position.trim() });
            if (res.error || !res.data) return setError(res.error ?? 'Could not add.');
            go({ name: 'person', id: res.data.id });
          }}>Add and open file</button></div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input aria-label="Search people" placeholder="Search by name or position" className={`${inputClass} max-w-xs`} value={q} onChange={e => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="w-5 h-5" checked={only} onChange={e => setOnly(e.target.checked)} /> Only people with a claim</label>
      </div>
      {rows.length === 0 ? <p className={`${card} m-0 px-5 py-6 text-sm text-muted`}>{only ? 'No claims yet. Start one from the People tab of an incident.' : 'Nobody found.'}</p> : (
        <ul className={`${card} list-none m-0 p-0 divide-y divide-line-soft`}>
          {rows.map(({ p, mine }) => (
            <li key={p.id} className="px-4.5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <a href={hrefFor({ name: 'person', id: p.id })} className="min-w-44 font-semibold">{p.name}<span className="block text-[13px] font-normal text-muted">{p.position || 'No position'}</span></a>
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                {mine.map(c => {
                  const st = claimStatus(c.status);
                  const off = isOffWork(c) ? daysOffWork(c) : null;
                  return (
                    <span key={c.id} className="flex flex-wrap items-center gap-1.5">
                      <Pill tone={st.tone}>{c.state} {STATES[c.state].scheme.replace('WorkCover ', '').replace('WorkSafe ', '').replace(/^icare.*/, 'icare')}: {st.label}</Pill>
                      {off !== null && <span className="text-xs text-muted">{off}d off</span>}
                      {(att[c.id] ?? []).slice(0, 2).map(a => <span key={a.id} className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${toneBg[a.tone]}`}>{a.what.length > 60 ? `${a.what.slice(0, 57)}…` : a.what}</span>)}
                    </span>
                  );
                })}
                {mine.length === 0 && <span className="text-sm text-muted">No claim</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
