import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createCheck, getChecklist, lastPrestart, listChecklists, listFlags } from '../services/checks.ts';
import { uploadPhotos } from '../services/records.ts';
import type { WhsUser } from '../services/auth.ts';
import { useLookups } from '../hooks/useLookups.ts';
import { go } from '../hooks/useRoute.ts';
import { formatDate, formatLongDate, formatWhen } from '../utils/dates.ts';
import { missingAnswers, openFlags, resultFor, TAKE5_CONTROLS, TAKE5_HAZARDS, type Checklist, type PlantFlag } from '../utils/checks.ts';
import { finaliseAnswers, plainAnswers } from '../utils/draftAnswers.ts';
import { ChecklistQuestions, type DraftAnswers } from './ChecklistQuestions.tsx';
import { ErrorNote, Field, MachinePicker, PhotoPicker, PrimaryButton, SitePicker, inputClass, textareaClass } from './Form.tsx';
import { Pill } from './Pill.tsx';
import { SignaturePad } from './SignaturePad.tsx';

const RESULT_BOX = {
  stop: { cls: 'bg-finlay text-white', title: 'Do not operate', note: 'A critical check failed. Tag the unit out and tell your supervisor. The unit is flagged until the workshop clears it.' },
  fault: { cls: 'bg-[#FFF1D6] text-[#7A4A00] border border-[#F2D9A6]', title: 'OK to operate, with a fault reported', note: 'The fault goes to the workshop as an action. Tell your supervisor if it gets worse.' },
  ok: { cls: 'bg-[#E3F3E8] text-[#1E6B3A] border border-[#BFE3CB]', title: 'OK to operate', note: 'All checks passed.' },
} as const;

function MissingNote({ missing }: { missing: string[] }) {
  if (!missing.length) return null;
  return (
    <div role="alert" className="text-sm text-[#8E0F15] bg-[#FBE3E4] rounded-lg px-3 py-2.5">
      Still to answer:
      <ul className="mt-1 mb-0 pl-5">{missing.slice(0, 6).map(m => <li key={m}>{m}</li>)}</ul>
      {missing.length > 6 && <span>and {missing.length - 6} more.</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------------
// Pre-start
// ---------------------------------------------------------------------------------

export function PrestartForm(_: { user: WhsUser }) {
  const { machines } = useLookups();
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [machine, setMachine] = useState<{ id: string | null; unitNo: string }>({ id: null, unitNo: '' });
  const [hours, setHours] = useState('');
  const [answers, setAnswers] = useState<DraftAnswers>({});
  const [last, setLast] = useState<Awaited<ReturnType<typeof lastPrestart>>>(null);
  const [flags, setFlags] = useState<PlantFlag[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listChecklists().then(res => {
      if (res.error) return setLoadError(res.error);
      const c = (res.data ?? []).find(x => x.kind === 'prestart' && x.active);
      if (!c) setLoadError('No pre-start checklist is set up.');
      setChecklist(c ?? null);
    });
    listFlags().then(res => setFlags(res.data ?? []));
  }, []);

  useEffect(() => {
    setLast(null);
    if (machine.unitNo) lastPrestart(machine.unitNo).then(setLast);
  }, [machine.unitNo]);

  const model = machines.find(m => m.id === machine.id)?.model;
  const unitFlags = openFlags(flags).filter(f => f.unit_no === machine.unitNo);
  const plain = plainAnswers(answers);
  const answeredCount = checklist ? checklist.items.filter(i => plain[i.id]?.v !== undefined).length : 0;
  const { result } = checklist ? resultFor('prestart', checklist.items, plain) : { result: 'ok' as const };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!checklist) return;
    setError(null);
    const miss = [...(machine.unitNo ? [] : ['Unit number']), ...missingAnswers(checklist.items, plain)];
    setMissing(miss);
    if (miss.length) return;
    setBusy(true);
    try {
      const fin = await finaliseAnswers(answers, uploadPhotos);
      if (fin.error || !fin.answers) return setError(fin.error ?? 'Could not save the photos.');
      const res = await createCheck({
        kind: 'prestart',
        checklist_id: checklist.id,
        machine_id: machine.id,
        unit_no: machine.unitNo,
        engine_hours: hours ? Number(hours.replace(/[^0-9.]/g, '')) : null,
        answers: fin.answers,
      });
      if (res.error || !res.data) return setError(res.error ?? 'Could not save the pre-start.');
      go({ name: 'check', id: res.data.id });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorNote message={loadError} />;
  if (!checklist) return <p className="text-sm text-muted">Loading…</p>;
  const box = RESULT_BOX[result === 'issues' ? 'fault' : result];

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 max-w-[560px]">
      <h1 className="m-0 text-xl font-bold">Pre-start check</h1>

      <MachinePicker label="Unit number" machines={machines} machineId={machine.id} unitNo={machine.unitNo} onChange={(id, unitNo) => setMachine({ id, unitNo })} />
      {machine.unitNo && (
        <p className="-mt-2 mb-0 text-[13px] text-muted">
          {model ? `${model} · ` : ''}
          {last ? `last pre-start ${formatWhen(last.done_at)} by ${last.done_by_name}` : 'no pre-start recorded yet'}
        </p>
      )}
      {unitFlags.map(f => (
        <div key={f.id} role="alert" className={`rounded-xl px-3.5 py-3 text-sm ${f.level === 'stop' ? 'bg-finlay text-white' : 'bg-[#FFF1D6] text-[#7A4A00]'}`}>
          <strong>{f.level === 'stop' ? 'Flagged: do not use.' : 'Open fault.'}</strong> {f.reason}
        </div>
      ))}

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Engine hours" htmlFor="ps-hours">
          <input id="ps-hours" inputMode="decimal" className={inputClass} value={hours} onChange={e => setHours(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Date</span>
          <span className="min-h-12 flex items-center text-[15px] text-muted">{formatLongDate(new Date())}</span>
        </div>
      </div>

      <div className="flex justify-between items-baseline">
        <h2 className="m-0 text-base font-bold">Checks</h2>
        <span className="text-[13px] text-muted">{answeredCount} of {checklist.items.length} checked</span>
      </div>
      <ChecklistQuestions items={checklist.items} answers={answers} onChange={(id, a) => setAnswers(prev => ({ ...prev, [id]: a }))} showSections={false} />

      {answeredCount > 0 && (
        <div className={`rounded-xl p-4 flex flex-col gap-1.5 ${box.cls}`}>
          <div className="font-bold text-lg">{box.title}</div>
          <div className="text-sm leading-relaxed">{box.note}</div>
        </div>
      )}

      <MissingNote missing={missing} />
      <ErrorNote message={error} />
      <PrimaryButton type="submit" busy={busy}>Submit pre-start</PrimaryButton>
      <p className="mt-0 mb-6 text-xs text-muted text-center">A failed check flags the unit and creates an action for the workshop. The fleet status is not changed.</p>
    </form>
  );
}

// ---------------------------------------------------------------------------------
// Take 5
// ---------------------------------------------------------------------------------

function Chips({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter(x => x !== o) : [...value, o])}
            className={`min-h-11 px-3.5 rounded-full text-sm font-semibold cursor-pointer border ${on ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[#D6D2CC]'}`}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function Take5Form({ user }: { user: WhsUser }) {
  const { machines, sites } = useLookups();
  const [task, setTask] = useState('');
  const [machine, setMachine] = useState<{ id: string | null; unitNo: string }>({ id: null, unitNo: '' });
  const [site, setSite] = useState<{ id: string | null; name: string }>({ id: null, name: '' });
  const [hazards, setHazards] = useState<string[]>([]);
  const [otherHazards, setOtherHazards] = useState('');
  const [controls, setControls] = useState<string[]>([]);
  const [safe, setSafe] = useState<boolean | null>(null);
  const [crew, setCrew] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (site.id || site.name || !sites.length) return;
    const mine = sites.find(s => user.location && s.name.toLowerCase().includes(user.location.toLowerCase())) ?? sites[0];
    setSite({ id: mine.id, name: mine.name });
  }, [sites, site.id, site.name, user.location]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!task.trim()) return setError('Say what the task is.');
    if (safe === null) return setError('Answer "Is it safe to start?"');
    setBusy(true);
    const res = await createCheck({
      kind: 'take5',
      task: task.trim(),
      machine_id: machine.id,
      unit_no: machine.unitNo,
      site_id: site.id,
      site_name: site.name,
      hazards: [...hazards, ...(otherHazards.trim() ? [otherHazards.trim()] : [])],
      controls,
      safe_to_start: safe,
      crew: crew.trim(),
    });
    setBusy(false);
    if (res.error || !res.data) return setError(res.error ?? 'Could not save the Take 5.');
    go({ name: 'check', id: res.data.id });
  }

  const step = (n: number, t: string) => <h2 className="m-0 text-[15px] font-bold"><span className="text-finlay">{n}</span> · {t}</h2>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4.5 max-w-[560px]">
      <div>
        <h1 className="m-0 text-xl font-bold">Take 5</h1>
        <p className="mt-1.5 mb-0 text-sm text-muted leading-relaxed">Stop and think before a task that's new, unusual or has changed.</p>
      </div>
      <section className="flex flex-col gap-2">
        {step(1, 'The task')}
        <input aria-label="The task" placeholder="e.g. Change screen mesh on top deck" className={inputClass} value={task} onChange={e => setTask(e.target.value)} />
        <MachinePicker label="Unit" machines={machines} machineId={machine.id} unitNo={machine.unitNo} onChange={(id, unitNo) => setMachine({ id, unitNo })} />
        <SitePicker sites={sites} siteId={site.id} siteName={site.name} onChange={(id, name) => setSite({ id, name })} />
      </section>
      <section className="flex flex-col gap-2">
        {step(2, 'What could hurt someone?')}
        <Chips options={TAKE5_HAZARDS} value={hazards} onChange={setHazards} />
        <input aria-label="Other hazards" placeholder="Anything else?" className={inputClass} value={otherHazards} onChange={e => setOtherHazards(e.target.value)} />
      </section>
      <section className="flex flex-col gap-2">
        {step(3, 'How will you control it?')}
        <Chips options={TAKE5_CONTROLS} value={controls} onChange={setControls} />
      </section>
      <section className="flex flex-col gap-2">
        {step(4, 'Is it safe to start?')}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={safe === true} onClick={() => setSafe(true)}
            className={`min-h-14 rounded-xl text-base font-bold cursor-pointer ${safe === true ? 'bg-[#1E6B3A] text-white border-0' : 'bg-white text-ink border border-[#D6D2CC]'}`}>Yes</button>
          <button type="button" aria-pressed={safe === false} onClick={() => setSafe(false)}
            className={`min-h-14 rounded-xl text-base font-bold cursor-pointer ${safe === false ? 'bg-finlay text-white border-0' : 'bg-white text-ink border border-[#D6D2CC]'}`}>No</button>
        </div>
        {safe === false && (
          <div role="alert" className="bg-finlay text-white rounded-xl p-3.5 text-sm leading-relaxed">
            <strong className="block text-base mb-1">Don't start. Call your supervisor.</strong>
            Your Take 5 is saved and shows on the office home screen. You can also report it as a hazard.
          </div>
        )}
      </section>
      <section className="flex flex-col gap-2">
        {step(5, "Who's doing it?")}
        <input aria-label="Crew" className={inputClass} value={crew} onChange={e => setCrew(e.target.value)} />
      </section>
      <ErrorNote message={error} />
      <PrimaryButton type="submit" busy={busy}>Save Take 5</PrimaryButton>
      <p className="mt-0 mb-6 text-xs text-muted text-center">Kept with the unit and the site.</p>
    </form>
  );
}

// ---------------------------------------------------------------------------------
// Site inspection
// ---------------------------------------------------------------------------------

export function SiteInspectionForm({ checklistId, user }: { checklistId: string; user: WhsUser }) {
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<DraftAnswers>({});
  const [comments, setComments] = useState('');
  const [extra, setExtra] = useState<File[]>([]);
  const [signed, setSigned] = useState(false);
  const [signature, setSignature] = useState<File | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getChecklist(checklistId).then(res => (res.error ? setLoadError(res.error) : setChecklist(res.data ?? null)));
  }, [checklistId]);

  const plain = useMemo(() => plainAnswers(answers), [answers]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!checklist) return;
    setError(null);
    const miss = [...missingAnswers(checklist.items, plain), ...(signed ? [] : ['Sign-off tick box']), ...(signature ? [] : ['Signature'])];
    setMissing(miss);
    if (miss.length) return;
    setBusy(true);
    try {
      const fin = await finaliseAnswers(answers, uploadPhotos);
      if (fin.error || !fin.answers) return setError(fin.error ?? 'Could not save the photos.');
      const more = await uploadPhotos(extra);
      if (more.error) return setError(more.error);
      const sig = await uploadPhotos(signature ? [signature] : []);
      if (sig.error || !sig.data?.[0]) return setError(sig.error ?? 'Could not save the signature.');
      const res = await createCheck({
        kind: 'site',
        checklist_id: checklist.id,
        site_id: checklist.site_id,
        site_name: checklist.site_name,
        answers: fin.answers,
        comments: comments.trim(),
        photos: more.data ?? [],
        signed_off: true,
        signature_path: sig.data[0],
      });
      if (res.error || !res.data) return setError(res.error ?? 'Could not save the inspection.');
      go({ name: 'check', id: res.data.id });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorNote message={loadError} />;
  if (!checklist) return <p className="text-sm text-muted">Loading…</p>;
  const { issues } = resultFor('site', checklist.items, plain);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4.5 max-w-[640px]">
      <div>
        <h1 className="m-0 text-xl font-bold">{checklist.name}</h1>
        <p className="mt-1.5 mb-0 text-sm text-muted">{formatDate(new Date())} · conducted by {user.name}</p>
      </div>
      <ChecklistQuestions items={checklist.items} answers={answers} onChange={(id, a) => setAnswers(prev => ({ ...prev, [id]: a }))} />
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-base font-bold">Sign-off</h2>
        <Field label="Any other issues or comments" htmlFor="si-comments" optional>
          <textarea id="si-comments" rows={3} className={textareaClass} value={comments} onChange={e => setComments(e.target.value)} />
        </Field>
        <PhotoPicker files={extra} onChange={setExtra} />
        <label className="flex gap-3 items-center min-h-12 bg-white border border-line rounded-xl px-3.5 cursor-pointer text-sm font-semibold">
          <input type="checkbox" checked={signed} onChange={e => setSigned(e.target.checked)} className="w-[22px] h-[22px] flex-none accent-[#B9151C]" />
          I, {user.name}, confirm this inspection is complete and accurate.
        </label>
        <SignaturePad label={`Signature: ${user.name}`} onChange={setSignature} />
        {issues > 0 && <p className="m-0 text-sm"><Pill tone="amber">{issues} issue{issues > 1 ? 's' : ''}</Pill> <span className="text-muted">You can turn each issue into an action after saving.</span></p>}
      </section>
      <MissingNote missing={missing} />
      <ErrorNote message={error} />
      <PrimaryButton type="submit" busy={busy}>Submit inspection</PrimaryButton>
      <div className="mb-6" />
    </form>
  );
}

