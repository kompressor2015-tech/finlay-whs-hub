import { useEffect, useMemo } from 'react';
import { Camera, X } from 'lucide-react';
import { isProblem, sections, type ChecklistItem } from '../utils/checks.ts';

/** An answer while the form is being filled in: photos are still files on the phone. */
export interface DraftAnswer {
  v?: string | string[];
  note?: string;
  files?: File[];
}

export type DraftAnswers = Record<string, DraftAnswer>;

function Thumbs({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  const urls = useMemo(() => files.map(f => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach(u => URL.revokeObjectURL(u)), [urls]);
  return (
    <>
      {urls.map((src, i) => (
        <span key={src} className="relative w-16 h-16">
          <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover rounded-lg" />
          <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => onRemove(i)}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-ink text-white flex items-center justify-center border-0 cursor-pointer">
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}
    </>
  );
}

function AddPhoto({ id, onAdd, label = 'Add photo' }: { id: string; onAdd: (files: File[]) => void; label?: string }) {
  return (
    <>
      <label htmlFor={id} className="w-16 h-16 border border-dashed border-[#B8B2A9] rounded-lg bg-white cursor-pointer flex flex-col items-center justify-center text-[11px] text-muted gap-0.5">
        <Camera className="w-5 h-5" aria-hidden="true" />
        {label}
      </label>
      <input id={id} type="file" accept="image/*" capture="environment" multiple className="sr-only"
        onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) onAdd(f); e.target.value = ''; }} />
    </>
  );
}

const choice = (on: boolean, tone: 'green' | 'red' | 'grey') =>
  on
    ? tone === 'green'
      ? 'bg-[#E3F3E8] text-[#1E6B3A] border-2 border-[#1E6B3A]'
      : tone === 'red'
        ? 'bg-[#FBE3E4] text-[#8E0F15] border-2 border-finlay'
        : 'bg-[#EEEBE6] text-[#3F444B] border-2 border-[#3F444B]'
    : 'bg-white text-ink border border-[#D6D2CC]';

/** One question with big answer buttons. A problem asks what's wrong, with an optional photo. */
function Question({ item, answer, onChange }: { item: ChecklistItem; answer: DraftAnswer | undefined; onChange: (a: DraftAnswer) => void }) {
  const a = answer ?? {};
  const problem = isProblem(item, { v: a.v });
  const files = a.files ?? [];
  const set = (patch: Partial<DraftAnswer>) => onChange({ ...a, ...patch });

  const buttons =
    item.type === 'pass_fail'
      ? [{ v: 'pass', label: 'Pass', tone: 'green' as const }, { v: 'fail', label: 'Fail', tone: 'red' as const }, { v: 'na', label: 'N/A', tone: 'grey' as const }]
      : item.type === 'yes_no'
        ? [
            { v: 'yes', label: 'Yes', tone: item.bad === 'yes' ? ('red' as const) : ('green' as const) },
            { v: 'no', label: 'No', tone: item.bad === 'no' ? ('red' as const) : ('green' as const) },
          ]
        : [];

  return (
    <div className={`bg-white rounded-xl p-3 flex flex-col gap-2.5 ${problem ? 'border-2 border-finlay' : 'border border-line'}`}>
      <div className="text-[15px] font-semibold leading-snug">
        {item.text}
        {item.critical && (
          <span title="Critical: a fail means do not operate" className="inline-block ml-1.5 text-[11px] font-bold px-1.5 rounded-full bg-[#FBE3E4] text-[#8E0F15]">!</span>
        )}
        {item.sub && <span className="block font-normal text-[13px] text-muted mt-0.5">{item.sub}</span>}
        {item.type === 'photo' && <span className="block font-normal text-[13px] text-muted mt-0.5">At least {item.min_photos ?? 1} photo{(item.min_photos ?? 1) > 1 ? 's' : ''}</span>}
      </div>

      {buttons.length > 0 && (
        <div className={`grid gap-1.5 ${buttons.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {buttons.map(b => (
            <button key={b.v} type="button" aria-pressed={a.v === b.v} onClick={() => set({ v: b.v })}
              className={`min-h-[46px] rounded-[10px] text-sm font-bold cursor-pointer ${choice(a.v === b.v, b.tone)}`}>
              {b.label}
            </button>
          ))}
        </div>
      )}

      {item.type === 'tick_list' && (
        <div className="flex flex-col">
          {(item.options ?? []).map(opt => {
            const ticked = Array.isArray(a.v) && a.v.includes(opt);
            return (
              <label key={opt} className="flex gap-3 items-center min-h-11 border-t border-line-soft first:border-t-0 cursor-pointer text-sm">
                <input type="checkbox" checked={ticked} className="w-[22px] h-[22px] flex-none accent-[#1E6B3A]"
                  onChange={() => {
                    const cur = Array.isArray(a.v) ? a.v : [];
                    set({ v: ticked ? cur.filter(x => x !== opt) : [...cur, opt] });
                  }} />
                {opt}
              </label>
            );
          })}
          {!Array.isArray(a.v) && (
            <button type="button" onClick={() => set({ v: [] })} className="self-start mt-1 bg-transparent border-0 text-[13px] text-muted underline cursor-pointer min-h-10">
              None of these are OK
            </button>
          )}
        </div>
      )}

      {item.type === 'text' && (
        <textarea aria-label={item.text} rows={3} className="w-full rounded-[10px] border border-[#D6D2CC] p-3 text-[15px]" value={typeof a.v === 'string' ? a.v : ''} onChange={e => set({ v: e.target.value })} />
      )}

      {item.type === 'photo' && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Thumbs files={files} onRemove={i => set({ files: files.filter((_, j) => j !== i) })} />
          <AddPhoto id={`ph-${item.id}`} onAdd={f => set({ files: [...files, ...f].slice(0, 8) })} />
        </div>
      )}

      {problem && (
        <div className="flex gap-2 items-start flex-wrap pt-1">
          <input aria-label={`What's wrong: ${item.text}`} placeholder={item.type === 'pass_fail' ? "What's wrong? (needed)" : "What's wrong?"}
            className="flex-[1_1_180px] min-w-0 min-h-11 border border-[#D6D2CC] rounded-lg px-2.5 text-sm" value={a.note ?? ''} onChange={e => set({ note: e.target.value })} />
          <div className="flex gap-2 flex-wrap">
            <Thumbs files={files} onRemove={i => set({ files: files.filter((_, j) => j !== i) })} />
            <AddPhoto id={`pp-${item.id}`} onAdd={f => set({ files: [...files, ...f].slice(0, 4) })} label="Photo" />
          </div>
        </div>
      )}
    </div>
  );
}

export function ChecklistQuestions({ items, answers, onChange, showSections = true }: {
  items: ChecklistItem[];
  answers: DraftAnswers;
  onChange: (id: string, a: DraftAnswer) => void;
  showSections?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {sections(items).map(s => (
        <section key={s.name} className="flex flex-col gap-3">
          {showSections && <h2 className="m-0 text-base font-bold">{s.name}</h2>}
          {s.items.map(item => (
            <Question key={item.id} item={item} answer={answers[item.id]} onChange={a => onChange(item.id, a)} />
          ))}
        </section>
      ))}
    </div>
  );
}
