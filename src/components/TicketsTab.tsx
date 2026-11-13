import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { addTicket, attachCertificate, listTickets, removeTicket } from '../services/tickets.ts';
import { openFile } from '../services/files.ts';
import { updatePerson } from '../services/incidentFile.ts';
import { today } from '../utils/documents.ts';
import { formatDay } from '../utils/dates.ts';
import type { Person } from '../utils/incidentFile.ts';
import { TICKET_PRESETS, FIRST_AID_TICKET, FIRE_WARDEN_TICKET, currentTickets, expiryFromIssue, presetFor, ticketPill, type Ticket } from '../utils/tickets.ts';
import { askConfirm } from './ConfirmHost.tsx';
import { ErrorNote, Field, inputClass } from './Form.tsx';
import { Pill } from './Pill.tsx';

const card = 'bg-white border border-line rounded-xl';
const btn = 'min-h-10 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-[13px] font-semibold cursor-pointer disabled:opacity-60';
const btnPri = 'min-h-10 px-4 rounded-lg border-0 bg-ink text-white text-[13px] font-semibold cursor-pointer disabled:opacity-60';
const link = 'bg-transparent border-0 p-0 font-semibold underline cursor-pointer text-[13px]';
const OTHER = '__other__';

/** One person's tickets and training, and their site roles (first aider, fire warden). */
export function TicketsTab({ person, onChanged }: { person: Person; onChanged: () => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [showOld, setShowOld] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archived = !person.active;

  const load = useCallback(async () => {
    const res = await listTickets(person.id);
    if (res.error) setError(res.error);
    setTickets(res.data ?? []);
  }, [person.id]);
  useEffect(() => { void load(); }, [load]);

  const current = currentTickets(tickets);
  const currentIds = new Set(current.map(t => t.id));
  const earlier = tickets.filter(t => !currentIds.has(t.id)).sort((a, b) => (b.issued_on ?? '').localeCompare(a.issued_on ?? ''));
  const has = (name: string) => current.some(t => t.name.toLowerCase() === name.toLowerCase());

  async function setRole(patch: Parameters<typeof updatePerson>[1]) {
    setBusy(true);
    setError(null);
    const res = await updatePerson(person.id, patch);
    setBusy(false);
    if (res.error) return setError(res.error);
    onChanged();
  }

  async function remove(t: Ticket) {
    if (!(await askConfirm({ title: `Remove ${t.name}?`, body: 'Use this only for one entered by mistake. A renewal should be added as a new ticket so the history stays.', confirmLabel: 'Remove', danger: true }))) return;
    setBusy(true);
    const res = await removeTicket(t);
    setBusy(false);
    if (res.error) return setError(res.error);
    await load();
    onChanged();
  }

  async function certificate(t: Ticket, file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const res = await attachCertificate(t, file);
    setBusy(false);
    if (res.error) return setError(res.error);
    await load();
  }

  const row = (t: Ticket, old = false) => {
    const pill = ticketPill(t);
    return (
      <tr key={t.id} className="border-b border-line-soft last:border-b-0 align-top">
        <td className="px-3.5 py-2.5"><b className={old ? 'font-semibold text-muted' : ''}>{t.name}</b>{t.notes && <span className="block text-xs text-muted">{t.notes}</span>}</td>
        <td className="px-3.5 py-2.5 text-muted">{t.number || '—'}</td>
        <td className="px-3.5 py-2.5 whitespace-nowrap">{t.issued_on ? formatDay(t.issued_on) : '—'}</td>
        <td className="px-3.5 py-2.5 whitespace-nowrap">{t.expires_on ? formatDay(t.expires_on) : <span className="text-muted">No expiry</span>}</td>
        <td className="px-3.5 py-2.5 text-muted">{t.provider || '—'}</td>
        <td className="px-3.5 py-2.5">{old ? <Pill tone="grey">Replaced</Pill> : <Pill tone={pill.tone}>{pill.label}</Pill>}</td>
        <td className="px-3.5 py-2.5 whitespace-nowrap">
          {t.file_path ? <button type="button" className={link} onClick={() => void openFile('whs-training-files', t.file_path)}>View</button> : (
            <label className={`${link} inline-block`}>Upload<input type="file" className="sr-only" onChange={e => void certificate(t, e.target.files?.[0] ?? null)} /></label>
          )}
          {!archived && <button type="button" className={`${link} ml-3 text-muted`} onClick={() => void remove(t)}>Remove</button>}
        </td>
      </tr>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <ErrorNote message={error} />
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-[2_1_620px] min-w-0 flex flex-col gap-3">
          <div className={`${card} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm min-w-[760px]">
                <thead><tr className="text-left text-xs text-muted bg-[#FAF8F6]">
                  {['Ticket or training', 'Number', 'Issued', 'Expires', 'Trained by', 'Status', 'Certificate'].map(h => <th key={h} scope="col" className="px-3.5 py-2.5 font-semibold border-b border-line">{h}</th>)}
                </tr></thead>
                <tbody>{current.map(t => row(t))}{showOld && earlier.map(t => row(t, true))}</tbody>
              </table>
            </div>
            {current.length === 0 && <p className="m-0 px-4 py-6 text-sm text-muted">No tickets on file yet. Add the first one.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!archived && <button type="button" className={btnPri} onClick={() => setAdding(adding ? null : FIRST_AID_TICKET)}>{adding ? 'Close' : '+ Add a ticket'}</button>}
            {earlier.length > 0 && <button type="button" className={link} onClick={() => setShowOld(!showOld)}>{showOld ? 'Hide earlier tickets' : `Show ${earlier.length} earlier ticket${earlier.length === 1 ? '' : 's'}`}</button>}
          </div>
          {adding && !archived && <AddTicket personId={person.id} start={adding} onDone={async () => { setAdding(null); await load(); onChanged(); }} />}
          <p className="m-0 text-[13px] text-muted">Add a renewal as a new ticket. The newest one counts, and the older one stays in the history. Anything running out within 60 days, or already out, shows on the Training page and the home screen.</p>
        </div>

        <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-3">
          <section className={`${card} overflow-hidden`}>
            <h2 className="m-0 px-4 py-3 text-[15px] font-semibold bg-[#FAF8F6] border-b border-line">Site roles</h2>
            <label className="flex items-center gap-3 px-4 py-3 border-b border-line-soft cursor-pointer">
              <input type="checkbox" className="w-5 h-5" checked={person.is_first_aider} disabled={busy || archived} onChange={e => void setRole({ is_first_aider: e.target.checked })} />
              <span className="flex-1"><b className="text-sm">First aider</b><span className="block text-xs text-muted">Counts toward their site&apos;s first aid cover</span></span>
            </label>
            {person.is_first_aider && !has(FIRST_AID_TICKET) && <p className="m-0 px-4 py-2 text-xs bg-[#FFF1D6] text-[#7A4B00]">No current {FIRST_AID_TICKET} ticket on file, so they will not count until one is added.</p>}
            <label className="flex items-center gap-3 px-4 py-3 border-b border-line-soft cursor-pointer">
              <input type="checkbox" className="w-5 h-5" checked={person.is_fire_warden} disabled={busy || archived} onChange={e => void setRole({ is_fire_warden: e.target.checked, warden_role: e.target.checked ? 'warden' : '' })} />
              <span className="flex-1"><b className="text-sm">Fire warden</b><span className="block text-xs text-muted">Listed as a warden for their site</span></span>
            </label>
            {person.is_fire_warden && (
              <div className="px-4 py-3 flex flex-col gap-2">
                <Field label="Role" htmlFor="pw-role"><select id="pw-role" className={inputClass} value={person.warden_role} disabled={busy || archived} onChange={e => void setRole({ warden_role: e.target.value as 'chief' | 'warden' })}><option value="warden">Warden</option><option value="chief">Chief warden</option></select></Field>
                {!has(FIRE_WARDEN_TICKET) && <p className="m-0 text-xs text-[#7A4B00]">No current {FIRE_WARDEN_TICKET} training on file.</p>}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function AddTicket({ personId, start, onDone }: { personId: string; start: string; onDone: () => void }) {
  const [pick, setPick] = useState(presetFor(start) ? start : OTHER);
  const [custom, setCustom] = useState('');
  const [number, setNumber] = useState('');
  const [issued, setIssued] = useState(today());
  const [expires, setExpires] = useState('');
  const [touched, setTouched] = useState(false);
  const [provider, setProvider] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = pick === OTHER ? custom.trim() : pick;
  const suggested = name && issued ? expiryFromIssue(name, issued) : null;
  const expiry = touched ? expires : suggested ?? '';
  const preset = presetFor(name);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name) return setError('Pick a ticket or type its name.');
    setBusy(true);
    setError(null);
    const res = await addTicket(personId, { name, number: number.trim(), issued_on: issued || null, expires_on: expiry || null, provider: provider.trim(), notes: notes.trim() }, file);
    setBusy(false);
    if (res.error) return setError(res.error);
    onDone();
  }

  return (
    <form onSubmit={save} className={`${card} px-4.5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-3`}>
      <Field label="Ticket or training" htmlFor="tk-name">
        <select id="tk-name" className={inputClass} value={pick} onChange={e => { setPick(e.target.value); setTouched(false); }}>
          {TICKET_PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          <option value={OTHER}>Something else…</option>
        </select>
      </Field>
      {pick === OTHER && <Field label="Name" htmlFor="tk-custom"><input id="tk-custom" className={inputClass} value={custom} onChange={e => setCustom(e.target.value)} placeholder="e.g. Confined space entry" /></Field>}
      <Field label="Number" optional htmlFor="tk-no"><input id="tk-no" className={inputClass} value={number} onChange={e => setNumber(e.target.value)} /></Field>
      <Field label="Issued" htmlFor="tk-iss"><input id="tk-iss" type="date" className={inputClass} value={issued} max={today()} onChange={e => { setIssued(e.target.value); }} /></Field>
      <Field label={`Expires${preset?.months ? ` (usually ${preset.months} months)` : ''}`} optional htmlFor="tk-exp"><input id="tk-exp" type="date" className={inputClass} value={expiry} onChange={e => { setExpires(e.target.value); setTouched(true); }} /></Field>
      <Field label="Trained by" optional htmlFor="tk-prov"><input id="tk-prov" className={inputClass} value={provider} onChange={e => setProvider(e.target.value)} placeholder="Training company or contractor" /></Field>
      <Field label="Notes" optional htmlFor="tk-notes"><input id="tk-notes" className={inputClass} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      <Field label="Certificate" optional htmlFor="tk-file"><input id="tk-file" type="file" className="text-sm" onChange={e => setFile(e.target.files?.[0] ?? null)} /></Field>
      <div className="col-span-2 sm:col-span-3 flex flex-col gap-2">
        {preset && <p className="m-0 text-xs text-muted">{preset.note}. The expiry fills in from the issue date, and you can change it.</p>}
        <ErrorNote message={error} />
        <div><button type="submit" disabled={busy} className={btnPri}>{busy ? 'Saving…' : 'Save ticket'}</button></div>
      </div>
    </form>
  );
}
