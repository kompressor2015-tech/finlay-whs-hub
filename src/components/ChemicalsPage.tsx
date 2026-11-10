import { useEffect, useMemo, useState } from 'react';
import type { WhsUser } from '../services/auth.ts';
import { rememberSite, rememberedSite, useRegister } from '../hooks/useRegister.ts';
import { hrefFor } from '../hooks/useRoute.ts';
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

type Filter = 'all' | 'dg' | 'sds' | 'uncounted';
const th = 'px-2 py-2.5 font-semibold border-b border-[#EEEBE6] text-left';
const td = 'px-2 py-2.5 border-b border-line-soft align-top';

/** The hazardous chemicals and DG register, by site. */
export function ChemicalsPage({ user }: { user: WhsUser }) {
  const office = isOfficeAccess(user.access);
  const reg = useRegister();
  const [siteId, setSiteId] = useState<string>(() => rememberedSite() ?? 'all');
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [pairA, setPairA] = useState('');
  const [pairB, setPairB] = useState('');

  useEffect(() => {
    if (reg.loaded && siteId !== 'all' && !reg.sites.some(s => s.id === siteId)) setSiteId('all');
  }, [reg.loaded, reg.sites, siteId]);

  const site = reg.sites.find(s => s.id === siteId) ?? null;
  const siteStock = useMemo(() => (site ? reg.stock.filter(s => s.site_id === site.id) : reg.stock), [reg.stock, site]);
  const chemIds = useMemo(() => new Set(siteStock.map(s => s.chemical_id)), [siteStock]);
  const chemicals = reg.chemicals.filter(c => c.active && (siteId === 'all' || chemIds.has(c.id)));

  const shown = chemicals.filter(c => {
    if (filter === 'dg' && !c.dg_class && c.combustible !== 'C1') return false;
    if (filter === 'sds' && sdsState(reg.currentSdsOf(c.id)) === 'ok') return false;
    if (filter === 'uncounted' && !siteStock.some(s => s.chemical_id === c.id && amountOf(s) === null)) return false;
    const locs = siteStock.filter(s => s.chemical_id === c.id).map(s => s.location);
    return looseMatch(q, [c.name, c.manufacturer, c.un_number, c.dg_class ? `class ${c.dg_class}` : '', ...locs]);
  });

  const missing = chemicals.filter(c => sdsState(reg.currentSdsOf(c.id)) === 'missing').length;
  const old = chemicals.filter(c => sdsState(reg.currentSdsOf(c.id)) === 'expired').length;
  const soon = chemicals.filter(c => sdsState(reg.currentSdsOf(c.id)) === 'due_soon').length;
  const worst = site ? worstLine(siteTotals(site.state, siteStock, reg.chemById)) : null;
  const take = site ? stocktakeDue(site, siteStock) : null;

  const pick = (id: string) => {
    setSiteId(id);
    rememberSite(id);
  };

  function exportCsv() {
    const rows: (string | number | null)[][] = [];
    for (const c of shown) {
      const sds = reg.currentSdsOf(c.id);
      for (const s of siteStock.filter(x => x.chemical_id === c.id)) {
        rows.push([reg.sites.find(x => x.id === s.site_id)?.name ?? s.site_id, c.section, c.name, c.manufacturer, classLabel(c), c.un_number ?? '', s.location, s.container, amountOf(s), s.unit, s.max_count, sds ? formatDay(sds.issue_date) : 'No SDS']);
      }
    }
    downloadCsv(`chemical-register-${site?.code ?? 'all'}.csv`, csvFor(['Site', 'Section', 'Product', 'Manufacturer', 'DG class / hazard', 'UN', 'Location', 'Container', 'Quantity', 'Unit', 'Max containers', 'SDS issued'], rows));
  }

  const byId = (id: string) => reg.chemById.get(id);
  const seg = pairA && pairB && byId(pairA) && byId(pairB) ? segregation(byId(pairA) as Chemical, byId(pairB) as Chemical) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="m-0 text-[26px] font-bold">Hazardous chemicals &amp; DG register</h1>
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

      <div role="tablist" className="flex gap-1 border-b border-line flex-wrap">
        {[...reg.sites.map(s => ({ id: s.id, label: s.name, state: s.state })), { id: 'all', label: 'All sites', state: '' }].map(s => (
          <button key={s.id} type="button" role="tab" aria-selected={siteId === s.id} onClick={() => pick(s.id)}
            className={`bg-transparent border-0 border-b-2 px-3.5 py-2.5 text-[15px] cursor-pointer ${siteId === s.id ? 'border-finlay font-semibold text-ink' : 'border-transparent text-muted'}`}>
            {s.label} {s.state && <span className="text-xs text-muted font-medium">{s.state}</span>}
          </button>
        ))}
      </div>

      <ErrorNote message={reg.error} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Products" value={String(chemicals.length)} sub={`${chemicals.filter(c => c.dg_class).length} dangerous goods`} />
        <Stat label="SDS missing" value={String(missing)} sub="upload from the SDS folders" alert={missing > 0} />
        <Stat label="SDS over 5 years old" value={String(old)} sub={soon ? `${soon} more due within 90 days` : 'none due soon'} alert={old > 0} />
        {site ? (
          <a href={hrefFor({ name: 'chem', id: `totals-${site.id}` })} className="no-underline text-ink bg-white border border-line rounded-xl px-4 py-3.5">
            <div className="text-muted text-[13px]">Manifest quantity</div>
            <div className={`text-[22px] font-bold mt-0.5 ${worst?.status === 'over' ? 'text-finlay' : worst?.status === 'close' ? 'text-[#7A4A00]' : 'text-[#1E6B3A]'}`}>
              {worst ? (worst.status === 'over' ? 'Over' : worst.status === 'close' ? 'Getting close' : 'Well under') : '—'}
            </div>
            <div className="text-muted text-xs mt-0.5">{worst ? `${worst.label.split(',')[0]}: ${Math.round(worst.pctManifest * 100)}%` : 'nothing counted yet'}{take ? ` · stocktake ${take.state === 'never' ? `${take.counted} of ${take.total} counted` : take.due ? `due ${formatDay(take.due)}` : ''}` : ''}</div>
          </a>
        ) : (
          <Stat label="Sites" value={String(reg.sites.length)} sub="QLD, NSW and VIC rules" />
        )}
      </div>

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
        {([['all', 'All'], ['dg', 'Dangerous goods'], ['sds', 'SDS problems'], ['uncounted', 'Not counted']] as [Filter, string][]).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
            className={`min-h-10 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer border ${filter === id ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[#D6D2CC]'}`}>
            {label}
          </button>
        ))}
        <button type="button" onClick={exportCsv} className="ml-auto min-h-10 px-3 rounded-lg border border-[#D6D2CC] bg-white text-[13px] font-semibold cursor-pointer">Export CSV</button>
      </div>

      {[...SECTIONS, ...Array.from(new Set(shown.map(c => c.section))).filter(s => !SECTIONS.includes(s))].map(section => {
        const rows = shown.filter(c => c.section === section);
        if (!rows.length) return null;
        return (
          <section key={section} className="bg-white border border-line rounded-xl overflow-x-auto">
            <h2 className="m-0 px-4 py-3 border-b border-[#EEEBE6] text-[13px] tracking-wide uppercase text-muted">{section} <span className="normal-case tracking-normal">· {rows.length}</span></h2>
            <table className="w-full border-collapse text-sm min-w-[900px]">
              <thead>
                <tr className="text-muted text-xs">
                  <th scope="col" className={`${th} pl-4`}>Product</th><th scope="col" className={th}>DG class / hazard</th><th scope="col" className={th}>UN</th>
                  <th scope="col" className={th}>Stored at</th><th scope="col" className={th}>Quantity</th><th scope="col" className={`${th} pr-4`}>SDS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(c => <Row key={c.id} c={c} stock={siteStock.filter(s => s.chemical_id === c.id)} showSite={!site} sites={reg.sites} sds={sdsPill(reg.currentSdsOf(c.id))} />)}
              </tbody>
            </table>
          </section>
        );
      })}
      {reg.loaded && shown.length === 0 && <p className="m-0 bg-white border border-line rounded-xl px-4 py-8 text-sm text-muted text-center">Nothing matches.</p>}
    </div>
  );
}

function Stat({ label, value, sub, alert }: { label: string; value: string; sub: string; alert?: boolean }) {
  return (
    <div className="bg-white border border-line rounded-xl px-4 py-3.5">
      <div className="text-muted text-[13px]">{label}</div>
      <div className={`text-[26px] font-bold mt-0.5 ${alert ? 'text-finlay' : ''}`}>{value}</div>
      <div className="text-muted text-xs mt-0.5">{sub}</div>
    </div>
  );
}

function Row({ c, stock, showSite, sites, sds: p }: { c: Chemical; stock: Stock[]; showSite: boolean; sites: { id: string; name: string }[]; sds: { label: string; tone: Tone } }) {
  return (
    <tr>
      <td className={`${td} pl-4`}>
        <a href={hrefFor({ name: 'chemical', id: c.id })} className="font-semibold no-underline">{c.name}</a>
        <span className="block text-xs text-muted">{c.manufacturer}</span>
      </td>
      <td className={td}><Pill tone={classTone(c)}>{classLabel(c)}</Pill></td>
      <td className={`${td} font-mono text-[13px]`}>{c.un_number ?? '—'}</td>
      <td className={`${td} text-muted`}>
        {stock.map(s => <span key={s.id} className="block">{showSite ? `${sites.find(x => x.id === s.site_id)?.name ?? s.site_id}: ` : ''}{s.location}</span>)}
      </td>
      <td className={`${td} whitespace-nowrap`}>
        {stock.map(s => (
          <span key={s.id} className="block">
            <strong>{formatAmount(amountOf(s), s.unit)}</strong>
            {s.max_count !== null && s.container_size ? <span className="text-muted"> / {formatAmount(s.max_count * s.container_size, s.unit)}</span> : null}
            {s.last_counted_at === null && <span className="text-muted"> (not counted)</span>}
          </span>
        ))}
      </td>
      <td className={`${td} pr-4 whitespace-nowrap`}><Pill tone={p.tone}>{p.label}</Pill></td>
    </tr>
  );
}
