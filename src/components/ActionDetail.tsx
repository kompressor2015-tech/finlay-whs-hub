import { DeleteEntry } from './DeleteEntry.tsx';
import { useEffect, useState } from 'react';
import { updateAction } from '../services/records.ts';
import { useLookups } from '../hooks/useLookups.ts';
import { isOfficeAccess } from '../utils/access.ts';
import type { WhsUser } from '../services/auth.ts';
import { formatDay, formatWhen } from '../utils/dates.ts';
import { actionPill, type WhsAction } from '../utils/records.ts';
import { DoneDialog } from './ActionsPanel.tsx';
import { ErrorNote } from './Form.tsx';
import { Pill } from './Pill.tsx';

const label = 'text-muted text-[13px]';
const input = 'w-full min-h-11 rounded-lg border border-[#D6D2CC] bg-white px-3 text-sm';

/** One corrective action, for the side panel on the Actions page. */
export function ActionDetail({ action, user, sourceHref, onChanged, onDeleted }: { action: WhsAction; user: WhsUser; sourceHref: string | null; onChanged: () => void; onDeleted?: () => void }) {
  const office = isOfficeAccess(user.access);
  const canEdit = office || action.owner_id === user.id;
  const { people } = useLookups();
  const [a, setA] = useState(action);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  useEffect(() => setA(action), [action]);

  async function save(patch: Partial<Pick<WhsAction, 'owner_id' | 'due' | 'status'>>) {
    setError(null);
    const res = await updateAction(a.id, patch);
    if (res.error || !res.data) return setError(res.error ?? 'Could not save.');
    setA(res.data);
    onChanged();
  }

  const pill = actionPill(a);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Pill tone={pill.tone}>{pill.label}</Pill>
        <h2 className="mt-2 mb-0 text-xl font-bold">{a.title} {a.unit_no && <span className="text-finlay">{a.unit_no}</span>}</h2>
        <p className="mt-1 mb-0 text-sm text-muted">
          Came from {sourceHref ? <a href={sourceHref}>{a.source_ref}</a> : a.source_ref || 'a hand-added action'} · raised {formatWhen(a.created_at)}
        </p>
      </div>

      <ErrorNote message={error} />

      <dl className="m-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <dt className={label}>Owner</dt>
          <dd className="mt-1 ml-0">
            {canEdit && office && a.status !== 'done' ? (
              <select aria-label="Owner" className={input} value={a.owner_id ?? ''} onChange={e => save({ owner_id: e.target.value || null })}>
                <option value="">Nobody yet</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : <span className="text-sm font-medium">{a.owner_name || '—'}</span>}
          </dd>
        </div>
        <div>
          <dt className={label}>Due</dt>
          <dd className="mt-1 ml-0">
            {canEdit && a.status !== 'done' ? (
              <input type="date" aria-label="Due date" className={input} value={a.due ?? ''} onChange={e => save({ due: e.target.value || null })} />
            ) : <span className="text-sm font-medium">{formatDay(a.due) || '—'}</span>}
          </dd>
        </div>
      </dl>

      {a.status === 'done' ? (
        <section className="bg-[#F4FAF5] border border-line rounded-xl px-4 py-3 text-sm">
          <div className="font-semibold">Done {a.done_at ? formatWhen(a.done_at) : ''}</div>
          <p className="mt-1 mb-0 whitespace-pre-line">{a.done_note || 'No note.'}</p>
        </section>
      ) : canEdit && (
        <div className="flex flex-wrap gap-2">
          {a.status === 'not_started' && (
            <button type="button" onClick={() => save({ status: 'in_progress' })} className="min-h-11 px-4 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold cursor-pointer">Start work</button>
          )}
          <button type="button" onClick={() => setFinishing(true)} className="min-h-11 px-4 rounded-lg border-0 bg-ink text-white text-sm font-semibold cursor-pointer">Mark done</button>
        </div>
      )}

      <DoneDialog action={finishing ? a : null} onClose={() => setFinishing(false)} onDone={() => { setFinishing(false); onChanged(); }} />

      <DeleteEntry type="action" id={a.id} user={user} label="this action" onDeleted={() => (onDeleted ?? onChanged)()} />
    </div>
  );
}
