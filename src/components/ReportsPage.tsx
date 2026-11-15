import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WhsUser } from '../services/auth.ts';
import { isOfficerAccess } from '../utils/access.ts';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { loadReportData, listHours, listHoursLog, listSitesWithCode, saveHours, toSaveLines, type HoursLogLine, type HoursRecord, type SiteWithCode } from '../services/reports.ts';
import { monthLabel, monthShort, monthSummary, monthlySeries, monthsEnding, missingHours, ymNow, type ReportData } from '../utils/reports.ts';
import { buildPreview, guessColumns, parseCsv, type ColumnGuess, type ImportPreview, type ParsedCsv } from '../utils/payroll.ts';
import { downloadXlsx, type Sheet } from '../utils/xlsx.ts';
import { AuditPack } from './AuditPack.tsx';
import { askConfirm } from './ConfirmHost.tsx';
import { ErrorNote, inputClass } from './Form.tsx';
import { Pill } from './Pill.tsx';

type Tab = 'summary' | 'trends' | 'hours' | 'pack';
const btn = 'min-h-10 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold cursor-pointer disabled:opacity-60';
const primary = 'min-h-10 px-4 rounded-lg border-0 bg-finlay hover:bg-finlay-dark text-white text-sm font-bold cursor-pointer disabled:opacity-60';
const th = 'px-2 py-2.5 font-semibold border-b border-[#EEEBE6] text-left';
const td = 'px-2 py-2.5 border-b border-line-soft';
const card = 'bg-white border border-line rounded-xl p-4';
const TYPE_LABEL: Record<string, string> = { injury: 'Injuries', near_miss: 'Near misses', damage: 'Damage', spill: 'Spills' };
const fmt = (n: number | null, dp = 1) => (n === null ? '—' : n.toLocaleString('en-AU', { maximumFractionDigits: dp }));

function Tile({ label, value, sub, tone = 'grey' }: { label: string; value: string | number; sub?: string; tone?: 'grey' | 'red' | 'amber' | 'green' }) {
  const c = { grey: 'bg-white border-line', red: 'bg-[#FBE3E4] border-[#F1C0C2]', amber: 'bg-[#FFF3D6] border-[#F0DDA6]', green: 'bg-[#E3F3E6] border-[#BFE0C5]' }[tone];
  return <div className={`rounded-xl border p-3.5 ${c}`}><div className="text-xs font-semibold text-muted">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div>{sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}</div>;
}

/** Reports: the monthly WHS summary, trends and injury rates, hours worked, and the audit pack. Office roles only. */
export function ReportsPage({ user }: { user: WhsUser }) {
  const officer = isOfficerAccess(user.access);
  const { site, sites } = useSiteScope();
  const [tab, setTab] = useState<Tab>('summary');
  const [ym, setYm] = useState(ymNow());
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await loadReportData(officer);
    if (r.error) setError(r.error); else { setError(null); setData(r.data!); }
  }, [officer]);
  useEffect(() => { void load(); }, [load]);

  const tabCls = (on: boolean) => `min-h-11 px-4 text-[15px] font-semibold cursor-pointer border-0 bg-transparent border-b-[3px] ${on ? 'text-finlay border-b-finlay' : 'text-muted border-b-transparent hover:text-ink'}`;
  const siteLabel = site?.name ?? 'All sites';

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Reports" className="flex flex-wrap gap-2 border-b border-line print:hidden">
        {([['summary', 'Monthly summary'], ['trends', 'Trends and rates'], ['hours', 'Hours'], ['pack', 'Audit pack']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={tabCls(tab === id)}>{label}</button>
        ))}
      </div>
      <ErrorNote message={error} />
      {tab === 'pack' ? <AuditPack user={user} officer={officer} />
        : tab === 'hours' ? <HoursTab user={user} officer={officer} ym={ym} onChanged={load} />
        : !data ? <p className="text-muted">Loading…</p>
        : tab === 'summary' ? <SummaryTab data={data} ym={ym} setYm={setYm} site={site} siteLabel={siteLabel} officer={officer} sites={sites} />
        : <TrendsTab data={data} ym={ym} setYm={setYm} site={site} siteLabel={siteLabel} />}
    </div>
  );
}

function MonthPicker({ ym, setYm }: { ym: string; setYm: (v: string) => void }) {
  return <label className="flex items-center gap-2 text-sm text-muted print:hidden">Month <input type="month" value={ym} max={ymNow()} onChange={e => e.target.value && setYm(e.target.value)} className={`${inputClass} !min-h-10 !w-auto`} /></label>;
}

function SummaryTab({ data, ym, setYm, site, siteLabel, officer, sites }: { data: ReportData; ym: string; setYm: (v: string) => void; site: ReturnType<typeof useSiteScope>['site']; siteLabel: string; officer: boolean; sites: { id: string }[] }) {
  const s = useMemo(() => monthSummary(data, ym, site), [data, ym, site]);
  const prev = useMemo(() => monthSummary(data, monthsEnding(ym, 2)[0], site), [data, ym, site]);
  const missing = missingHours(data.hours, site ? [site.id] : sites.map(x => x.id), ym);
  const lt = s.injury.lostTimeKnown ? s.injury.lostTime : null;
  const exportXlsx = () => downloadXlsx(`WHS summary ${ym}${site ? ` ${site.name}` : ''}.xlsx`, [{
    name: 'Summary', columns: ['Measure', monthLabel(ym), monthLabel(monthsEnding(ym, 2)[0])],
    rows: [
      ['Site', siteLabel, siteLabel], ['Incidents', s.incidents, prev.incidents], ['Injuries', s.injury.injuries, prev.injury.injuries],
      ['Lost time injuries', lt, prev.injury.lostTimeKnown ? prev.injury.lostTime : null], ['Days lost', s.injury.lostTimeKnown ? s.injury.lostDays : null, null],
      ['Notifiable incidents', s.notifiable, prev.notifiable], ['Hours worked', s.hours, prev.hours],
      ['LTIFR (12 months, per million hours)', s.ltifr12, prev.ltifr12], ['TRIFR (12 months, per million hours)', s.trifr12, prev.trifr12],
      ['Hazards reported', s.hazardsReported, prev.hazardsReported], ['Hazards closed', s.hazardsClosed, prev.hazardsClosed],
      ['Actions opened', s.actionsOpened, prev.actionsOpened], ['Actions closed', s.actionsClosed, prev.actionsClosed],
      ['Actions open now', s.actionsOpenNow, null], ['Actions overdue now', s.actionsOverdue, null],
      ['Pre-starts', s.prestarts, prev.prestarts], ['Take 5s', s.take5s, prev.take5s], ['Site inspections', s.siteInspections, prev.siteInspections],
    ],
  }]);
  const row = (label: string, v: string | number, p: string | number) => <tr><td className={td}>{label}</td><td className={`${td} font-semibold`}>{v}</td><td className={`${td} text-muted`}>{p}</td></tr>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <MonthPicker ym={ym} setYm={setYm} />
        <span className="text-sm text-muted">{siteLabel} (change the site at the top of the screen)</span>
        <div className="ml-auto flex gap-2"><button type="button" className={btn} onClick={exportXlsx}>Download Excel</button><button type="button" className={primary} onClick={() => window.print()}>Print or save as PDF</button></div>
      </div>
      <div>
        <h1 className="m-0 text-2xl font-bold">WHS summary: {monthLabel(ym)}</h1>
        <div className="text-sm text-muted">Finlay Screening & Crushing Systems · {siteLabel}</div>
      </div>
      {missing.length > 0 && <div className="rounded-xl border border-[#F0DDA6] bg-[#FFF3D6] p-3 text-sm print:hidden">Hours worked are missing for {missing.length === 1 && site ? site.name : `${missing.length} site${missing.length > 1 ? 's' : ''}`} in {monthLabel(ym)}, so the injury rates may be understated. Add them on the Hours tab.</div>}
      {!officer && <div className="rounded-xl border border-line bg-white p-3 text-sm text-muted print:hidden">Lost time injuries and injury rates come from workers compensation claims, which only the WHS officer and admins can see, so they show “—” here.</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Incidents" value={s.incidents} sub={`${prev.incidents} last month`} />
        <Tile label="Injuries" value={s.injury.injuries} sub={`${s.injury.firstAid} first aid · ${s.injury.medical} doctor or hospital`} tone={s.injury.injuries ? 'amber' : 'grey'} />
        <Tile label="Lost time injuries" value={lt ?? '—'} sub={lt !== null ? `${s.injury.lostDays} days lost` : undefined} tone={lt ? 'red' : 'grey'} />
        <Tile label="Notifiable to WHSQ" value={s.notifiable} tone={s.notifiable ? 'red' : 'grey'} />
        <Tile label="Hours worked" value={fmt(s.hours, 0)} sub={`${fmt(s.hours12, 0)} in 12 months`} />
        <Tile label="LTIFR (12 months)" value={fmt(s.ltifr12)} sub="per million hours" />
        <Tile label="TRIFR (12 months)" value={fmt(s.trifr12)} sub="per million hours" />
        <Tile label="Actions overdue now" value={s.actionsOverdue} tone={s.actionsOverdue ? 'red' : 'green'} sub={`${s.actionsOpenNow} open`} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <section className={card}>
          <h2 className="m-0 mb-2 text-base font-semibold">Incidents</h2>
          <table className="w-full border-collapse text-sm"><thead><tr><th className={th}></th><th className={th}>{monthShort(ym)}</th><th className={th}>Last month</th></tr></thead><tbody>
            {Object.keys(TYPE_LABEL).map(t => row(TYPE_LABEL[t], s.byType[t] ?? 0, prev.byType[t] ?? 0))}
            {row('Investigations closed', s.investigationsClosed, prev.investigationsClosed)}
            {row('…of those, on time', s.investigationsOnTime, prev.investigationsOnTime)}
          </tbody></table>
        </section>
        <section className={card}>
          <h2 className="m-0 mb-2 text-base font-semibold">Hazards, actions and checks</h2>
          <table className="w-full border-collapse text-sm"><thead><tr><th className={th}></th><th className={th}>{monthShort(ym)}</th><th className={th}>Last month</th></tr></thead><tbody>
            {row('Hazards reported', s.hazardsReported, prev.hazardsReported)}
            {row('Hazards closed', s.hazardsClosed, prev.hazardsClosed)}
            {row('Actions opened', s.actionsOpened, prev.actionsOpened)}
            {row('Actions closed', s.actionsClosed, prev.actionsClosed)}
            {row('Average days to close an action', s.avgDaysToClose ?? '—', prev.avgDaysToClose ?? '—')}
            {row('Pre-starts', s.prestarts, prev.prestarts)}
            {row('Take 5s', s.take5s, prev.take5s)}
            {row('Site inspections', s.siteInspections, prev.siteInspections)}
          </tbody></table>
        </section>
      </div>
      <p className="m-0 text-xs text-muted">Lost time injury: an injury with at least one full day or shift off work, from the workers compensation claim. TRIFR also counts injuries treated by a doctor or hospital. Rates are per 1,000,000 hours worked, over the 12 months to the end of {monthLabel(ym)}.</p>
    </div>
  );
}

function Bars({ title, values, labels, tone = '#C8102E' }: { title: string; values: number[]; labels: string[]; tone?: string }) {
  const max = Math.max(1, ...values);
  return (
    <section className={card}>
      <h2 className="m-0 mb-3 text-base font-semibold">{title}</h2>
      <div className="flex items-end gap-1.5 h-36" role="img" aria-label={`${title}: ${values.map((v, i) => `${labels[i]} ${v}`).join(', ')}`}>
        {values.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
            <span className="text-[11px] text-muted">{v || ''}</span>
            <div style={{ height: `${(v / max) * 100}%`, background: tone, minHeight: v ? 3 : 0 }} className="w-full rounded-t" />
            <span className="mt-1 text-[11px] text-muted">{labels[i]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TrendsTab({ data, ym, setYm, site, siteLabel }: { data: ReportData; ym: string; setYm: (v: string) => void; site: ReturnType<typeof useSiteScope>['site']; siteLabel: string }) {
  const series = useMemo(() => monthlySeries(data, ym, 12, site), [data, ym, site]);
  const labels = series.map(p => monthShort(p.ym));
  const exportXlsx = () => downloadXlsx(`WHS trends to ${ym}.xlsx`, [{ name: 'Trends', columns: ['Month', 'Incidents', 'Injuries', 'Lost time injuries', 'Hours', 'LTIFR 12m', 'TRIFR 12m'], rows: series.map(p => [monthLabel(p.ym), p.incidents, p.injuries, data.claims ? p.lostTime : null, p.hours, p.ltifr12, p.trifr12]) }]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <MonthPicker ym={ym} setYm={setYm} /><span className="text-sm text-muted">12 months to {monthLabel(ym)} · {siteLabel}</span>
        <div className="ml-auto flex gap-2"><button type="button" className={btn} onClick={exportXlsx}>Download Excel</button><button type="button" className={primary} onClick={() => window.print()}>Print or save as PDF</button></div>
      </div>
      <h1 className="m-0 text-2xl font-bold hidden print:block">WHS trends to {monthLabel(ym)} · {siteLabel}</h1>
      {!data.claims && <div className="rounded-xl border border-line bg-white p-3 text-sm text-muted">Lost time and injury rates need workers compensation claims, which only the WHS officer and admins can see.</div>}
      <div className="grid md:grid-cols-2 gap-4">
        <Bars title="Incidents each month" values={series.map(p => p.incidents)} labels={labels} />
        <Bars title="Injuries each month" values={series.map(p => p.injuries)} labels={labels} tone="#B45309" />
        {data.claims && <Bars title="Lost time injuries each month" values={series.map(p => p.lostTime)} labels={labels} tone="#7F1D1D" />}
        <Bars title="Hours worked each month" values={series.map(p => Math.round(p.hours))} labels={labels} tone="#4B5563" />
      </div>
      <section className={`${card} overflow-x-auto`}>
        <h2 className="m-0 mb-2 text-base font-semibold">Rolling 12 month injury rates</h2>
        <table className="w-full border-collapse text-sm"><thead><tr><th className={th}>Month</th><th className={th}>LTIFR</th><th className={th}>TRIFR</th><th className={th}>Hours (month)</th></tr></thead><tbody>
          {series.map(p => <tr key={p.ym}><td className={td}>{monthLabel(p.ym)}</td><td className={td}>{p.hasHours ? fmt(p.ltifr12) : <span className="text-muted">no hours</span>}</td><td className={td}>{p.hasHours ? fmt(p.trifr12) : <span className="text-muted">no hours</span>}</td><td className={td}>{fmt(p.hours, 0)}</td></tr>)}
        </tbody></table>
        <p className="m-0 mt-2 text-xs text-muted">Per million hours worked, over the 12 months to the end of each month. A month with no hours shows no rate rather than a wrong one.</p>
      </section>
    </div>
  );
}

function HoursTab({ user, officer, ym, onChanged }: { user: WhsUser; officer: boolean; ym: string; onChanged: () => void | Promise<void> }) {
  const [hours, setHours] = useState<HoursRecord[] | null>(null);
  const [sites, setSites] = useState<SiteWithCode[]>([]);
  const [log, setLog] = useState<HoursLogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const [h, s, l] = await Promise.all([listHours(), listSitesWithCode(), listHoursLog(50)]);
    if (h.error) setError(h.error); else { setError(null); setHours(h.data!); }
    setSites(s); setLog(l.data ?? []);
    await onChanged();
  }, [onChanged]);
  useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const months = monthsEnding(ym, 6);
  const get = (sid: string, m: string) => hours?.find(h => h.site_id === sid && h.month.slice(0, 7) === m);

  const save = async (sid: string, m: string, raw: string) => {
    const cur = get(sid, m);
    const next = raw.trim() === '' ? null : Number(raw.replace(/,/g, ''));
    if (next === null || !Number.isFinite(next) || next < 0) return;
    if (cur && Math.abs(Number(cur.hours) - next) < 0.005) return;
    if (cur && !(await askConfirm({ title: 'Change saved hours?', body: `${sites.find(s => s.id === sid)?.name} ${monthLabel(m)}: ${Number(cur.hours).toLocaleString('en-AU')} will become ${next.toLocaleString('en-AU')}. The change is logged.`, confirmLabel: 'Change' }))) { await reload(); return; }
    const r = await saveHours([{ site_id: sid, month: m, hours: next }], 'typed', user.name);
    if (r.error) setError(r.error); else { setNotice(null); await reload(); }
  };

  return (
    <div className="flex flex-col gap-4">
      <ErrorNote message={error} />
      {notice && <div className="rounded-xl border border-[#BFE0C5] bg-[#E3F3E6] p-3 text-sm">{notice}</div>}
      <section className={`${card} overflow-x-auto`}>
        <h2 className="m-0 mb-1 text-base font-semibold">Hours worked</h2>
        <p className="m-0 mb-3 text-sm text-muted">Hours come from payroll. Import payroll’s file below, or type a month’s hours in. {officer ? 'Every change is logged.' : 'Only the WHS officer and admins can change hours.'}</p>
        {!hours ? <p className="text-muted">Loading…</p> : (
          <table className="w-full border-collapse text-sm"><thead><tr><th className={th}>Site</th>{months.map(m => <th key={m} className={th}>{monthShort(m)} {m.slice(2, 4)}</th>)}</tr></thead><tbody>
            {sites.map(s => <tr key={s.id}><td className={`${td} font-semibold`}>{s.name}</td>{months.map(m => {
              const h = get(s.id, m);
              return <td key={m} className={td}>{officer
                ? <input aria-label={`${s.name} ${monthLabel(m)} hours`} inputMode="decimal" defaultValue={h ? String(h.hours) : ''} key={`${h?.hours ?? ''}`} onBlur={e => void save(s.id, m, e.target.value)} className={`${inputClass} !min-h-9 !w-24 ${h ? '' : 'bg-[#FFF3D6]'}`} />
                : h ? Number(h.hours).toLocaleString('en-AU') : <span className="text-muted">—</span>}</td>;
            })}</tr>)}
          </tbody></table>
        )}
      </section>
      {officer && hours && <PayrollImport user={user} sites={sites} existing={hours} onDone={async n => { setNotice(`Saved ${n} month${n === 1 ? '' : 's'} of hours.`); await reload(); }} />}
      {log.length > 0 && (
        <section className={`${card} overflow-x-auto`}>
          <h2 className="m-0 mb-2 text-base font-semibold">Recent changes</h2>
          <table className="w-full border-collapse text-sm"><thead><tr><th className={th}>When</th><th className={th}>Site</th><th className={th}>Month</th><th className={th}>Was</th><th className={th}>Now</th><th className={th}>By</th></tr></thead><tbody>
            {log.map(l => <tr key={l.id}><td className={td}>{new Date(l.occurred_at).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', dateStyle: 'medium', timeStyle: 'short' })}</td><td className={td}>{sites.find(s => s.id === l.site_id)?.name ?? l.site_id}</td><td className={td}>{monthLabel(l.month.slice(0, 7))}</td><td className={td}>{l.old_hours === null ? '—' : Number(l.old_hours).toLocaleString('en-AU')}</td><td className={td}>{Number(l.new_hours).toLocaleString('en-AU')}</td><td className={td}>{l.actor_name} <Pill tone={l.source === 'payroll' ? 'blue' : 'grey'}>{l.source}</Pill></td></tr>)}
          </tbody></table>
        </section>
      )}
    </div>
  );
}

function PayrollImport({ user, sites, existing, onDone }: { user: WhsUser; sites: SiteWithCode[]; existing: HoursRecord[]; onDone: (n: number) => void | Promise<void> }) {
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [cols, setCols] = useState<ColumnGuess>({ site: -1, date: -1, hours: -1 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState('');
  const preview: ImportPreview | null = useMemo(() => (parsed && cols.site >= 0 && cols.date >= 0 && cols.hours >= 0 ? buildPreview(parsed, cols, sites, existing.map(e => ({ site_id: e.site_id, month: e.month, hours: Number(e.hours) }))) : null), [parsed, cols, sites, existing]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError(null); setFile(f.name);
    if (/\.xlsx?$/i.test(f.name)) { setParsed(null); setError('Save the payroll file as CSV first (in Excel: File, Save As, CSV), then choose it here.'); return; }
    const p = parseCsv(await f.text());
    if (!p.headers.length || !p.rows.length) { setParsed(null); setError('That file looks empty.'); return; }
    setParsed(p); setCols(guessColumns(p.headers));
  };
  const confirm = async () => {
    if (!preview?.lines.length) return;
    if (preview.replaces.length && !(await askConfirm({ title: `Replace ${preview.replaces.length} saved figure${preview.replaces.length > 1 ? 's' : ''}?`, body: 'Some months already have different hours saved. Importing will replace them. Each change is logged.', confirmLabel: 'Replace and save' }))) return;
    setBusy(true);
    const r = await saveHours(toSaveLines(preview.lines), 'payroll', user.name);
    setBusy(false);
    if (r.error) setError(r.error); else { setParsed(null); setFile(''); await onDone(r.data ?? 0); }
  };
  const sel = (label: string, key: keyof ColumnGuess) => (
    <label className="flex flex-col gap-1 text-xs font-semibold text-muted">{label}
      <select className={`${inputClass} !min-h-10`} value={cols[key]} onChange={e => setCols({ ...cols, [key]: Number(e.target.value) })}>
        <option value={-1}>Choose…</option>{parsed!.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
      </select>
    </label>
  );
  return (
    <section className={card}>
      <h2 className="m-0 mb-1 text-base font-semibold">Import from payroll</h2>
      <p className="m-0 mb-3 text-sm text-muted">Choose payroll’s hours file saved as CSV. You see a preview first and nothing is saved until you confirm.</p>
      <input type="file" accept=".csv,text/csv,.txt" onChange={e => void pick(e.target.files?.[0])} aria-label="Payroll CSV file" className="text-sm" />
      <ErrorNote message={error} />
      {parsed && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="text-sm text-muted">{file}: {parsed.rows.length} rows. Check the columns are right:</div>
          <div className="grid sm:grid-cols-3 gap-3">{sel('Site column', 'site')}{sel('Date column', 'date')}{sel('Hours column', 'hours')}</div>
          {preview && (
            <>
              <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr><th className={th}>Site</th><th className={th}>Month</th><th className={th}>Hours</th></tr></thead><tbody>
                {preview.lines.map(l => <tr key={`${l.site.id}${l.month}`}><td className={td}>{l.site.name}</td><td className={td}>{monthLabel(l.month)}</td><td className={td}>{l.hours.toLocaleString('en-AU')}</td></tr>)}
              </tbody></table></div>
              {preview.unknownSites.length > 0 && <div className="rounded-lg border border-[#F0DDA6] bg-[#FFF3D6] p-3 text-sm"><b>Not matched to a site, left out:</b> {preview.unknownSites.map(u => `${u.name} (${u.rows} rows)`).join(', ')}. Make the payroll name match a site name or code, or add it as another name for the site under Sites.</div>}
              {preview.badRows.length > 0 && <div className="rounded-lg border border-[#F0DDA6] bg-[#FFF3D6] p-3 text-sm"><b>Rows skipped:</b> {preview.badRows.slice(0, 5).map(b => `row ${b.row}: ${b.why}`).join('; ')}{preview.badRows.length > 5 ? ` and ${preview.badRows.length - 5} more` : ''}.</div>}
              {preview.replaces.length > 0 && <div className="rounded-lg border border-[#F0DDA6] bg-[#FFF3D6] p-3 text-sm"><b>Will replace saved hours:</b> {preview.replaces.map(r => `${r.site.name} ${monthShort(r.month)} (${r.old.toLocaleString('en-AU')} to ${r.next.toLocaleString('en-AU')})`).join(', ')}.</div>}
              {preview.outliers.length > 0 && <div className="rounded-lg border border-[#F0DDA6] bg-[#FFF3D6] p-3 text-sm"><b>Look odd:</b> {preview.outliers.map(o => `${o.site.name} ${monthShort(o.month)} is ${o.hours.toLocaleString('en-AU')}, usually about ${o.typical.toLocaleString('en-AU')}`).join('; ')}.</div>}
              {preview.gaps.length > 0 && <div className="rounded-lg border border-[#F0DDA6] bg-[#FFF3D6] p-3 text-sm"><b>No hours in the file for:</b> {preview.gaps.map(g => g.site.name).join(', ')} ({monthLabel(preview.gaps[0].month)}).</div>}
              <div><button type="button" className={primary} disabled={busy || !preview.lines.length} onClick={() => void confirm()}>{busy ? 'Saving…' : `Save ${preview.lines.length} month${preview.lines.length === 1 ? '' : 's'} of hours`}</button></div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export type { Sheet };
