import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { getChecklist, saveChecklist } from '../services/checks.ts';
import type { WhsUser } from '../services/auth.ts';
import { hrefFor } from '../hooks/useRoute.ts';
import { formatWhen } from '../utils/dates.ts';
import { newItemId, type Checklist, type ChecklistItem, type ItemType } from '../utils/checks.ts';
import { ErrorNote, Field, inputClass } from './Form.tsx';

const TYPES: { id: ItemType; label: string }[] = [
  { id: 'pass_fail', label: 'Pass / Fail / N/A' },
  { id: 'yes_no', label: 'Yes / No' },
  { id: 'tick_list', label: 'Tick list' },
  { id: 'photo', label: 'Photos' },
  { id: 'text', label: 'Comment' },
];

const small = 'min-h-10 rounded-lg border border-[#D6D2CC] bg-white px-2.5 text-sm';

/** Lets the WHS officer change a checklist's questions. Saving makes a new version. */
export function ChecklistEditor({ id, user }: { id: string; user: WhsUser }) {
  const officer = user.access === 'admin' || user.access === 'whs_officer';
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [name, setName] = useState('');
  const [siteName, setSiteName] = useState('');
  const [freq, setFreq] = useState('');
  const [active, setActive] = useState(true);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getChecklist(id).then(res => {
      if (res.error || !res.data) return setError(res.error ?? 'Not found');
      const c = res.data;
      setChecklist(c);
      setName(c.name);
      setSiteName(c.site_name);
      setFreq(c.frequency_days ? String(c.frequency_days) : '');
      setActive(c.active);
      setItems(c.items);
    });
  }, [id]);

  if (!officer) return <ErrorNote message="Only an admin or the WHS officer can change checklists." />;
  if (!checklist) return error ? <ErrorNote message={error} /> : <p className="text-sm text-muted">Loading…</p>;

  const update = (i: number, patch: Partial<ChecklistItem>) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };
  const add = () => {
    const section = items[items.length - 1]?.section ?? (checklist.kind === 'prestart' ? 'Checks' : 'General');
    setItems([...items, { id: newItemId(items, `question ${items.length + 1}`), section, type: checklist.kind === 'prestart' ? 'pass_fail' : 'yes_no', text: '', bad: 'yes' }]);
  };

  async function save() {
    setError(null);
    setSaved(null);
    const clean = items.map(it => ({ ...it, text: it.text.trim() })).filter(it => it.text);
    if (!name.trim()) return setError('Give the checklist a name.');
    if (!clean.length) return setError('Add at least one question.');
    const badTick = clean.find(it => it.type === 'tick_list' && !(it.options ?? []).filter(Boolean).length);
    if (badTick) return setError(`"${badTick.text}" needs at least one thing to tick.`);
    setBusy(true);
    const res = await saveChecklist(id, {
      name: name.trim(),
      site_name: siteName.trim(),
      frequency_days: freq ? Math.max(1, Number(freq)) : null,
      active,
      items: clean.map(it => ({ ...it, options: it.type === 'tick_list' ? (it.options ?? []).map(o => o.trim()).filter(Boolean) : undefined })),
    });
    setBusy(false);
    if (res.error || !res.data) return setError(res.error ?? 'Could not save.');
    setChecklist(res.data);
    setItems(res.data.items);
    setSaved(`Saved as version ${res.data.version}.`);
  }

  return (
    <div className="flex flex-col gap-4.5 max-w-[900px]">
      <a href={hrefFor({ name: 'module', id: 'inspections' })} className="text-sm no-underline text-muted">← Inspections &amp; checks</a>
      <div>
        <h1 className="m-0 text-2xl font-bold">Edit checklist</h1>
        <p className="mt-1.5 mb-0 text-sm text-muted">
          Version {checklist.version}{checklist.updated_by_name ? `, last changed ${formatWhen(checklist.updated_at)} by ${checklist.updated_by_name}` : ''}. Saving makes a new version; checks already done keep their questions.
        </p>
      </div>

      <div className="bg-white border border-line rounded-xl p-4.5 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Name" htmlFor="cl-name"><input id="cl-name" className={inputClass} value={name} onChange={e => setName(e.target.value)} /></Field>
        {checklist.kind === 'site' && (
          <>
            <Field label="Site" htmlFor="cl-site"><input id="cl-site" className={inputClass} value={siteName} onChange={e => setSiteName(e.target.value)} /></Field>
            <Field label="Every (days)" htmlFor="cl-freq" hint="Leave empty for no schedule"><input id="cl-freq" inputMode="numeric" className={inputClass} value={freq} onChange={e => setFreq(e.target.value.replace(/\D/g, ''))} /></Field>
          </>
        )}
        <label className="flex gap-2.5 items-center text-sm min-h-11 cursor-pointer">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="w-5 h-5" /> In use
        </label>
      </div>

      <div className="flex flex-col gap-3">
        {items.map((it, i) => (
          <div key={it.id} className="bg-white border border-line rounded-xl p-3.5 flex flex-col gap-2.5">
            <div className="flex flex-wrap gap-2 items-start">
              <span className="text-sm text-muted w-6 pt-2.5">{i + 1}.</span>
              <input aria-label={`Question ${i + 1}`} placeholder="Question" className={`${inputClass} flex-[1_1_320px]`} value={it.text} onChange={e => update(i, { text: e.target.value })} />
              <select aria-label="Answer type" className={small} value={it.type} onChange={e => update(i, { type: e.target.value as ItemType })}>
                {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <button type="button" aria-label="Move up" onClick={() => move(i, -1)} className={`${small} w-10 flex items-center justify-center cursor-pointer`}><ArrowUp className="w-4 h-4" aria-hidden="true" /></button>
              <button type="button" aria-label="Move down" onClick={() => move(i, 1)} className={`${small} w-10 flex items-center justify-center cursor-pointer`}><ArrowDown className="w-4 h-4" aria-hidden="true" /></button>
              <button type="button" aria-label="Remove question" onClick={() => setItems(items.filter((_, j) => j !== i))} className={`${small} w-10 flex items-center justify-center cursor-pointer text-finlay`}><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
            </div>
            <div className="flex flex-wrap gap-2 items-center pl-8 text-sm">
              <input aria-label="Section" placeholder="Section" className={`${small} w-56`} value={it.section} onChange={e => update(i, { section: e.target.value })} />
              <input aria-label="Help text" placeholder="Help text (optional)" className={`${small} flex-[1_1_200px]`} value={it.sub ?? ''} onChange={e => update(i, { sub: e.target.value || undefined })} />
              {it.type === 'pass_fail' && (
                <label className="flex gap-2 items-center min-h-10 cursor-pointer"><input type="checkbox" checked={!!it.critical} onChange={e => update(i, { critical: e.target.checked || undefined })} className="w-5 h-5" /> Critical (fail = do not operate)</label>
              )}
              {it.type === 'yes_no' && (
                <label className="flex gap-2 items-center min-h-10">Problem if
                  <select className={small} value={it.bad ?? 'yes'} onChange={e => update(i, { bad: e.target.value as 'yes' | 'no' })}><option value="yes">Yes</option><option value="no">No</option></select>
                </label>
              )}
              {it.type === 'photo' && (
                <label className="flex gap-2 items-center min-h-10">At least
                  <input inputMode="numeric" className={`${small} w-16`} value={it.min_photos ?? 1} onChange={e => update(i, { min_photos: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })} /> photo(s)
                </label>
              )}
            </div>
            {it.type === 'tick_list' && (
              <textarea aria-label="Things to tick, one per line" rows={3} placeholder="One thing to tick per line" className="ml-8 rounded-lg border border-[#D6D2CC] p-2.5 text-sm"
                value={(it.options ?? []).join('\n')} onChange={e => update(i, { options: e.target.value.split('\n') })} />
            )}
          </div>
        ))}
        <button type="button" onClick={add} className="self-start bg-transparent border-0 text-sm font-semibold text-finlay cursor-pointer min-h-11 p-0">+ Add a question</button>
      </div>

      <ErrorNote message={error} />
      {saved && <p role="status" className="m-0 text-sm text-[#1E6B3A] bg-[#E3F3E8] rounded-lg px-3 py-2.5">{saved}</p>}
      <button type="button" disabled={busy} onClick={save} className="self-start min-h-12 px-5 rounded-lg border-0 bg-finlay text-white font-semibold cursor-pointer disabled:opacity-60">
        {busy ? 'Saving…' : 'Save checklist'}
      </button>
    </div>
  );
}
