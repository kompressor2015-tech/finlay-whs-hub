import { useCallback, useEffect, useState } from 'react';
import { createClaim } from '../services/claims.ts';
import { addIncidentPerson, createPerson, listPeople, removeIncidentPerson, updateIncidentPerson } from '../services/incidentFile.ts';
import { hrefFor } from '../hooks/useRoute.ts';
import { brisbaneDay, formatDay } from '../utils/dates.ts';
import { claimAttention, claimStatus, certificateStatus, daysOffWork, isOpen, STATE_LIST, STATES, type Appointment, type Certificate, type Claim, type State } from '../utils/claims.ts';
import { PERSON_ROLES, TREATMENTS, roleLabel, type IncidentPerson, type Person, type PersonRole, type Treatment } from '../utils/incidentFile.ts';
import type { Incident } from '../utils/records.ts';
import type { WhsUser } from '../services/auth.ts';
import { ClaimFile } from './ClaimFile.tsx';
import { ErrorNote, Field, inputClass } from './Form.tsx';
import { Pill } from './Pill.tsx';

/** So the person's file can offer a way straight back to this incident. */
export function rememberBack(incidentId: string, ref: string): void {
  try { sessionStorage.setItem('whsBack', JSON.stringify({ href: hrefFor({ name: 'incident', id: incidentId }), label: ref })); } catch { /* optional */ }
}

const card = 'bg-white border border-line rounded-xl';
const btn = 'min-h-10 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-[13px] font-semibold cursor-pointer disabled:opacity-60';
const btnPri = 'min-h-10 px-4 rounded-lg border-0 bg-ink text-white text-[13px] font-semibold cursor-pointer disabled:opacity-60';
const linkBtn = 'bg-transparent border-0 p-0 text-[13px] font-semibold text-ink underline cursor-pointer min-h-8';

const toneBg: Record<string, string> = { red: 'bg-[#FDE8E8] text-[#9B1218]', amber: 'bg-[#FFF1D6] text-[#7A4B00]', green: 'bg-[#E3F4E6] text-[#1F6B2E]', blue: 'bg-[#E4EEFC] text-[#1C4A8F]', grey: 'bg-[#ECECEC] text-[#4A4A50]' };

/** Who was on this incident, their injury details, and (for the WHS officer and admins) each person's claim. */
export function IncidentPeopleTab({ incident, user, people, claims, certs, appointments, canEdit, officer, reload }: {
  incident: Incident; user: WhsUser; people: IncidentPerson[]; claims: Claim[]; certs: Certificate[]; appointments: Appointment[]; canEdit: boolean; officer: boolean; reload: () => Promise<void> | void;
}) {
  const [staff, setStaff] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [openClaim, setOpenClaim] = useState<string | null>(() => {
    try { return sessionStorage.getItem(`whsOpenClaim-${incident.id}`); } catch { return null; }
  });
  const toggleClaim = (id: string) => {
    const next = openClaim === id ? null : id;
    setOpenClaim(next);
    try { if (next) sessionStorage.setItem(`whsOpenClaim-${incident.id}`, next); else sessionStorage.removeItem(`whsOpenClaim-${incident.id}`); } catch { /* optional */ }
  };

  const loadStaff = useCallback(async () => {
    const res = await listPeople();
    setStaff(res.data ?? []);
  }, []);
  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  async function run(fn: () => Promise<{ error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res.error) setError(res.error);
    else await reload();
    return !res.error;
  }

  return (
    <div className="flex flex-col gap-4">
      <ErrorNote message={error} />
      {people.length === 0 && !adding && <p className={`${card} m-0 px-5 py-6 text-sm text-muted`}>Nobody is recorded on this incident yet. Add the injured person, witnesses, the first aider and anyone else involved.</p>}

      {people.map(p => {
        const claim = claims.find(c => c.person_id === p.person_id);
        const myCerts = claim ? certs.filter(c => c.claim_id === claim.id) : [];
        const att = claim ? claimAttention(claim, myCerts, incident.occurred_at, new Date(), appointments.filter(x => x.claim_id === claim.id)) : [];
        const st = claim ? claimStatus(claim.status) : null;
        const off = claim ? daysOffWork(claim) : null;
        const cs = claim ? certificateStatus(myCerts) : null;
        return (
          <section key={p.id} className={`${card} overflow-hidden`}>
            <div className="flex flex-wrap items-center gap-3 px-4.5 py-3.5">
              <span className="w-10 h-10 rounded-full bg-[#E9E4DD] flex items-center justify-center text-sm font-bold shrink-0">{p.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{p.person_id && officer ? <a href={hrefFor({ name: 'person', id: p.person_id })} onClick={() => rememberBack(incident.id, incident.ref)}>{p.name}</a> : p.name} <Pill tone={p.role === 'injured' ? 'red' : 'grey'}>{roleLabel(p.role)}</Pill></div>
                <div className="text-[13px] text-muted">{p.employer || 'Finlay'}{p.phone ? ` · ${p.phone}` : ''}</div>
              </div>
              {canEdit && <button type="button" className={linkBtn} onClick={() => setEditing(editing === p.id ? null : p.id)}>{editing === p.id ? 'Close' : 'Edit'}</button>}
              {officer && <button type="button" className={linkBtn} onClick={() => window.confirm(`Remove ${p.name} from this incident?`) && run(() => removeIncidentPerson(p.id))}>Remove</button>}
            </div>

            {p.role === 'injured' && editing !== p.id && (
              <dl className="m-0 px-4.5 pb-3.5 grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-2.5 text-sm">
                <div><dt className="text-xs text-muted">Injury</dt><dd className="m-0 font-medium">{[p.body_part, p.injury_nature].filter(Boolean).join(', ') || '—'}</dd></div>
                <div><dt className="text-xs text-muted">Mechanism</dt><dd className="m-0 font-medium">{p.mechanism || '—'}</dd></div>
                <div><dt className="text-xs text-muted">Treatment</dt><dd className="m-0 font-medium">{TREATMENTS.find(t => t.id === p.treatment)?.label}</dd></div>
                <div><dt className="text-xs text-muted">Off work from</dt><dd className="m-0 font-medium">{p.off_work_from ? formatDay(p.off_work_from) : 'Not off work'}</dd></div>
              </dl>
            )}
            {p.notes && editing !== p.id && <p className="m-0 px-4.5 pb-3.5 text-sm text-[#3A3A3F]">{p.notes}</p>}
            {editing === p.id && <PersonEditor p={p} busy={busy} onSave={patch => run(() => updateIncidentPerson(p.id, patch)).then(ok => { if (ok) setEditing(null); })} />}

            {officer && p.role === 'injured' && (
              <div className="border-t border-line-soft bg-[#FAFAF9] px-4.5 py-3 text-sm">
                {claim && st ? (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Pill tone={st.tone}>{STATES[claim.state].scheme} claim: {st.label}</Pill>
                    {isOpen(claim) && off !== null && <span className="text-muted">{off} {off === 1 ? 'day' : 'days'} off work</span>}
                    {cs?.current && isOpen(claim) && <span className="text-muted">Certificate to {formatDay(cs.current.to_date)}</span>}
                    {att.map(a => <span key={a.id} className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${toneBg[a.tone]}`}>{a.what}</span>)}
                    <span className="ml-auto flex items-center gap-4">
                      <button type="button" aria-expanded={openClaim === claim.id} className="bg-transparent border-0 p-0 text-[13px] font-semibold text-ink underline cursor-pointer min-h-8" onClick={() => toggleClaim(claim.id)}>{openClaim === claim.id ? 'Close the claim file' : 'Open the claim file'}</button>
                      <a href={hrefFor({ name: 'person', id: claim.person_id })} onClick={() => rememberBack(incident.id, incident.ref)} className="text-[13px] font-semibold">Full page</a>
                    </span>
                  </div>
                ) : p.person_id ? (
                  <StartClaim incident={incident} person={p} busy={busy} onStart={(state, off) => run(() => createClaim({ incident_id: incident.id, person_id: p.person_id!, state, injury_date: brisbaneDay(incident.occurred_at), off_work_from: off || null }))} />
                ) : <span className="text-muted">Link this person to a worker record to start a claim.</span>}
              </div>
            )}
            {officer && claim && openClaim === claim.id && (
              <div className="border-t border-line-soft bg-[#FAFAF9] px-4.5 py-4">
                <ClaimFile key={claim.id} claim={claim} incidentRef={incident.ref} incidentAt={incident.occurred_at} user={user} onChanged={() => void reload()} />
              </div>
            )}
          </section>
        );
      })}

      {canEdit && !adding && <button type="button" className={`${btn} self-start`} onClick={() => setAdding(true)}>+ Add a person</button>}
      {canEdit && adding && (
        <AddPerson incident={incident} staff={staff} busy={busy} onCancel={() => setAdding(false)}
          onAdd={async input => {
            let personId = input.person_id;
            if (!personId) {
              const made = await createPerson({ name: input.name, position: input.position });
              if (made.error || !made.data) { setError(made.error ?? 'Could not add the person.'); return; }
              personId = made.data.id;
              void loadStaff();
            }
            const ok = await run(() => addIncidentPerson({ incident_id: incident.id, person_id: personId, name: input.name, role: input.role, employer: 'Finlay', ...input.injury }));
            if (ok) setAdding(false);
          }} />
      )}
    </div>
  );
}

function PersonEditor({ p, busy, onSave }: { p: IncidentPerson; busy: boolean; onSave: (patch: Partial<IncidentPerson>) => void }) {
  const [role, setRole] = useState<PersonRole>(p.role);
  const [body, setBody] = useState(p.body_part);
  const [nature, setNature] = useState(p.injury_nature);
  const [mech, setMech] = useState(p.mechanism);
  const [treat, setTreat] = useState<Treatment>(p.treatment);
  const [off, setOff] = useState(p.off_work_from ?? '');
  const [notes, setNotes] = useState(p.notes);
  return (
    <div className="px-4.5 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Field label="Role" htmlFor={`r-${p.id}`}><select id={`r-${p.id}`} className={inputClass} value={role} onChange={e => setRole(e.target.value as PersonRole)}>{PERSON_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></Field>
      {role === 'injured' && (
        <>
          <Field label="Body part" htmlFor={`b-${p.id}`}><input id={`b-${p.id}`} className={inputClass} value={body} onChange={e => setBody(e.target.value)} placeholder="e.g. Left knee" /></Field>
          <Field label="Kind of injury" htmlFor={`n-${p.id}`}><input id={`n-${p.id}`} className={inputClass} value={nature} onChange={e => setNature(e.target.value)} placeholder="e.g. Strain and bruising" /></Field>
          <Field label="How it happened" htmlFor={`m-${p.id}`}><input id={`m-${p.id}`} className={inputClass} value={mech} onChange={e => setMech(e.target.value)} placeholder="e.g. Slip on wet surface" /></Field>
          <Field label="Treatment" htmlFor={`t-${p.id}`}><select id={`t-${p.id}`} className={inputClass} value={treat} onChange={e => setTreat(e.target.value as Treatment)}>{TREATMENTS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field>
          <Field label="Off work from" htmlFor={`o-${p.id}`} optional><input id={`o-${p.id}`} type="date" className={inputClass} value={off} onChange={e => setOff(e.target.value)} /></Field>
        </>
      )}
      <div className="col-span-2 sm:col-span-4"><Field label="Notes" htmlFor={`x-${p.id}`} optional><input id={`x-${p.id}`} className={inputClass} value={notes} onChange={e => setNotes(e.target.value)} /></Field></div>
      <div className="col-span-2 sm:col-span-4"><button type="button" disabled={busy} className={btnPri} onClick={() => onSave({ role, body_part: role === 'injured' ? body.trim() : '', injury_nature: role === 'injured' ? nature.trim() : '', mechanism: role === 'injured' ? mech.trim() : '', treatment: role === 'injured' ? treat : '', off_work_from: role === 'injured' ? off || null : null, notes: notes.trim() })}>Save</button></div>
    </div>
  );
}

function StartClaim({ incident, person, busy, onStart }: { incident: Incident; person: IncidentPerson; busy: boolean; onStart: (state: State, offWork: string) => void }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>('QLD');
  const [off, setOff] = useState(person.off_work_from ?? '');
  if (!open) return (
    <span className="flex flex-wrap items-center gap-3">
      <span className="text-muted">No claim on file for this person.</span>
      <button type="button" className={btn} onClick={() => setOpen(true)}>Start a claim file</button>
    </span>
  );
  return (
    <span className="flex flex-wrap items-end gap-3">
      <Field label="State scheme" htmlFor={`st-${person.id}`}>
        <select id={`st-${person.id}`} className={inputClass} value={state} onChange={e => setState(e.target.value as State)}>{STATE_LIST.map(s => <option key={s} value={s}>{s}: {STATES[s].scheme}</option>)}</select>
      </Field>
      <Field label="First day off work" htmlFor={`off-${person.id}`} optional><input id={`off-${person.id}`} type="date" className={inputClass} value={off} onChange={e => setOff(e.target.value)} /></Field>
      <button type="button" disabled={busy} className={btnPri} onClick={() => onStart(state, off)}>Start claim file</button>
      <button type="button" className={btn} onClick={() => setOpen(false)}>Cancel</button>
      <span className="basis-full text-xs text-muted">Injury date is taken from the incident ({formatDay(brisbaneDay(incident.occurred_at))}).</span>
    </span>
  );
}

function AddPerson({ staff, busy, onAdd, onCancel }: {
  incident: Incident; staff: Person[]; busy: boolean; onCancel: () => void;
  onAdd: (input: { person_id: string | null; name: string; position: string; role: PersonRole; injury: Partial<IncidentPerson> }) => void;
}) {
  const [pick, setPick] = useState('');
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [role, setRole] = useState<PersonRole>('injured');
  const [body, setBody] = useState('');
  const [nature, setNature] = useState('');
  const [mech, setMech] = useState('');
  const [treat, setTreat] = useState<Treatment>('');
  const [off, setOff] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const chosen = staff.find(s => s.id === pick);
  return (
    <section className={`${card} px-4.5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3`}>
      <div className="col-span-2 sm:col-span-4 text-sm font-semibold">Add a person to this incident</div>
      <div className="col-span-2">
        <Field label="Worker" htmlFor="ap-pick" hint="Pick a worker already on file, or type a new one below.">
          <select id="ap-pick" className={inputClass} value={pick} onChange={e => setPick(e.target.value)}>
            <option value="">A new person</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}{s.position ? `, ${s.position}` : ''}</option>)}
          </select>
        </Field>
      </div>
      {!chosen && <Field label="Name" htmlFor="ap-name"><input id="ap-name" className={inputClass} value={name} onChange={e => setName(e.target.value)} /></Field>}
      {!chosen && <Field label="Position" htmlFor="ap-pos" optional><input id="ap-pos" className={inputClass} value={position} onChange={e => setPosition(e.target.value)} placeholder="e.g. Fitter" /></Field>}
      <Field label="Role on this incident" htmlFor="ap-role"><select id="ap-role" className={inputClass} value={role} onChange={e => setRole(e.target.value as PersonRole)}>{PERSON_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></Field>
      {role === 'injured' && (
        <>
          <Field label="Body part" htmlFor="ap-body"><input id="ap-body" className={inputClass} value={body} onChange={e => setBody(e.target.value)} placeholder="e.g. Left knee" /></Field>
          <Field label="Kind of injury" htmlFor="ap-nat"><input id="ap-nat" className={inputClass} value={nature} onChange={e => setNature(e.target.value)} placeholder="e.g. Strain" /></Field>
          <Field label="How it happened" htmlFor="ap-mech"><input id="ap-mech" className={inputClass} value={mech} onChange={e => setMech(e.target.value)} placeholder="e.g. Slip" /></Field>
          <Field label="Treatment" htmlFor="ap-treat"><select id="ap-treat" className={inputClass} value={treat} onChange={e => setTreat(e.target.value as Treatment)}>{TREATMENTS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field>
          <Field label="Off work from" htmlFor="ap-off" optional><input id="ap-off" type="date" className={inputClass} value={off} onChange={e => setOff(e.target.value)} /></Field>
        </>
      )}
      <div className="col-span-2 sm:col-span-4"><ErrorNote message={err} /></div>
      <div className="col-span-2 sm:col-span-4 flex gap-2">
        <button type="button" disabled={busy} className={btnPri} onClick={() => {
          const finalName = chosen ? chosen.name : name.trim();
          if (!finalName) return setErr('Enter the person\'s name.');
          setErr(null);
          onAdd({ person_id: chosen?.id ?? null, name: finalName, position: chosen ? chosen.position : position.trim(), role, injury: role === 'injured' ? { body_part: body.trim(), injury_nature: nature.trim(), mechanism: mech.trim(), treatment: treat, off_work_from: off || null } : {} });
        }}>Add</button>
        <button type="button" className={btn} onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
