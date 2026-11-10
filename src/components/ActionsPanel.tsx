import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createAction, updateAction } from '../services/records.ts';
import { useLookups } from '../hooks/useLookups.ts';
import type { WhsAccess } from '../utils/access.ts';
import { isOfficeAccess } from '../utils/access.ts';
import { addDays, brisbaneDay, formatDay } from '../utils/dates.ts';
import { actionPill, sortActions, type SourceType, type WhsAction } from '../utils/records.ts';
import { ErrorNote, Field, inputClass } from './Form.tsx';
import { Pill } from './Pill.tsx';

/** Ask for a short note, then mark an action done. */
export function DoneDialog({ action, onClose, onDone }: { action: WhsAction | null; onClose: () => void; onDone: (a: WhsAction) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (action && !d.open) {
      setNote('');
      setError(null);
      d.showModal();
    }
    if (!action && d.open) d.close();
  }, [action]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!action) return;
    if (!note.trim()) return setError('Add a short note on what was done.');
    setBusy(true);
    const res = await updateAction(action.id, { status: 'done', done_note: note.trim() });
    setBusy(false);
    if (res.error || !res.data) return setError(res.error ?? 'Could not save.');
    onDone(res.data);
  }

  return (
    <dialog ref={ref} onClose={onClose} className="rounded-xl border border-line p-0 w-[min(440px,calc(100vw-32px))] backdrop:bg-black/40">
      <form onSubmit={submit} className="p-5 flex flex-col gap-3.5">
        <h2 className="m-0 text-lg font-semibold">Mark as done</h2>
        <p className="m-0 text-sm text-muted">{action?.title}</p>
        <Field label="What was done?" htmlFor="done-note">
          <textarea id="done-note" rows={3} className="w-full rounded-[10px] border border-[#D6D2CC] p-3 text-[15px]" value={note} onChange={e => setNote(e.target.value)} />
        </Field>
        <ErrorNote message={error} />
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="min-h-11 px-4 rounded-lg border border-line bg-white text-sm font-semibold cursor-pointer">Cancel</button>
          <button type="submit" disabled={busy} className="min-h-11 px-4 rounded-lg border-0 bg-finlay text-white text-sm font-semibold cursor-pointer disabled:opacity-60">
            {busy ? 'Saving…' : 'Mark done'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** The actions belonging to one incident or hazard, with a quick way to add one. */
export function ActionsPanel({ source, access, me, unitNo, machineId, actions, onChanged }: {
  source: { type: SourceType; id: string; ref: string };
  access: WhsAccess;
  me: string;
  unitNo: string;
  machineId: string | null;
  actions: WhsAction[];
  onChanged: () => void;
}) {
  const { people } = useLookups();
  const office = isOfficeAccess(access);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState(addDays(brisbaneDay(new Date()), 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState<WhsAction | null>(null);

  useEffect(() => {
    if (!owner && people.length) setOwner(people.find(p => p.id === me)?.id ?? people[0].id);
  }, [people, owner, me]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError('Say what needs doing.');
    setBusy(true);
    const res = await createAction({
      title: title.trim(),
      source_type: source.type,
      source_id: source.id,
      source_ref: source.ref,
      machine_id: machineId,
      unit_no: unitNo,
      owner_id: owner || null,
      due: due || null,
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    setTitle('');
    setAdding(false);
    onChanged();
  }

  const done = actions.filter(a => a.status === 'done').length;

  return (
    <section className="bg-white border border-line rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#EEEBE6] flex justify-between items-center gap-3">
        <h2 className="m-0 text-[17px] font-semibold">
          Actions <span className="font-medium text-muted text-sm">{actions.length ? `${done} of ${actions.length} done` : 'none yet'}</span>
        </h2>
        {office && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="bg-transparent border-0 text-sm font-semibold text-finlay cursor-pointer min-h-11">+ Add action</button>
        )}
      </div>

      {adding && (
        <form onSubmit={add} className="px-5 py-4 border-b border-line-soft bg-[#FAFAF9] flex flex-col gap-3">
          <Field label="What needs doing?" htmlFor="act-title">
            <input id="act-title" className={inputClass} value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Who" htmlFor="act-owner">
              <select id="act-owner" className={inputClass} value={owner} onChange={e => setOwner(e.target.value)}>
                {people.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Due" htmlFor="act-due">
              <input id="act-due" type="date" className={inputClass} value={due} onChange={e => setDue(e.target.value)} />
            </Field>
          </div>
          <ErrorNote message={error} />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="min-h-11 px-4 rounded-lg border-0 bg-finlay text-white text-sm font-semibold cursor-pointer disabled:opacity-60">{busy ? 'Saving…' : 'Add action'}</button>
            <button type="button" onClick={() => setAdding(false)} className="min-h-11 px-4 rounded-lg border border-line bg-white text-sm font-semibold cursor-pointer">Cancel</button>
          </div>
        </form>
      )}

      {sortActions(actions).map(a => {
        const pill = actionPill(a);
        const canFinish = a.status !== 'done' && (office || a.owner_id === me);
        return (
          <div key={a.id} className="flex flex-wrap items-center gap-3.5 px-5 py-3.5 border-b border-line-soft last:border-b-0">
            <span className="flex-[1_1_240px] min-w-0">
              <span className="block text-sm font-medium">{a.title}</span>
              <span className="block text-[13px] text-muted mt-0.5">
                {a.owner_name || 'No owner'} · {a.due ? `due ${formatDay(a.due)}` : 'no due date'}
                {a.status === 'done' && a.done_note ? ` · ${a.done_note}` : ''}
              </span>
            </span>
            {canFinish && (
              <button type="button" onClick={() => setFinishing(a)} className="min-h-10 px-3 rounded-lg border border-line bg-white text-[13px] font-semibold cursor-pointer">Mark done</button>
            )}
            <Pill tone={pill.tone}>{pill.label}</Pill>
          </div>
        );
      })}

      <DoneDialog action={finishing} onClose={() => setFinishing(null)} onDone={() => { setFinishing(null); onChanged(); }} />
    </section>
  );
}
