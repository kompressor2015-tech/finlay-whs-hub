import { useState } from 'react';
import { CONSEQUENCES, LEVELS, LIKELIHOODS, riskLevel, riskScore, type RiskLevel } from '../utils/risks.ts';
import { Pill } from './Pill.tsx';
import { RatingGrid } from './RatingGrid.tsx';

const BAND: Record<RiskLevel, string> = {
  low: 'bg-[#DDF0C8] text-[#2F5A10] border-[#B7DB8E]',
  medium: 'bg-[#FFF7B8] text-[#5E5200] border-[#E6D96A]',
  high: 'bg-[#FFD9A0] text-[#7A4000] border-[#EBB661]',
  extreme: 'bg-[#F9C6C6] text-[#8E1010] border-[#E79C9C]',
};

const MEANING: Record<RiskLevel, string> = {
  low: 'Carry on with the controls in place.',
  medium: 'Make sure the controls are in place and in use.',
  high: 'Add more controls, or get approval before starting.',
  extreme: 'Do not start until it is brought down or the manager approves.',
};

const choice = (on: boolean) => `text-left rounded-lg border px-3 py-2 cursor-pointer min-h-12 ${on ? 'border-ink bg-ink text-white' : 'border-[#D6D2CC] bg-white hover:bg-[#FAF8F6]'}`;

/**
 * A guided way to rate a risk: two plain questions (how likely, how bad), then the result in words.
 * It starts closed with a clear prompt, so nobody has to know what the grid is to use it. The Finlay matrix is still there under "Use the grid".
 */
export function GuidedRating({ label, question, likelihood, consequence, onChange }: {
  label: string;
  /** What this rating is about, in a sentence, e.g. "How risky is this step if nothing is done to control it?" */
  question: string;
  likelihood: number | null;
  consequence: number | null;
  onChange: (likelihood: number, consequence: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [grid, setGrid] = useState(false);
  // An answer to one question is held here until the other is answered, then both go to the parent.
  const [pendL, setPendL] = useState<number | null>(null);
  const [pendC, setPendC] = useState<number | null>(null);
  const l = pendL ?? likelihood;
  const c = pendC ?? consequence;
  const level = riskLevel(l, c);
  const commit = (a: number | null, b: number | null) => {
    if (a !== null && b !== null) { onChange(a, b); setPendL(null); setPendC(null); }
  };
  const setLikely = (n: number) => { setPendL(n); commit(n, c); };
  const setBad = (n: number) => { setPendC(n); commit(l, n); };

  return (
    <div className="rounded-xl border border-[#D6D2CC] bg-white flex flex-col">
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="flex items-center gap-3 text-left px-3.5 py-3 bg-transparent border-0 cursor-pointer min-h-14">
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold">{label}</span>
          <span className="block text-xs text-muted">{question}</span>
        </span>
        {level ? <Pill tone={LEVELS[level].tone}>{LEVELS[level].label} · {riskScore(l, c)}</Pill> : <span className="text-xs font-bold text-[#7A4B00] bg-[#FFF6DD] border border-[#E0A526] rounded-full px-2.5 py-1 whitespace-nowrap">Tap to rate</span>}
        <span aria-hidden className="text-muted">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-line-soft px-3.5 py-3.5 flex flex-col gap-4">
          <div>
            <div className="text-sm font-bold mb-0.5"><span className="inline-grid place-items-center w-5 h-5 rounded-full bg-ink text-white text-xs mr-1.5">1</span>How likely is it that someone gets hurt?</div>
            <div className="text-xs text-muted mb-2">Think about this step on this job.</div>
            <div className="grid gap-1.5" role="radiogroup" aria-label="How likely">
              {LIKELIHOODS.map(o => (
                <button key={o.n} type="button" role="radio" aria-checked={l === o.n} onClick={() => setLikely(o.n)} className={choice(l === o.n)}>
                  <span className="block text-sm font-semibold">{o.label}</span>
                  <span className={`block text-xs ${l === o.n ? 'text-white/80' : 'text-muted'}`}>{o.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-bold mb-0.5"><span className="inline-grid place-items-center w-5 h-5 rounded-full bg-ink text-white text-xs mr-1.5">2</span>If it did happen, how badly could they be hurt?</div>
            <div className="text-xs text-muted mb-2">Think about the worst realistic injury.</div>
            <div className="grid gap-1.5" role="radiogroup" aria-label="How badly hurt">
              {CONSEQUENCES.map(o => (
                <button key={o.n} type="button" role="radio" aria-checked={c === o.n} onClick={() => setBad(o.n)} className={choice(c === o.n)}>
                  <span className="block text-sm font-semibold">{o.label}</span>
                  <span className={`block text-xs ${c === o.n ? 'text-white/80' : 'text-muted'}`}>{o.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div role="status" className={`rounded-lg border px-3 py-2.5 text-sm ${level ? BAND[level] : 'bg-[#F4F2EE] border-[#E0DCD5] text-muted'}`}>
            {level ? <><b>{LEVELS[level].label} risk.</b> {MEANING[level]} <span className="opacity-80">(Score {riskScore(l, c)})</span></> : 'Answer both questions to see the risk level.'}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="min-h-10 px-4 rounded-lg border-0 bg-finlay hover:bg-finlay-dark text-white text-sm font-bold cursor-pointer disabled:opacity-60" disabled={!level} onClick={() => setOpen(false)}>Done</button>
            <button type="button" className="bg-transparent border-0 p-0 text-[13px] font-semibold text-finlay cursor-pointer underline" onClick={() => setGrid(g => !g)}>{grid ? 'Hide the grid' : 'Prefer the grid? Use the risk matrix'}</button>
          </div>
          {grid && <RatingGrid label={label} likelihood={l} consequence={c} onChange={(a, b) => { setPendL(null); setPendC(null); onChange(a, b); }} />}
        </div>
      )}
    </div>
  );
}
