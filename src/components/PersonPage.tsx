import { useCallback, useEffect, useState } from 'react';
import type { WhsUser } from '../services/auth.ts';
import { listAccess, listClaims, logAccess, type AccessEntry } from '../services/claims.ts';
import { getPerson, listPersonIncidents, updatePerson } from '../services/incidentFile.ts';
import { getIncident } from '../services/records.ts';
import { hrefFor } from '../hooks/useRoute.ts';
import { formatDay, formatWhen } from '../utils/dates.ts';
import { claimStatus, isOpen, STATES, type Claim } from '../utils/claims.ts';
import { roleLabel, type IncidentPerson, type Person } from '../utils/incidentFile.ts';
import { incidentStatus, incidentTypeLabel, type Incident } from '../utils/records.ts';
import { today } from '../utils/documents.ts';
import { askConfirm } from './ConfirmHost.tsx';
import { TicketsTab } from './TicketsTab.tsx';
import { ClaimFile } from './ClaimFile.tsx';
import { ErrorNote, Field, inputClass } from './Form.tsx';
import { Pill } from './Pill.tsx';

const card = 'bg-white border border-line rounded-xl';
const btn = 'min-h-10 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-[13px] font-semibold cursor-pointer disabled:opacity-60';
const btnPri = 'min-h-10 px-4 rounded-lg border-0 bg-ink text-white text-[13px] font-semibold cursor-pointer disabled:opacity-60';

/** One worker: every incident they were on and every claim, in one place. WHS officer and admin only. */
export function PersonPage({ id, user }: { id: string; user: WhsUser }) {
  const [person, setPerson] = useState<Person | null>(null);
  const [rows, setRows] = useState<{ ip: IncidentPerson; incident: Incident | null }[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [access, setAccess] = useState<AccessEntry[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTabState] = useState<'file' | 'tickets'>(() => {
    try { return sessionStorage.getItem(`whsPersonTab-${id}`) === 'tickets' ? 'tickets' : 'file'; } catch { return 'file'; }
  });
  const setTab = (t: 'file' | 'tickets') => {
    setTabState(t);
    try { sessionStorage.setItem(`whsPersonTab-${id}`, t); } catch { /* optional */ }
  };
  const [error, setError] = useState<string | null>(null);
  const [back] = useState<{ href: string; label: string } | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('whsBack') ?? 'null'); } catch { return null; }
  });

  const load = useCallback(async () => {
    const [p, ip, cl, ac] = await Promise.all([getPerson(id), listPersonIncidents(id), listClaims({ personId: id }), listAccess(id)]);
    if (p.error || !p.data) return setError(p.error ?? 'Person not found');
    setPerson(p.data);
    const list = ip.data ?? [];
    const incs = await Promise.all(list.map(r => getIncident(r.incident_id)));
    setRows(list.map((r, i) => ({ ip: r, incident: incs[i].data ?? null })));
    setClaims(cl.data ?? []);
    setAccess(ac.data ?? []);
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void logAccess(id, null, 'Opened the person file'); }, [id]);

  if (!person) return error ? <ErrorNote message={error} /> : <p className="text-sm text-muted">Loading…</p>;

  async function archive() {
    setBusy(true);
    setError(null);
    const res = await updatePerson(id, { active: false, left_on: archiving || null });
    setBusy(false);
    if (res.error) return setError(res.error);
    setArchiving(null);
    await load();
  }
  async function bringBack() {
    if (!(await askConfirm({ title: `Bring ${person?.name ?? 'this person'} back?`, body: 'They will show in the lists again. Site roles are not restored: set first aider or fire warden again if it still applies.', confirmLabel: 'Bring back' }))) return;
    setBusy(true);
    const res = await updatePerson(id, { active: true });
    setBusy(false);
    if (res.error) return setError(res.error);
    await load();
  }

  const shown = claims.find(c => c.id === picked) ?? claims.find(isOpen) ?? claims[0] ?? null;
  const incOf = (c: Claim) => rows.find(r => r.ip.incident_id === c.incident_id)?.incident ?? null;
  const shownInc = shown ? incOf(shown) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {back && <a href={back.href} onClick={() => { try { sessionStorage.removeItem('whsBack'); } catch { /* optional */ } }} className="no-underline font-semibold text-finlay">← Back to {back.label}</a>}
        <a href={hrefFor({ name: 'module', id: 'people' })} onClick={() => { try { sessionStorage.removeItem('whsBack'); } catch { /* optional */ } }} className="no-underline text-muted">{back ? 'All people & claims' : '← People & claims'}</a>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-2xl font-bold">{person.name}</h1>
          <p className="mt-1 mb-0 text-muted text-[15px]">{[person.position, person.phone, person.start_date ? `started ${formatDay(person.start_date)}` : ''].filter(Boolean).join(' · ') || 'No details yet'}</p>
          {person.emergency_contact && <p className="mt-1 mb-0 text-sm text-muted">Emergency contact: {person.emergency_contact}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!person.active && <Pill tone="grey">Archived</Pill>}
          {person.is_first_aider && <Pill tone="blue">First aider</Pill>}
          {person.is_fire_warden && <Pill tone="blue">{person.warden_role === 'chief' ? 'Chief fire warden' : 'Fire warden'}</Pill>}
          <button type="button" className={btn} onClick={() => setEditing(!editing)}>{editing ? 'Close' : 'Edit details'}</button>
          {person.active && <button type="button" className={`${btn} text-[#9B1218] border-[#E3B7B7]`} onClick={() => setArchiving(archiving === null ? today() : null)}>Archive person</button>}
        </div>
      </div>
      {!person.active && (
        <section className={`${card} px-4.5 py-3.5 flex flex-wrap items-center gap-3 bg-[#ECECEC]`}>
          <span className="text-sm"><b>Archived</b>{person.left_on ? ` · left ${formatDay(person.left_on)}` : ''}{person.archived_at ? ` · archived ${formatDay(person.archived_at.slice(0, 10))}` : ''}{person.archived_by_name ? ` by ${person.archived_by_name}` : ''}. They are left out of the lists for choosing people, first aider counts and ticket reminders. Everything on this file is kept.</span>
          <button type="button" className={`${btn} ml-auto`} disabled={busy} onClick={() => void bringBack()}>Bring back</button>
        </section>
      )}
      {archiving !== null && person.active && (
        <section className={`${card} px-4.5 py-4 flex flex-col gap-3 max-w-xl`}>
          <h2 className="m-0 text-[15px] font-semibold">Archive {person.name}?</h2>
          <p className="m-0 text-sm text-muted">They will no longer count as a first aider or fire warden, and their ticket reminders stop. Nothing is deleted, and you can bring them back.{claims.some(isOpen) ? ' They have an open claim: it stays open and in the claims list until it is closed.' : ''}</p>
          <Field label="Last day (optional)" htmlFor="ar-left" optional><input id="ar-left" type="date" className={`${inputClass} max-w-48`} value={archiving} max={today()} onChange={e => setArchiving(e.target.value)} /></Field>
          <div className="flex gap-2"><button type="button" className={btnPri} disabled={busy} onClick={() => void archive()}>Archive</button><button type="button" className={btn} onClick={() => setArchiving(null)}>Cancel</button></div>
        </section>
      )}
      <div role="tablist" aria-label="Person file" className="flex flex-wrap gap-2">
        {([['file', 'Incidents & claim'], ['tickets', 'Tickets & training']] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`min-h-10 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer border ${tab === k ? 'bg-ink text-white border-ink' : 'bg-white text-muted border-[#D6D2CC]'}`}>{label}</button>
        ))}
      </div>
      {editing && <PersonEdit person={person} onSaved={async () => { setEditing(false); await load(); }} />}
      <ErrorNote message={error} />

      {tab === 'tickets' && <TicketsTab person={person} onChanged={() => void load()} />}

      {tab === 'file' && <>
      <section className={`${card} px-4.5 py-4`}>
        <h2 className="mt-0 mb-2.5 text-[15px] font-semibold">Incidents</h2>
        {rows.length === 0 ? <p className="m-0 text-sm text-muted">Not on any incident.</p> : (
          <ul className="list-none m-0 p-0 flex flex-col divide-y divide-line-soft">
            {rows.map(({ ip, incident }) => {
              const claim = claims.find(c => c.incident_id === ip.incident_id);
              const st = incident ? incidentStatus(incident.status) : null;
              return (
                <li key={ip.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <a href={hrefFor({ name: 'incident', id: ip.incident_id })} className="font-semibold">{incident?.ref ?? 'Incident'}</a>
                  <span className="text-muted">{incident ? `${incidentTypeLabel(incident.type)} · ${formatDay(incident.occurred_at.slice(0, 10))}` : ''}</span>
                  <Pill tone={ip.role === 'injured' ? 'red' : 'grey'}>{roleLabel(ip.role)}</Pill>
                  {st && <Pill tone={st.tone}>{st.label}</Pill>}
                  {claim && <button type="button" className="ml-auto bg-transparent border-0 p-0 font-semibold underline cursor-pointer text-[13px]" onClick={() => setPicked(claim.id)}>{STATES[claim.state].scheme}: {claimStatus(claim.status).label}</button>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {claims.length > 1 && (
        <div role="tablist" aria-label="Claims" className="flex flex-wrap gap-2">
          {claims.map(c => (
            <button key={c.id} role="tab" aria-selected={shown?.id === c.id} type="button" onClick={() => setPicked(c.id)}
              className={`min-h-10 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer border ${shown?.id === c.id ? 'bg-ink text-white border-ink' : 'bg-white text-muted border-[#D6D2CC]'}`}>
              {incOf(c)?.ref ?? 'Claim'} · {c.state}
            </button>
          ))}
        </div>
      )}

      {shown ? (
        <ClaimFile key={shown.id} claim={shown} incidentRef={shownInc?.ref ?? 'incident'} incidentAt={shownInc?.occurred_at ?? shown.created_at} user={user} onChanged={() => void load()} />
      ) : (
        <p className={`${card} m-0 px-5 py-6 text-sm text-muted`}>No claim on file. Start one from the People tab of an incident this person was injured in.</p>
      )}

      <section className={`${card} px-4.5 py-4`}>
        <details>
          <summary className="cursor-pointer text-[15px] font-semibold">Who has opened this file</summary>
          <p className="mt-2 mb-2 text-xs text-muted">Every time this file or one of its documents is opened, it is recorded here and can't be changed.</p>
          <ul className="list-none m-0 p-0 flex flex-col gap-1 text-[13px]">
            {access.map(a => <li key={a.id}><span className="text-muted">{formatWhen(a.at)}</span> · {a.actor_name} · {a.what}</li>)}
          </ul>
        </details>
      </section>
      </>}
    </div>
  );
}

function PersonEdit({ person, onSaved }: { person: Person; onSaved: () => void }) {
  const [v, setV] = useState({ name: person.name, position: person.position, phone: person.phone, emergency_contact: person.emergency_contact, start_date: person.start_date ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const f = (k: keyof typeof v, label: string, type = 'text') => <Field label={label} htmlFor={`pe-${k}`} optional={k !== 'name'}><input id={`pe-${k}`} type={type} className={inputClass} value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })} /></Field>;
  return (
    <section className={`${card} px-4.5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-3`}>
      {f('name', 'Name')}{f('position', 'Position')}{f('phone', 'Phone')}{f('emergency_contact', 'Emergency contact')}{f('start_date', 'Start date', 'date')}
      <div className="col-span-2 sm:col-span-3"><ErrorNote message={err} /><button type="button" disabled={busy || !v.name.trim()} className={btnPri} onClick={async () => {
        setBusy(true);
        const res = await updatePerson(person.id, { name: v.name.trim(), position: v.position.trim(), phone: v.phone.trim(), emergency_contact: v.emergency_contact.trim(), start_date: v.start_date || null });
        setBusy(false);
        if (res.error) setErr(res.error); else onSaved();
      }}>Save</button></div>
    </section>
  );
}
