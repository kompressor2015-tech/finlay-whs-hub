import { useState } from 'react';
import type { HomeCharts as Charts } from '../utils/homeCharts.ts';
import { hrefFor } from '../hooks/useRoute.ts';

const card = 'bg-white border border-line rounded-xl p-4.5';

/** Health of the WHS system at a glance: trends, action status, and the chemical register against its targets. */
export function HomeCharts({ charts, inspections }: { charts: Charts; inspections?: { ok: number; total: number } }) {
  return (
    <section aria-label="How things are going" className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-3">
      <MonthlyChart months={charts.months} />
      <ActionsDonut split={charts.actions} />
      {inspections && <InspectionsDial ok={inspections.ok} total={inspections.total} />}
      <HealthBars health={charts.health} />
    </section>
  );
}

function MonthlyChart({ months }: { months: Charts['months'] }) {
  const [hot, setHot] = useState<string | null>(null);
  const max = Math.max(1, ...months.map(m => Math.max(m.hazards, m.incidents)));
  const total = months.reduce((n, m) => n + m.hazards + m.incidents, 0);
  const shown = months.find(m => m.key === hot);
  return (
    <div className={card}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-[15px] font-semibold">Reports, last 6 months</h2>
        <div className="flex gap-3 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-finlay" aria-hidden="true" /> Hazards</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ink" aria-hidden="true" /> Incidents</span>
        </div>
      </div>
      {total === 0 ? (
        <p className="m-0 mt-6 mb-4 text-sm text-muted">Nothing reported in the last 6 months.</p>
      ) : (
        <>
          <div className="flex items-end gap-3 h-[132px] mt-4 border-b border-line">
            {months.map(m => (
              <a
                key={m.key}
                href={hrefFor({ name: 'module', id: 'hazards' })}
                onMouseEnter={() => setHot(m.key)}
                onMouseLeave={() => setHot(null)}
                onFocus={() => setHot(m.key)}
                onBlur={() => setHot(null)}
                aria-label={`${m.label}: ${m.hazards} hazards, ${m.incidents} incidents`}
                className={`flex-1 h-full flex items-end justify-center gap-1 no-underline rounded-t ${hot === m.key ? 'bg-[#FAF8F6]' : ''}`}
              >
                <span className="w-[38%] max-w-[22px] bg-finlay rounded-t" style={{ height: `${(m.hazards / max) * 100}%`, minHeight: m.hazards ? 3 : 0 }} />
                <span className="w-[38%] max-w-[22px] bg-ink rounded-t" style={{ height: `${(m.incidents / max) * 100}%`, minHeight: m.incidents ? 3 : 0 }} />
              </a>
            ))}
          </div>
          <div className="flex gap-3 mt-1.5">
            {months.map(m => <span key={m.key} className={`flex-1 text-center text-xs ${hot === m.key ? 'font-semibold text-ink' : 'text-muted'}`}>{m.label}</span>)}
          </div>
          <p className="m-0 mt-2 text-[13px] text-muted min-h-[20px]" aria-live="polite">
            {shown ? `${shown.label}: ${shown.hazards} hazard${shown.hazards === 1 ? '' : 's'}, ${shown.incidents} incident${shown.incidents === 1 ? '' : 's'}` : `${total} reported in 6 months. Point at a month for the numbers.`}
          </p>
        </>
      )}
    </div>
  );
}

function ActionsDonut({ split }: { split: Charts['actions'] }) {
  const total = split.done + split.open + split.dueSoon + split.overdue;
  const parts = [
    { key: 'done', label: 'Done', n: split.done, color: '#1F6B2E' },
    { key: 'open', label: 'Open', n: split.open, color: '#9AA0A6' },
    { key: 'soon', label: 'Due soon', n: split.dueSoon, color: '#E0A100' },
    { key: 'over', label: 'Overdue', n: split.overdue, color: '#B9151C' },
  ];
  let at = 0;
  const stops = parts.filter(p => p.n > 0).map(p => {
    const from = (at / total) * 100;
    at += p.n;
    return `${p.color} ${from}% ${(at / total) * 100}%`;
  });
  return (
    <div className={card}>
      <h2 className="m-0 text-[15px] font-semibold">Actions by status</h2>
      {total === 0 ? (
        <p className="m-0 mt-6 mb-4 text-sm text-muted">No actions yet.</p>
      ) : (
        <a href={hrefFor({ name: 'module', id: 'actions' })} className="no-underline text-ink flex items-center gap-5 mt-4">
          <span className="relative w-[104px] h-[104px] rounded-full flex-none" style={{ background: `conic-gradient(${stops.join(',')})` }} role="img" aria-label={parts.map(p => `${p.label} ${p.n}`).join(', ')}>
            <span className="absolute inset-[22px] rounded-full bg-white flex items-center justify-center text-lg font-bold">{total}</span>
          </span>
          <span className="flex flex-col gap-1.5 text-[13px]">
            {parts.map(p => (
              <span key={p.key} className={`flex items-center gap-2 ${p.key === 'over' && p.n > 0 ? 'font-semibold text-finlay-dark' : ''}`}>
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} aria-hidden="true" /> {p.label} {p.n}
              </span>
            ))}
          </span>
        </a>
      )}
    </div>
  );
}

function HealthBars({ health }: { health: Charts['health'] }) {
  return (
    <div className={card}>
      <h2 className="m-0 text-[15px] font-semibold">Chemical register health</h2>
      {health.length === 0 ? (
        <p className="m-0 mt-6 mb-4 text-sm text-muted">No chemicals in the register yet.</p>
      ) : (
        <div className="flex flex-col gap-4 mt-4">
          {health.map(h => {
            const share = h.total ? h.good / h.total : 0;
            const met = share >= h.target;
            return (
              <a key={h.id} href={h.href} className="no-underline text-ink block group">
                <span className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span>{h.label}</span>
                  <span className={`font-semibold ${met ? 'text-[#1F6B2E]' : 'text-ink'}`}>{h.good} of {h.total}</span>
                </span>
                <span className="relative block h-2.5 rounded-full bg-[#ECE8E2] mt-1.5 overflow-hidden group-hover:bg-[#E2DDD5]">
                  <span className={`block h-full rounded-full ${met ? 'bg-[#1F6B2E]' : share >= 0.6 ? 'bg-[#E0A100]' : 'bg-finlay'}`} style={{ width: `${share * 100}%` }} />
                </span>
                <span className="block text-xs text-muted mt-1">Target {Math.round(h.target * 100)}% · now {Math.round(share * 100)}%</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InspectionsDial({ ok, total }: { ok: number; total: number }) {
  const share = total ? ok / total : 0;
  return (
    <div className={card}>
      <h2 className="m-0 text-[15px] font-semibold">Site inspections up to date</h2>
      {total === 0 ? (
        <p className="m-0 mt-6 mb-4 text-sm text-muted">No scheduled inspections yet.</p>
      ) : (
        <a href={hrefFor({ name: 'module', id: 'inspections' })} className="no-underline text-ink flex items-center gap-5 mt-4">
          <span className="relative w-[104px] h-[104px] rounded-full flex-none" style={{ background: `conic-gradient(${share >= 1 ? '#1F6B2E' : '#B9151C'} ${share * 100}%, #ECE8E2 0)` }} role="img" aria-label={`${ok} of ${total} up to date`}>
            <span className="absolute inset-[18px] rounded-full bg-white flex items-center justify-center text-lg font-bold">{Math.round(share * 100)}%</span>
          </span>
          <span className="text-[13px] text-muted leading-relaxed">{ok} of {total} not overdue. Target 100%.</span>
        </a>
      )}
    </div>
  );
}
