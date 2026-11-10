import { useCallback, useEffect, useState } from 'react';
import { getCheck, listFlags } from '../services/checks.ts';
import { listActions, photoLinks } from '../services/records.ts';
import type { WhsUser } from '../services/auth.ts';
import { hrefFor } from '../hooks/useRoute.ts';
import { formatDate, formatLongDate, formatTime } from '../utils/dates.ts';
import { answerText, flagPill, isProblem, resultPill, sections, type Check, type PlantFlag } from '../utils/checks.ts';
import type { WhsAction } from '../utils/records.ts';
import { ActionsPanel } from './ActionsPanel.tsx';
import { ErrorNote } from './Form.tsx';
import { Pill } from './Pill.tsx';

const card = 'bg-white border border-line rounded-xl';
const TITLES = { prestart: 'Pre-start', take5: 'Take 5', site: 'Site inspection' } as const;

/** A completed pre-start, Take 5 or site inspection. Checks are records: they can't be edited. */
export function CheckPage({ id, user }: { id: string; user: WhsUser }) {
  const [check, setCheck] = useState<Check | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [actions, setActions] = useState<WhsAction[]>([]);
  const [flags, setFlags] = useState<PlantFlag[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getCheck(id);
    if (res.error || !res.data) return setError(res.error ?? 'Not found');
    const c = res.data;
    setCheck(c);
    const paths = [...Object.values(c.answers).flatMap(a => a.photos ?? []), ...c.photos];
    const [urls, acts, fl] = await Promise.all([photoLinks(paths), listActions({ type: 'inspection', id }), listFlags()]);
    setLinks(Object.fromEntries(paths.map((p, i) => [p, urls[i]]).filter(([, u]) => u)));
    setActions(acts.data ?? []);
    setFlags((fl.data ?? []).filter(f => f.check_id === id));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!check) return error ? <ErrorNote message={error} /> : <p className="text-muted text-sm">Loading…</p>;

  const pill = resultPill(check.kind, check.result, check.issue_count);
  const photoRow = (paths: string[] | undefined) =>
    paths?.length ? (
      <span className="flex flex-wrap gap-1.5 mt-1.5">
        {paths.map(p => (links[p] ? <a key={p} href={links[p]} target="_blank" rel="noreferrer"><img src={links[p]} alt="Photo" className="w-20 h-16 object-cover rounded" /></a> : null))}
      </span>
    ) : null;

  return (
    <div className="flex flex-col gap-5 max-w-[960px]">
      <a href={hrefFor({ name: 'module', id: 'inspections' })} className="text-sm no-underline text-muted">← Inspections &amp; checks</a>

      <div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm font-semibold text-muted">{TITLES[check.kind]}{check.checklist_name && check.kind === 'site' ? '' : ''}</span>
          <Pill tone={pill.tone}>{pill.label}</Pill>
        </div>
        <h1 className="mt-1.5 mb-0 text-2xl font-bold">
          {check.kind === 'site' ? check.checklist_name : check.kind === 'take5' ? check.task : <>Unit <span className="text-finlay">{check.unit_no}</span></>}
        </h1>
        <p className="mt-1.5 mb-0 text-muted text-[15px]">
          {formatLongDate(check.done_at)} {formatTime(check.done_at)} · by {check.done_by_name}
          {check.engine_hours !== null && check.kind === 'prestart' ? ` · ${check.engine_hours.toLocaleString('en-AU')} hours` : ''}
          {check.site_name ? ` · ${check.site_name}` : ''}
          {check.kind === 'take5' && check.unit_no ? <> · Unit <span className="text-finlay font-bold">{check.unit_no}</span></> : null}
          {check.checklist_version ? ` · checklist version ${check.checklist_version}` : ''}
        </p>
      </div>

      {flags.map(f => {
        const fp = flagPill(f.level);
        return (
          <section key={f.id} className={`${card} px-4.5 py-3.5 flex flex-wrap gap-3 items-center`}>
            <Pill tone={fp.tone}>{fp.label}</Pill>
            <span className="text-sm flex-1 min-w-[200px]">{f.cleared_at ? `Flag cleared ${formatDate(f.cleared_at)} by ${f.cleared_by_name}: ${f.clear_note}` : 'Unit flagged until the workshop clears it.'}</span>
            <a href={hrefFor({ name: 'module', id: 'plant' })} className="text-sm font-semibold">Plant safety</a>
          </section>
        );
      })}

      {check.kind === 'take5' ? (
        <section className={`${card} px-5 py-4.5`}>
          <dl className="m-0 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 text-sm">
            <div><dt className="text-muted text-[13px]">Hazards</dt><dd className="mt-0.5 ml-0 font-medium">{check.hazards.join(', ') || '—'}</dd></div>
            <div><dt className="text-muted text-[13px]">Controls</dt><dd className="mt-0.5 ml-0 font-medium">{check.controls.join(', ') || '—'}</dd></div>
            <div><dt className="text-muted text-[13px]">Safe to start</dt><dd className="mt-0.5 ml-0 font-medium">{check.safe_to_start ? 'Yes' : 'No'}</dd></div>
            <div><dt className="text-muted text-[13px]">Crew</dt><dd className="mt-0.5 ml-0 font-medium">{check.crew || '—'}</dd></div>
          </dl>
        </section>
      ) : (
        sections(check.items).map(s => (
          <section key={s.name} className={`${card} overflow-hidden`}>
            <h2 className="m-0 px-5 py-3.5 border-b border-[#EEEBE6] text-[15px] font-semibold">{s.name}</h2>
            {s.items.map(item => {
              const a = check.answers[item.id];
              const bad = isProblem(item, a);
              return (
                <div key={item.id} className={`px-5 py-3 border-b border-line-soft last:border-b-0 text-sm ${bad ? 'bg-[#FFF6F6]' : ''}`}>
                  <div className="flex gap-3 justify-between">
                    <span className="font-medium">{item.text}{item.critical && <span className="ml-1.5 text-[11px] font-bold px-1.5 rounded-full bg-[#FBE3E4] text-[#8E0F15]">!</span>}</span>
                    {item.type !== 'photo' && <span className={`whitespace-nowrap font-semibold ${bad ? 'text-[#8E0F15]' : 'text-ink'}`}>{answerText(item, a)}</span>}
                  </div>
                  {item.type === 'tick_list' && Array.isArray(a?.v) && bad && (
                    <span className="block text-[13px] text-[#8E0F15] mt-0.5">Not ticked: {(item.options ?? []).filter(o => !(a.v as string[]).includes(o)).join('; ')}</span>
                  )}
                  {item.type === 'text' && typeof a?.v === 'string' && <span className="block mt-0.5 whitespace-pre-line">{a.v}</span>}
                  {a?.note && <span className="block text-[13px] text-muted mt-0.5">{a.note}</span>}
                  {photoRow(a?.photos)}
                </div>
              );
            })}
          </section>
        ))
      )}

      {(check.comments || check.photos.length > 0) && (
        <section className={`${card} px-5 py-4`}>
          <h2 className="mt-0 mb-2 text-[15px] font-semibold">Comments</h2>
          {check.comments && <p className="m-0 text-sm whitespace-pre-line">{check.comments}</p>}
          {photoRow(check.photos)}
        </section>
      )}
      {check.kind === 'site' && <p className="m-0 text-sm text-muted">{check.signed_off ? `Signed off by ${check.done_by_name}.` : 'Not signed off.'}</p>}

      {check.kind !== 'take5' && (
        <ActionsPanel
          source={{ type: 'inspection', id: check.id, ref: check.kind === 'site' ? `${check.checklist_name} ${formatDate(check.done_at)}` : `Pre-start ${check.unit_no} ${formatDate(check.done_at)}` }}
          access={user.access}
          me={user.id}
          unitNo={check.unit_no}
          machineId={check.machine_id}
          actions={actions}
          onChanged={load}
        />
      )}
    </div>
  );
}
