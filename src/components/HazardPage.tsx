import { useCallback, useEffect, useState } from 'react';
import { getHazard, listActions, listHistory, photoLinks, updateHazard } from '../services/records.ts';
import type { WhsUser } from '../services/auth.ts';
import { hrefFor } from '../hooks/useRoute.ts';
import { isOfficeAccess } from '../utils/access.ts';
import { formatDay, formatLongDate, formatTime, formatWhen } from '../utils/dates.ts';
import { dueWords, hazardFixBy, hazardStatus, riskFor, SEVERITIES, type Hazard, type HistoryEntry, type WhsAction } from '../utils/records.ts';
import { ActionsPanel } from './ActionsPanel.tsx';
import { ErrorNote } from './Form.tsx';
import { Pill } from './Pill.tsx';

const card = 'bg-white border border-line rounded-xl';
const smallButton = 'min-h-11 px-4 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
const SAFE_WORDS = { yes: 'Yes', partly: 'Partly', no: 'No' } as const;

export function HazardPage({ id, user, embedded }: { id: string; user: WhsUser; embedded?: boolean }) {
  const office = isOfficeAccess(user.access);
  const [hazard, setHazard] = useState<Hazard | null>(null);
  const [actions, setActions] = useState<WhsAction[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await getHazard(id);
    if (res.error || !res.data) return setError(res.error ?? 'Not found');
    setHazard(res.data);
    const [acts, hist, links] = await Promise.all([listActions({ type: 'hazard', id }), office ? listHistory('hazard', id) : Promise.resolve([]), photoLinks(res.data.photos)]);
    setActions(acts.data ?? []);
    setHistory(hist);
    setPhotos(links);
  }, [id, office]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(patch: Partial<Hazard>) {
    setSaving(true);
    setError(null);
    const res = await updateHazard(id, patch);
    setSaving(false);
    if (res.error) return setError(res.error);
    await load();
  }

  if (!hazard) return error ? <ErrorNote message={error} /> : <p className="text-muted text-sm">Loading…</p>;

  const risk = riskFor(hazard.severity);
  const status = hazardStatus(hazard.status);
  const fixBy = hazardFixBy(hazard);
  const allDone = actions.length > 0 && actions.every(a => a.status === 'done');

  return (
    <div className="flex flex-col gap-5">
      {!embedded && (
  <a href={hrefFor({ name: 'module', id: 'hazards' })} className="text-sm no-underline text-muted">← Hazards</a>
      )}

      <div className="flex flex-wrap justify-between items-start gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-semibold text-muted">{hazard.ref} · Hazard</span>
            <Pill tone={status.tone}>{status.label}</Pill>
            <Pill tone={risk.tone}>{risk.label} risk</Pill>
          </div>
          <h1 className="mt-1.5 mb-0 text-2xl font-bold break-words">{hazard.description}</h1>
          <p className="mt-1.5 mb-0 text-muted text-[15px]">
            {formatLongDate(hazard.created_at)} {formatTime(hazard.created_at)} · {hazard.site_name}
            {hazard.location_detail ? `, ${hazard.location_detail}` : ''}
            {hazard.unit_no && <> · Unit <span className="text-finlay font-bold">{hazard.unit_no}</span></>}
            {' '}· reported by {hazard.reporter_name}
          </p>
        </div>
        {office && (
          <div className="flex flex-wrap gap-2">
            {hazard.status === 'new' && actions.length > 0 && (
              <button type="button" disabled={saving} className={`${smallButton} border-0 bg-ink text-white`} onClick={() => save({ status: 'actioned' })}>Mark reviewed</button>
            )}
            {hazard.status !== 'closed' ? (
              <button type="button" disabled={saving || (actions.length > 0 && !allDone)} title={actions.length > 0 && !allDone ? 'Finish the actions first' : ''}
                className={`${smallButton} border-0 bg-finlay text-white`} onClick={() => save({ status: 'closed' })}>
                Close hazard
              </button>
            ) : (
              <button type="button" disabled={saving} className={`${smallButton} border border-[#D6D2CC] bg-white`} onClick={() => save({ status: 'actioned' })}>Reopen</button>
            )}
          </div>
        )}
      </div>

      <ErrorNote message={error} />

      <div className="flex flex-wrap gap-5 items-start">
        <div className="flex-[2_1_520px] min-w-0 flex flex-col gap-5">
          <section className={`${card} px-5 py-4.5`}>
            <dl className="m-0 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 text-sm">
              <div><dt className="text-muted text-[13px]">How bad it could be</dt><dd className="mt-0.5 ml-0 font-medium">{SEVERITIES.find(s => s.id === hazard.severity)?.label} ({SEVERITIES.find(s => s.id === hazard.severity)?.sub.toLowerCase()})</dd></div>
              <div><dt className="text-muted text-[13px]">Fix by</dt><dd className="mt-0.5 ml-0 font-medium">{formatDay(fixBy)} {hazard.status !== 'closed' && <span className="text-muted font-normal">({dueWords(fixBy)})</span>}</dd></div>
              <div><dt className="text-muted text-[13px]">Made safe for now</dt><dd className="mt-0.5 ml-0 font-medium">{SAFE_WORDS[hazard.made_safe]}{hazard.made_safe_note ? `: ${hazard.made_safe_note}` : ''}</dd></div>
            </dl>
            {photos.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {photos.map((src, i) => (
                  <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt={`Photo ${i + 1}`} className="w-28 h-20 object-cover rounded-md" /></a>
                ))}
              </div>
            )}
          </section>

          <ActionsPanel
            source={{ type: 'hazard', id: hazard.id, ref: hazard.ref }}
            access={user.access}
            me={user.id}
            unitNo={hazard.unit_no}
            machineId={hazard.machine_id}
            actions={actions}
            onChanged={load}
          />
        </div>

        {office && (
          <div className="flex-[1_1_300px] min-w-0">
            <section className={`${card} px-4.5 py-4`}>
              <h2 className="mt-0 mb-2.5 text-[15px] font-semibold">History</h2>
              {history.length === 0 ? <p className="m-0 text-sm text-muted">No history yet.</p> : (
                <ol className="list-none m-0 p-0 flex flex-col gap-2.5 text-[13px]">
                  {history.map(h => (
                    <li key={h.id}><span className="text-muted">{formatWhen(h.occurred_at)} · {h.actor_name}</span><span className="block mt-px">{h.what}</span></li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
