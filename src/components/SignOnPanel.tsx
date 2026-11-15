import { useState } from 'react';
import { signOn } from '../services/signon.ts';
import { expiredTicketNames, type Job } from '../utils/signon.ts';
import type { Ticket } from '../utils/tickets.ts';
import type { Swms, SwmsVersion } from '../utils/swms.ts';
import { ErrorNote, Field, inputClass } from './Form.tsx';
import { SignaturePad } from './SignaturePad.tsx';

const btn = 'min-h-11 px-4 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold cursor-pointer';
const primary = 'min-h-12 px-5 rounded-lg border-0 bg-finlay hover:bg-finlay-dark text-white text-[15px] font-bold cursor-pointer disabled:opacity-60';

interface Props {
  swms: Swms;
  version: SwmsVersion;
  /** Running or upcoming jobs this SWMS is linked to */
  jobs: Job[];
  /** 'self': a worker on their own phone. 'office': a supervisor signing a worker or contractor on. */
  mode: 'self' | 'office';
  /** The worker's own record (self mode) */
  personId?: string | null;
  /** Active workers to pick from (office mode) */
  people?: { id: string; name: string }[];
  tickets?: Ticket[];
  onDone: () => void;
}

/** Read it, tick, sign with a finger, done. Same panel on the phone and in the office. */
export function SignOnPanel({ swms, version, jobs, mode, personId, people = [], tickets = [], onDone }: Props) {
  const [who, setWho] = useState<'worker' | 'contractor'>('worker');
  const [pick, setPick] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [jobId, setJobId] = useState(jobs.length === 1 ? jobs[0].id : '');
  const [agreed, setAgreed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (mode === 'self' && !personId) {
    return (
      <div className="rounded-xl border border-[#F0DDA6] bg-[#FFF3D6] p-4 text-sm">
        Your login is not linked to a worker record yet, so the app cannot sign you on. Ask your supervisor to sign you on from their phone.
      </div>
    );
  }

  const target = mode === 'self' ? personId! : who === 'worker' ? pick : '';
  const flags = mode === 'office' && who === 'worker' && pick ? expiredTicketNames(tickets.filter(t => t.person_id === pick)) : [];

  async function submit() {
    if (mode === 'office' && who === 'worker' && !pick) return setError('Choose who is signing on.');
    if (mode === 'office' && who === 'contractor' && (!name.trim() || !company.trim())) return setError('Add the contractor’s name and company.');
    if (!file) return setError('Sign in the box first.');
    setBusy(true);
    const r = await signOn({
      swms_id: swms.id, version_id: version.id, job_id: jobId || null,
      person_id: target || null, signer_name: target ? undefined : name.trim(), company: target ? undefined : company.trim(),
    }, file);
    setBusy(false);
    if (r.error) return setError(r.error);
    setError(null);
    onDone();
  }

  return (
    <div className="flex flex-col gap-3">
      {mode === 'office' && (
        <div role="radiogroup" aria-label="Who is signing on" className="flex gap-2">
          {(['worker', 'contractor'] as const).map(w => (
            <button key={w} type="button" role="radio" aria-checked={who === w} onClick={() => { setWho(w); setError(null); }} className={`min-h-10 px-4 rounded-full text-sm font-semibold cursor-pointer border ${who === w ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[#D6D2CC]'}`}>
              {w === 'worker' ? 'Finlay worker' : 'Contractor'}
            </button>
          ))}
        </div>
      )}
      {mode === 'office' && who === 'worker' && (
        <Field label="Who is signing on" htmlFor="so-person">
          <select id="so-person" value={pick} onChange={e => setPick(e.target.value)} className={inputClass}>
            <option value="">Choose a worker…</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      )}
      {flags.length > 0 && (
        <div role="status" className="rounded-lg border border-[#F0DDA6] bg-[#FFF3D6] p-3 text-sm">Expired ticket: {flags.join(', ')}. They can still sign on. This is flagged so you can follow it up.</div>
      )}
      {mode === 'office' && who === 'contractor' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" htmlFor="so-name"><input id="so-name" value={name} onChange={e => setName(e.target.value)} className={inputClass} autoComplete="off" /></Field>
          <Field label="Company" htmlFor="so-co"><input id="so-co" value={company} onChange={e => setCompany(e.target.value)} className={inputClass} autoComplete="off" /></Field>
        </div>
      )}
      {jobs.length > 0 && (
        <Field label="Job" optional htmlFor="so-job">
          <select id="so-job" value={jobId} onChange={e => setJobId(e.target.value)} className={inputClass}>
            <option value="">Not for a particular job</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
        </Field>
      )}
      <label className="flex items-start gap-3 text-[15px] min-h-11 cursor-pointer">
        <input type="checkbox" className="mt-1 w-5 h-5" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
        {mode === 'self' ? 'I have read and understood this SWMS and I will follow it.' : 'This person has read, or had read to them, this SWMS and understands it.'}
      </label>
      <SignaturePad onChange={setFile} label={mode === 'self' ? 'Sign here' : 'Signature of the person signing on'} />
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <button type="button" disabled={busy || !agreed || !file} onClick={() => void submit()} className={primary}>{busy ? 'Signing on…' : 'Sign on'}</button>
        {mode === 'office' && <button type="button" className={btn} onClick={onDone}>Cancel</button>}
      </div>
    </div>
  );
}
