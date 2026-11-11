import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { WhsUser } from '../services/auth.ts';
import { useRegister } from '../hooks/useRegister.ts';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { hrefFor } from '../hooks/useRoute.ts';
import { ChemicalPage } from './ChemicalPage.tsx';
import { SidePanel, linkOpens, rowOpens, useListPanel } from './SidePanel.tsx';
import { isOfficeAccess } from '../utils/access.ts';
import { formatDay } from '../utils/dates.ts';
import { looseMatch } from '../utils/search.ts';
import { csvFor, downloadCsv } from '../utils/csv.ts';
import {
  SECTIONS, amountOf, classLabel, classTone, formatAmount, sdsPill, sdsState, segregation, siteTotals, stateRules, stocktakeDue, worstLine,
  type Chemical, type Stock,
} from '../utils/chemicals.ts';
import { ErrorNote } from './Form.tsx';
import { Pill } from './Pill.tsx';
import type { Tone } from '../utils/attention.ts';
import { classToConfirm } from '../utils/stocktakes.ts';

type Filter = 'all' | 'dg' | 'sds' | 'uncounted' | 'confirm';
const th = 'px-2 py-2.5 font-semibold border-b border-[#EEEBE6] text-left';
const td = 'px-2 py-2.5 border-b border-line-soft align-top';

/** The hazardous chemicals and DG register, by site. */
export function ChemicalsPage({ user }: { user: WhsUser }) {
  const office = isOfficeAccess(user.access);
  const reg = useRegister();
  const scope = useSiteScope();
  const siteId = scope.site?.id ?? 'all';
  const setSiteId = scope.setSiteId;
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('whs-chem-open') ?? '[]') as string[]; } catch { return []; }
  });
  const toggle = (section: string) => setOpen(prev => {
    const next = prev.includes(section) ? prev.filter(x => x !== section) : [...prev, section];
    try { localStorage.setItem('whs-chem-open', JSON.stringify(next)); } catch { /* per-viewer only */ }
    return next;
  });
  const [pairA, setPairA] = useState('');
  const [pairB, setPairB] = useState('');

  const site = reg.sites.find(s => s.id === siteId) ?? null;
  const siteStock = useMemo(() => (site ? reg.stock.filter(s => s.site_id === site.id) : reg.stock), [reg.stock, site]);
  const chemIds = useMemo(() => new Set(siteStock.map(s => s.chemical_id)), [siteStock]);
  const chemicals = reg.chemicals.filter(c => c.active && (siteId === 'all' || chemIds.has(c.id)));

  const shown = chemicals.filter(c => {
    if (filter === 'dg' && !c.dg_class && c.combustible !== 'C1') return false;
    if (filter === 'sds' && sdsState(reg.currentSdsOf(c.id)) === 'ok') return false;
    if (filter === 'confirm' && !classToConfirm(c)) return false;
    if (filter === 'uncounted' && !siteStock.some(s => s.chemical_id === c.id && amountOf(s) === null)) return false;
    const locs = siteStock.filter(s => s.chemical_id === c.id).map(s => s.location);
    return looseMatch(q, [c.name, c.manufacturer, c.un_number, c.dg_class ? `class ${c.dg_class}` : '', ...locs]);
  });

  const missing = chemicals.filter(c => sdsState(reg.currentSdsOf(c.id)) === 'missing').length;
  const old = chemicals.filter(c => sdsState(reg.currentSdsOf(c.id)) === 'expired').length;
  const soon = chemicals.filter(c => sdsState(reg.currentSdsOf(c.id)) === 'due_soon').length;
  const toConfirm = chemicals.filter(classToConfirm).length;
  const worst = site ? worstLine(siteTotals(site.state, siteStock, reg.chemById)) : null;
  const take = site ? stocktakeDue(site, siteStock) : null;

  const sectionOpen = (section: string) => q.trim() !== '' || filter !== 'all' || open.includes(section);
  const panel = useListPanel(() => SECTIONS.flatMap(s => (sectionOpen(s) ? shown.filter(c => c.section === s).map(c => c.id) : [])), () => reg.reload());

  const pick = (id: string) => {
    setSiteId(id);
  };

  function exportCsv() {
    const rows: (string | number | null)[][] = [];
    for (const c of shown) {
      const sds = reg.currentSdsOf(c.id);
      for (const s of siteStock.filter(x => x.chemical_id === c.id)) {
        rows.push([reg.sites.find(x => x.id === s.site_id)?.name ?? s.site_id, c.section, c.name, c.manufacturer, classToConfirm(c) ? 'Class to confirm' : classLabel(c), c.un_number ?? '', s.location, s.container, amountOf(s), s.unit, s.max_count, sds ? formatDay(sds.issue_date) : 'No SDS']);
      }
    }
    downloadCsv(`chemical-register-${site?.code ?? 'all'}.csv`, csvFor(['Site', 'Section', 'Product', 'Manufacturer', 'DG class / hazard', 'UN', 'Location', 'Container', 'Quantity', 'Unit', 'Max containers', 'SDS issued'], rows));
  }

  const byId = (id: string) => reg.chemById.get(id);
  const seg = pairA && pairB && byId(pairA) && byId(pairB) ? segregation(byId(pairA) as Chemical, byId(pairB) as Chemical) : null;

  return (
    <div className="flex gap-5 items-start">
    <div className="flex-1 min-w-0 flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-[26px] font-bold">Hazardous chemicals &amp; DG register</h1>
            <div role="tablist" aria-label="Site" className="flex gap-1.5 flex-wrap">
              {[...reg.sites.map(s => ({ id: s.id, label: s.name.replace(/ (Yard|Workshop|Site)$/, '') })), { id: 'all', label: 'All sites' }].map(s => (
                <button key={s.id} type="button" role="tab" aria-selected={siteId === s.id} onClick={() => pick(s.id)}
                  className={`h-8 px-3 rounded-lg text-[13px] font-semibold cursor-pointer border ${siteId === s.id ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[#D6D2CC]'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1.5 mb-0 text-muted text-[15px]">{site ? `${site.name}, ${site.state} · ${stateRules(site.state).register}` : 'Every site · each chemical once, with its stock at every location'}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href={hrefFor({ name: 'chem', id: 'find-sds' })} className="no-underline min-h-11 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold flex items-center">Find an SDS</a>
          {site && <a href={hrefFor({ name: 'chem', id: `print-${site.id}` })} className="no-underline min-h-11 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold flex items-center">Print register</a>}
          {site && <a href={hrefFor({ name: 'chem', id: `totals-${site.id}` })} className="no-underline min-h-11 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold flex items-center">Site totals</a>}
          {site && <a href={hrefFor({ name: 'chem', id: `stocktake-${site.id}` })} className="no-underline min-h-11 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold flex items-center">Stocktake</a>}
          {office && <a href={hrefFor({ name: 'chem', id: 'upload-sds' })} className="no-underline min-h-11 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold flex items-center">Upload SDS files</a>}
          {office && <a href={hrefFor({ name: 'chemical', id: 'new' })} className="no-underline min-h-11 px-4 rounded-lg bg-finlay hover:bg-finlay-dark text-white text-sm font-semibold flex items-center">Add a chemical</a>}
        </div>
      </div>

      <ErrorNote message={reg.error} />

      {site ? (
        <section aria-label="Site totals" className="grid grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] gap-3">
          <a href={hrefFor({ name: 'chem', id: `totals-${site.id}` })} className="no-underline text-ink bg-white border border-line rounded-xl px-4 py-3.5 col-span-2 xl:col-span-1 hover:bg-[#FAFAF9]">
            <div className="flex items-center gap-2">
              <span className="text-muted text-[13px]">Against manifest quantity</span>
              {worst && <span className="ml-auto"><Pill tone={worst.status === 'over' ? 'red' : worst.status === 'close' ? 'amber' : 'green'}>{worst.status === 'over' ? 'Over' : worst.status === 'close' ? 'Getting close' : 'Under'}</Pill></span>}
            </div>
            <div className="text-[15px] font-semibold mt-1.5">
              {worst ? `${worst.label.split(',')[0]}: ${formatAmount(worst.total, worst.unit)} of ${formatAmount(worst.manifest, worst.unit)}` : 'Nothing counted yet'}
            </div>
            <div className="h-2 rounded-full bg-[#ECE8E2] mt-2 overflow-hidden" role="img" aria-label={worst ? `${Math.round(worst.pctManifest * 100)}% of the manifest quantity` : 'No counts'}>
              <div className={`h-full rounded-full ${worst?.status === 'over' ? 'bg-finlay' : worst?.status === 'close' ? 'bg-[#E0A100]' : 'bg-[#1F6B2E]'}`} style={{ width: `${Math.min(100, Math.round((worst?.pctManifest ?? 0) * 100))}%` }} />
            </div>
            <div className="text-muted text-xs mt-1.5">
              {worst ? `Highest class on site (${Math.round(worst.pctManifest * 100)}%).` : 'Counts add up here once entered.'}{toConfirm > 0 ? ` ${toConfirm} product${toConfirm === 1 ? ' is' : 's are'} not in this check yet.` : ''}
            </div>
          </a>
          <Stat label="Class to confirm" value={String(toConfirm)} sub="left out of totals" tone={toConfirm > 0 ? 'amber' : undefined} />
          <Stat label="SDS to fix" value={String(missing + old)} sub={`${missing} missing · ${old} over 5 years${soon ? ` · ${soon} due soon` : ''}`} alert={missing + old > 0} />
          <Stat label="Stocktake" value={take ? (take.state === 'never' ? `${take.counted}/${take.total}` : take.due ? formatDay(take.due) : '—') : '—'} sub={take ? (take.state === 'never' ? 'items counted so far' : take.state === 'overdue' ? 'overdue' : 'next due') : ''} alert={take?.state === 'overdue'} />
        </section>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Products" value={String(chemicals.length)} sub={`${chemicals.filter(c => c.dg_class).length} dangerous goods`} />
          <Stat label="SDS missing" value={String(missing)} sub="upload from the SDS folders" alert={missing > 0} />
          <Stat label="SDS over 5 years old" value={String(old)} sub={soon ? `${soon} more due within 90 days` : 'none due soon'} alert={old > 0} />
          <Stat label="Sites" value={String(reg.sites.length)} sub="QLD, NSW and VIC rules" />
        </div>
      )}

      <div className="bg-white border border-line rounded-xl px-4 py-3.5 flex flex-wrap gap-3 items-center">
        <span className="text-sm font-bold">Storage check</span>
        <select aria-label="First chemical" className="min-h-10 rounded-lg border border-[#D6D2CC] bg-white px-2.5 text-[13px] max-w-[280px]" value={pairA} onChange={e => setPairA(e.target.value)}>
          <option value="">Choose a chemical</option>
          {chemicals.filter(c => c.dg_class || c.combustible === 'C1').map(c => <option key={c.id} value={c.id}>{c.name} ({classLabel(c)})</option>)}
        </select>
        <span className="text-[13px] text-muted">with</span>
        <select aria-label="Second chemical" className="min-h-10 rounded-lg border border-[#D6D2CC] bg-white px-2.5 text-[13px] max-w-[280px]" value={pairB} onChange={e => setPairB(e.target.value)}>
          <option value="">Choose a chemical</option>
          {chemicals.filter(c => c.dg_class || c.combustible === 'C1').map(c => <option key={c.id} value={c.id}>{c.name} ({classLabel(c)})</option>)}
        </select>
        {seg && <Pill tone={seg.verdict === 'apart' ? 'red' : seg.verdict === 'check' ? 'amber' : 'green'}>{seg.verdict === 'apart' ? 'Keep apart' : seg.verdict === 'check' ? 'Check' : 'No general conflict'}</Pill>}
        <span className="text-xs text-muted flex-[1_1_240px]">{seg ? seg.reason : 'General rules from the DG classes. Section 7 of each SDS has the final word.'}</span>
      </div>

      <div className="flex flex-wrap gap-2.5 items-center">
        <label htmlFor="chem-q" className="sr-only">Search</label>
        <input id="chem-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search product, manufacturer, UN number, class or location"
          className="flex-[1_1_320px] max-w-[460px] min-h-11 rounded-lg border border-[#D6D2CC] bg-white px-3 text-sm" />
        {([['all', 'All'], ['dg', 'Dangerous goods'], ['sds', 'SDS problems'], ['uncounted', 'Not counted'], ...(toConfirm ? [['confirm', `Class to confirm (${toConfirm})`]] : [])] as [Filter, string][]).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
            className={`min-h-10 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer border ${filter === id ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[#D6D2CC]'}`}>
            {label}
          </button>
        ))}
        <button type="button" onClick={exportCsv} className="ml-auto min-h-10 px-3 rounded-lg border border-[#D6D2CC] bg-white text-[13px] font-semibold cursor-pointer">Export CSV</button>
      </div>

      {(() => {
        const sectionList = [...SECTIONS, ...Array.from(new Set(shown.map(c => c.section))).filter(s => !SECTIONS.includes(s))].filter(sec => shown.some(c => c.section === sec));
        const narrowed = q.trim() !== '' || filter !== 'all';
        const allOpen = sectionList.every(sec => open.includes(sec));
        if (narrowed || !sectionList.length) return null;
        return (
          <div className="flex justify-end -mb-2">
            <button type="button" onClick={() => {
              const next = allOpen ? [] : sectionList;
              setOpen(next);
              try { localStorage.setItem('whs-chem-open', JSON.stringify(next)); } catch { /* per-viewer only */ }
            }} className="bg-transparent border-0 p-0 min-h-8 text-[13px] font-semibold text-ink underline cursor-pointer">
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
        );
      })()}
      {[...SECTIONS, ...Array.from(new Set(shown.map(c => c.section))).filter(s => !SECTIONS.includes(s))].map(section => {
        const rows = shown.filter(c => c.section === section);
        if (!rows.length) return null;
        // Searching or filtering shows every match; otherwise sections open and close
        const isOpen = sectionOpen(section);
        const noSds = rows.filter(c => ['missing', 'expired'].includes(sdsState(reg.currentSdsOf(c.id)))).length;
        const confirm = rows.filter(classToConfirm).length;
        return (
          <section key={section} className="bg-white border border-line rounded-xl overflow-x-auto">
            <h2 className="m-0">
              <button type="button" aria-expanded={isOpen} onClick={() => toggle(section)}
                className={`w-full flex flex-wrap items-center gap-2 px-4 py-3 bg-transparent border-0 text-left cursor-pointer hover:bg-[#FAFAF9] ${isOpen ? 'border-b border-[#EEEBE6]' : ''}`}>
                {isOpen ? <ChevronDown className="w-4 h-4 text-muted" aria-hidden="true" /> : <ChevronRight className="w-4 h-4 text-muted" aria-hidden="true" />}
                <span className="text-[13px] tracking-wide uppercase text-muted font-semibold">{section}</span>
                <span className="text-[13px] text-muted">· {rows.length}</span>
                {noSds > 0 && <Pill tone="red">{noSds} SDS to fix</Pill>}
                {confirm > 0 && <Pill tone="amber">{confirm} class to confirm</Pill>}
              </button>
            </h2>
            {isOpen && <table className="w-full border-collapse text-sm min-w-[1000px]">
              <thead>
                <tr className="text-muted text-xs">
                  <th scope="col" className={`${th} pl-4`}>Product</th><th scope="col" className={th}>DG class / hazard</th><th scope="col" className={th}>UN</th>
                  <th scope="col" className={th}>Stored at</th><th scope="col" className={th}>Stock</th><th scope="col" className={th}>Total</th><th scope="col" className={`${th} pr-4`}>SDS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(c => <Row key={c.id} selected={panel.openId === c.id} onOpen={() => panel.setOpenId(c.id)} c={c} stock={siteStock.filter(s => s.chemical_id === c.id)} showSite={!site} sites={reg.sites} sds={sdsPill(reg.currentSdsOf(c.id))} />)}
              </tbody>
            </table>}
          </section>
        );
      })}
      {reg.loaded && shown.length === 0 && <p className="m-0 bg-white border border-line rounded-xl px-4 py-8 text-sm text-muted text-center">Nothing matches.</p>}
    </div>
    {panel.openId && (
      <SidePanel label="Chemical" fullHref={hrefFor({ name: 'chemical', id: panel.openId })} onClose={panel.close}>
        <ChemicalPage key={panel.openId} id={panel.openId} user={user} embedded />
      </SidePanel>
    )}
    </div>
  );
}

function Stat({ label, value, sub, alert, tone }: { label: string; value: string; sub: string; alert?: boolean; tone?: 'amber' }) {
  return (
    <div className="bg-white border border-line rounded-xl px-4 py-3.5">
      <div className="text-muted text-[13px]">{label}</div>
      <div className={`text-[26px] font-bold mt-0.5 ${alert ? 'text-finlay' : tone === 'amber' ? 'text-[#7A4A00]' : ''}`}>{value}</div>
      <div className="text-muted text-xs mt-0.5">{sub}</div>
    </div>
  );
}

function Row({ c, stock, showSite, sites, sds: p, selected, onOpen }: { c: Chemical; stock: Stock[]; showSite: boolean; sites: { id: string; name: string }[]; sds: { label: string; tone: Tone }; selected: boolean; onOpen: () => void }) {
  return (
    <tr onClick={e => rowOpens(e, onOpen)} aria-selected={selected} className={`cursor-pointer ${selected ? 'bg-finlay-soft' : 'hover:bg-[#FAFAF9]'}`}>
      <td className={`${td} pl-4`}>
        <a href={hrefFor({ name: 'chemical', id: c.id })} onClick={e => linkOpens(e, onOpen)} className="font-semibold no-underline">{c.name}</a>
        <span className="block text-xs text-muted">{c.manufacturer}</span>
      </td>
      <td className={td}>
        {classToConfirm(c) ? <Pill tone="amber">Class to confirm</Pill> : <Pill tone={classTone(c)}>{classLabel(c)}</Pill>}
      </td>
      <td className={`${td} font-mono text-[13px]`}>{c.un_number ?? '—'}</td>
      <td className={`${td} text-muted`}>
        {stock.map(s => <span key={s.id} className="block">{showSite ? `${sites.find(x => x.id === s.site_id)?.name ?? s.site_id}: ` : ''}{s.location}</span>)}
      </td>
      <td className={`${td} whitespace-nowrap text-muted`}>
        {stock.map(s => (
          <span key={s.id} className="block">
            {s.last_counted_at === null || s.count === null ? 'not counted' : s.container_size ? `${s.count} × ${formatAmount(s.container_size, s.unit)}` : `${s.count} (size not set)`}
          </span>
        ))}
      </td>
      <td className={`${td} whitespace-nowrap`}>
        {stock.map(s => (
          <span key={s.id} className="block">
            <strong>{formatAmount(amountOf(s), s.unit)}</strong>
            {s.max_count !== null && s.container_size ? <span className="text-muted font-normal"> / {formatAmount(s.max_count * s.container_size, s.unit)}</span> : null}
          </span>
        ))}
      </td>
      <td className={`${td} pr-4 whitespace-nowrap`}><Pill tone={p.tone}>{p.label}</Pill></td>
    </tr>
  );
}
