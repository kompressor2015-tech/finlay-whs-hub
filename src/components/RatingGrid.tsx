import { CONSEQUENCES, LEVELS, LIKELIHOODS, riskLevel, type RiskLevel } from '../utils/risks.ts';

const CELL: Record<RiskLevel, string> = {
  low: 'bg-[#E3F4E6] text-[#1F6B2E]',
  medium: 'bg-[#E3EEFB] text-[#1D4E89]',
  high: 'bg-[#FFF1D6] text-[#7A4B00]',
  extreme: 'bg-[#FDE8E8] text-[#9B1218]',
};

/** The 5 by 5 grid. Rows are likelihood (top: almost certain), columns are consequence (right: fatal). */
export function RatingGrid({ label, likelihood, consequence, onChange }: {
  label: string;
  likelihood: number | null;
  consequence: number | null;
  /** Leave out to show the grid read only */
  onChange?: (likelihood: number, consequence: number) => void;
}) {
  const level = riskLevel(likelihood, consequence);
  const l = LIKELIHOODS.find(x => x.n === likelihood);
  const c = CONSEQUENCES.find(x => x.n === consequence);
  return (
    <div>
      <div className="text-xs font-semibold text-muted mb-1">{label}</div>
      <div role="group" aria-label={label} className="grid grid-cols-5 gap-[3px] w-[190px]">
        {LIKELIHOODS.flatMap(row => CONSEQUENCES.map(col => {
          const lv = riskLevel(row.n, col.n) as RiskLevel;
          const on = row.n === likelihood && col.n === consequence;
          const cls = `h-8 rounded-[5px] text-[11px] font-bold ${CELL[lv]} ${on ? 'outline outline-[3px] outline-ink outline-offset-1' : ''}`;
          return onChange ? (
            <button key={`${row.n}-${col.n}`} type="button" aria-pressed={on} aria-label={`${row.label}, ${col.label}: ${LEVELS[lv].label}`} onClick={() => onChange(row.n, col.n)} className={`${cls} cursor-pointer border-0`}>{row.n * col.n}</button>
          ) : (
            <div key={`${row.n}-${col.n}`} className={`${cls} flex items-center justify-center`}>{row.n * col.n}</div>
          );
        }))}
      </div>
      <div className="mt-1.5 text-[13px]">
        {level ? <><b>{LEVELS[level].label}</b><span className="text-muted"> · {l?.label} × {c?.label}</span></> : <span className="text-muted">{onChange ? 'Tap a square' : 'Not rated'}</span>}
      </div>
    </div>
  );
}
