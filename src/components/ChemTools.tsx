import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { WhsUser } from '../services/auth.ts';
import { openSds, recordCount, uploadSds } from '../services/chemicals.ts';
import { rememberSite, rememberedSite, useRegister } from '../hooks/useRegister.ts';
import { hrefFor } from '../hooks/useRoute.ts';
import { isOfficeAccess } from '../utils/access.ts';
import { formatDate, formatDay, formatWhen } from '../utils/dates.ts';
import { looseMatch } from '../utils/search.ts';
import {
  SECTIONS, WARN_AT, amountOf, classLabel, classTone, formatAmount, issueDateFromName, matchSdsFile, sdsPill, siteTotals, stateRules, stocktakeDue,
  type Stock,
} from '../utils/chemicals.ts';
import { ErrorNote } from './Form.tsx';
import { Pill } from './Pill.tsx';

/** Routes #/chem/<tool> to the right screen. */
export function ChemTool({ tool, user }: { tool: string; user: WhsUser }) {
  if (tool === 'find-sds') return <FindSds />;
  if (tool === 'upload-sds') return <BulkSdsUpload user={user} />;
  const m = /^(totals|stocktake|print)-([a-z0-9_-]+)$/.exec(tool);
  if (m?.[1] === 'totals') return <SiteTotals siteId={m[2]} />;
  if (m?.[1] === 'stocktake') return <Stocktake siteId={m[2]} />;
  if (m?.[1] === 'print') return <PrintRegister siteId={m[2]} />;
  return <ErrorNote message="Page not found." />;
}

const back = <a href={hrefFor({ name: 'module', id: 'chemicals' })} className="text-sm no-underline text-muted">← Chemical register</a>;

// ---------------------------------------------------------------------------------
// Site totals against placard and manifest quantities
// ---------------------------------------------------------------------------------

function SiteTotals({ siteId }: { siteId: string }) {
  const reg = useRegister();
  const site = reg.sites.find(s => s.id === siteId);
  if (!site) return reg.loaded ? <ErrorNote message="Site not found." /> : <p className="text-sm text-muted">Loading…</p>;
  const stock = reg.stock.filter(s => s.site_id === site.id);
  const lines = siteTotals(site.state, stock, reg.chemById);
  const rules = stateRules(site.state);
  const vic = site.state === 'VIC';
  const over = lines.filter(l => l.status === 'over');
  const close = lines.filter(l => l.status === 'close');
  const placard = lines.filter(l => l.overPlacard);
  const unknown = lines.reduce((n, l) => n + l.unknown, 0);
  const take = stocktakeDue(site, stock);

  return (
    <div className="flex flex-col gap-4.5 max-w-[1200px]">
      {back}
      <div>
        <h1 className="m-0 text-2xl font-bold">{site.name}: totals against manifest quantities</h1>
        <p className="mt-1.5 mb-0 text-muted text-[15px]">{rules.thresholds}. The aim is to stay under every manifest quantity, so no manifest or notification to {rules.regulator} is needed. The app warns at {Math.round(WARN_AT * 100)}%.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className={`rounded-xl px-4 py-3.5 border ${over.length ? 'bg-finlay text-white border-finlay' : close.length ? 'bg-[#FFF1D6] border-[#F2D9A6]' : 'bg-[#E3F3E8] border-[#BFE3CB]'}`}>
          <div className="text-[13px] opacity-80">Manifest quantity</div>
          <div className="text-[22px] font-bold mt-0.5">{over.length ? 'Over: act now' : close.length ? 'Getting close' : 'Under'}</div>
          <div className="text-xs mt-0.5">{over.length ? `${over.map(l => l.label.split(',')[0]).join(', ')}. A manifest and notification are required while over.` : close.length ? `${close.length} line(s) at ${Math.round(WARN_AT * 100)}% or more` : 'Every line is under 80% of its manifest quantity'}</div>
        </div>
        <div className="bg-white border border-line rounded-xl px-4 py-3.5">
          <div className="text-muted text-[13px]">Placard quantity</div>
          <div className="text-[22px] font-bold mt-0.5">{vic ? 'See note' : placard.length ? `${placard.length} line(s) over` : 'Under'}</div>
          <div className="text-muted text-xs mt-0.5">{vic ? 'Victorian placard quantities are not in the app yet' : placard.length ? 'Placards are needed for these classes' : 'No placards needed'}</div>
        </div>
        <div className="bg-white border border-line rounded-xl px-4 py-3.5">
          <div className="text-muted text-[13px]">How complete these totals are</div>
          <div className={`text-[22px] font-bold mt-0.5 ${unknown ? 'text-[#7A4A00]' : ''}`}>{unknown ? `${unknown} not counted` : 'All counted'}</div>
          <div className="text-muted text-xs mt-0.5">{take.state === 'never' ? `${take.counted} of ${take.total} items counted so far` : take.due ? `Next stocktake due ${formatDay(take.due)}` : ''}</div>
        </div>
      </div>

      <section className="bg-white border border-line rounded-xl overflow-x-auto">
        <table className="w-full border-collapse text-sm min-w-[900px]">
          <thead>
            <tr className="text-muted text-xs text-left">
              <th scope="col" className="px-4.5 py-3 font-semibold border-b border-[#EEEBE6]">Class</th>
              <th scope="col" className="px-2 py-3 font-semibold border-b border-[#EEEBE6]">Products</th>
              <th scope="col" className="px-2 py-3 font-semibold border-b border-[#EEEBE6]">Stored</th>
              {!vic && <th scope="col" className="px-2 py-3 font-semibold border-b border-[#EEEBE6]">Placard at</th>}
              <th scope="col" className="px-2 py-3 font-semibold border-b border-[#EEEBE6]">Manifest at</th>
              <th scope="col" className="px-4.5 py-3 font-semibold border-b border-[#EEEBE6] w-[260px]">Of manifest quantity</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(l => {
              const pct = Math.min(100, Math.round(l.pctManifest * 100));
              return (
                <tr key={l.key}>
                  <td className="px-4.5 py-3 border-b border-line-soft">
                    <span className="font-semibold">{l.label}</span>
                    {l.note && <span className="block text-xs text-muted mt-0.5">{l.note}</span>}
                    {l.assumedPg > 0 && <span className="block text-xs text-[#7A4A00] mt-0.5">{l.assumedPg} item(s) with no packing group counted as PG I</span>}
                  </td>
                  <td className="px-2 py-3 border-b border-line-soft text-muted">{l.products}</td>
                  <td className="px-2 py-3 border-b border-line-soft font-semibold whitespace-nowrap">
                    {l.total.toLocaleString('en-AU')} <span className="font-normal text-muted text-xs">{l.unit}</span>
                    {l.unknown > 0 && <span className="block text-xs font-normal text-[#7A4A00]">+ {l.unknown} not counted</span>}
                  </td>
                  {!vic && <td className={`px-2 py-3 border-b border-line-soft whitespace-nowrap ${l.overPlacard ? 'text-finlay font-bold' : 'text-muted'}`}>{l.placard?.toLocaleString('en-AU') ?? '—'}</td>}
                  <td className="px-2 py-3 border-b border-line-soft text-muted whitespace-nowrap">{l.manifest.toLocaleString('en-AU')}</td>
                  <td className="px-4.5 py-3 border-b border-line-soft">
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 h-2.5 bg-[#EEEBE6] rounded-full overflow-hidden" role="img" aria-label={`${pct}% of the manifest quantity`}>
                        <div className={`h-full ${l.status === 'over' ? 'bg-finlay' : l.status === 'close' ? 'bg-[#E0A030]' : 'bg-[#1E6B3A]'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[13px] w-11 text-right">{Math.round(l.pctManifest * 100)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lines.length === 0 && <p className="m-0 px-4.5 py-6 text-sm text-muted">No dangerous goods or C1 liquids stored here.</p>}
      </section>

      <section className="bg-white border border-line rounded-xl px-4.5 py-4 text-sm leading-relaxed">
        <h2 className="mt-0 mb-2 text-[15px] font-semibold">How this is worked out</h2>
        <ul className="m-0 pl-5">
          <li>Quantity = number of containers × container size, from the latest stocktake. Gas cylinders are counted by water capacity in litres.</li>
          <li>{vic ? 'Victoria also adds all dangerous goods together: that "mixed classes" line has its own 10,000 kg or L manifest quantity.' : 'Flammable liquids of different packing groups are also added together, with their own placard and manifest quantities.'}</li>
          <li>C2 combustible liquids (most oils) and non-DG products don't count towards these quantities.</li>
          {vic && <li>If a Victorian site does go over, WorkSafe Victoria must be notified, and told again within 3 business days of some changes (such as a 20% increase). The notification is renewed every 2 years.</li>}
          <li>Figures were checked against {vic ? 'WorkSafe Victoria’s manifest quantities (Schedule 2)' : 'Safe Work Australia’s Schedule 11 table'} on 10/11/2026. Whoever handles WHS should confirm them for the site.</li>
        </ul>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------
// Find an SDS (made for a phone)
// ---------------------------------------------------------------------------------

function FindSds() {
  const reg = useRegister();
  const [siteId, setSiteId] = useState<string>(() => rememberedSite() ?? 'all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const atSite = useMemo(() => new Set(reg.stock.filter(s => siteId === 'all' || s.site_id === siteId).map(s => s.chemical_id)), [reg.stock, siteId]);
  const results = reg.chemicals
    .filter(c => c.active && atSite.has(c.id))
    .filter(c => looseMatch(q, [c.name, c.manufacturer, c.un_number, ...reg.stock.filter(s => s.chemical_id === c.id).map(s => s.location)]))
    .slice(0, q ? 30 : 12);

  return (
    <div className="flex flex-col gap-3.5 max-w-[560px]">
      <h1 className="m-0 text-xl font-bold">Find an SDS</h1>
      <label htmlFor="sds-q" className="sr-only">Search chemicals</label>
      <input id="sds-q" type="search" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Product name, UN number or location"
        className="min-h-[52px] rounded-xl border-2 border-ink bg-white px-3.5 text-base" />
      <div className="flex gap-1.5 flex-wrap items-center text-[13px]">
        <span className="text-muted">Site:</span>
        {[...reg.sites.map(s => ({ id: s.id, label: s.name.split(' ')[0] })), { id: 'all', label: 'All sites' }].map(s => (
          <button key={s.id} type="button" aria-pressed={siteId === s.id} onClick={() => { setSiteId(s.id); rememberSite(s.id); }}
            className={`min-h-9 px-3 rounded-full text-[13px] font-semibold cursor-pointer border ${siteId === s.id ? 'bg-ink text-white border-ink' : 'bg-white border-[#D6D2CC]'}`}>
            {s.label}
          </button>
        ))}
      </div>
      <ErrorNote message={reg.error} />
      {results.map(c => {
        const sds = reg.currentSdsOf(c.id);
        const pill = sdsPill(sds);
        const expanded = open === c.id || results.length === 1;
        const where = reg.stock.filter(s => s.chemical_id === c.id && (siteId === 'all' || s.site_id === siteId));
        return (
          <article key={c.id} className="bg-white border border-line rounded-[14px] p-4 flex flex-col gap-3">
            <button type="button" onClick={() => setOpen(expanded ? null : c.id)} className="text-left bg-transparent border-0 p-0 cursor-pointer text-ink" aria-expanded={expanded}>
              <span className="flex gap-1.5 flex-wrap">
                <Pill tone={classTone(c)}>{classLabel(c)}</Pill>
                {c.un_number && <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[#EEEBE6]">UN {c.un_number}</span>}
              </span>
              <span className="block mt-2 text-lg font-bold">{c.name}</span>
              <span className="block text-sm text-muted">{c.manufacturer} · {where.map(w => w.location).join(', ')}</span>
            </button>
            {sds ? (
              <button type="button" onClick={() => openSds(sds.file_path)} className="min-h-[52px] rounded-xl border-0 bg-ink text-white text-base font-bold cursor-pointer">Open the SDS</button>
            ) : (
              <p className="m-0 text-sm text-[#8E0F15] bg-[#FBE3E4] rounded-lg px-3 py-2.5">No SDS in the app yet. Check the paper folder and tell the WHS officer.</p>
            )}
            {expanded && (
              <>
                {c.h_statements.length > 0 && (
                  <div className="flex flex-col gap-1.5 text-sm">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted">Main hazards</span>
                    {c.h_statements.slice(0, 4).map(h => <span key={h} className="px-2.5 py-2 rounded-lg bg-[#FFF6F6] text-[#8E0F15]">{h}</span>)}
                  </div>
                )}
                {c.ppe.length > 0 && <div className="flex flex-wrap gap-1.5">{c.ppe.map(p => <Pill key={p} tone="blue">{p}</Pill>)}</div>}
                {c.first_aid && <div className="bg-[#FFF1D6] rounded-[10px] p-3 text-sm leading-relaxed text-[#4A3200] whitespace-pre-line"><strong className="block mb-0.5">First aid</strong>{c.first_aid}</div>}
                <a href="tel:131126" className="no-underline border border-[#D6D2CC] rounded-xl min-h-12 flex items-center justify-center font-semibold text-[15px]">Poisons Information 13 11 26</a>
                <a href={hrefFor({ name: 'incident', id: 'new' })} className="no-underline border border-[#D6D2CC] rounded-xl min-h-12 flex items-center justify-center font-semibold text-[15px] text-finlay">Report a spill or exposure</a>
              </>
            )}
            {sds && <p className="m-0 text-xs text-muted text-center">SDS issued {formatDay(sds.issue_date)} · <Pill tone={pill.tone}>{pill.label}</Pill></p>}
          </article>
        );
      })}
      {reg.loaded && results.length === 0 && <p className="m-0 text-sm text-muted">Nothing found{siteId !== 'all' ? ' at this site. Try "All sites"' : ''}.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------
// Stocktake (made for a phone)
// ---------------------------------------------------------------------------------

function Stocktake({ siteId }: { siteId: string }) {
  const reg = useRegister();
  const site = reg.sites.find(s => s.id === siteId);
  const stock = reg.stock.filter(s => s.site_id === siteId);
  const locations = Array.from(new Set(stock.map(s => s.location))).sort();
  const [loc, setLoc] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!loc && locations.length) {
      const firstUncounted = locations.find(l => stock.some(s => s.location === l && !s.last_counted_at));
      setLoc(firstUncounted ?? locations[0]);
    }
  }, [locations, loc, stock]);

  if (!site) return reg.loaded ? <ErrorNote message="Site not found." /> : <p className="text-sm text-muted">Loading…</p>;
  const here = stock.filter(s => s.location === loc);
  const done = (s: Stock) => s.id in counts;
  const take = stocktakeDue(site, stock);

  async function save() {
    setBusy(true);
    setError(null);
    for (const [id, n] of Object.entries(counts)) {
      const res = await recordCount(id, n);
      if (res.error) {
        setBusy(false);
        return setError(res.error);
      }
    }
    setBusy(false);
    setSaved(`Saved ${Object.keys(counts).length} count(s) for ${loc}.`);
    setCounts({});
    await reg.reload();
    const next = locations[locations.indexOf(loc) + 1];
    if (next) setLoc(next);
  }

  return (
    <div className="flex flex-col gap-3 max-w-[560px]">
      {back}
      <div>
        <h1 className="m-0 text-xl font-bold">Stocktake: {site.name}</h1>
        <p className="mt-1 mb-0 text-[13px] text-muted">{take.state === 'never' ? `First stocktake: ${take.counted} of ${take.total} items counted` : `Every ${site.stocktake_days} days · next due ${formatDay(take.due)}`}. Count the containers; the app works out the litres or kilograms.</p>
      </div>
      <label htmlFor="st-loc" className="text-sm font-medium">Location</label>
      <select id="st-loc" value={loc} onChange={e => { setLoc(e.target.value); setSaved(null); }} className="min-h-12 rounded-[10px] border border-[#D6D2CC] bg-white px-3 text-[15px]">
        {locations.map(l => {
          const left = stock.filter(s => s.location === l && !s.last_counted_at).length;
          return <option key={l} value={l}>{l}{left ? ` (${left} not counted)` : ''}</option>;
        })}
      </select>
      <p className="m-0 text-[13px] text-muted">{here.filter(done).length} of {here.length} counted here</p>
      {here.map(s => {
        const c = reg.chemById.get(s.chemical_id);
        const n = counts[s.id] ?? s.count ?? 0;
        const set = (v: number) => setCounts(prev => ({ ...prev, [s.id]: Math.max(0, Math.round(v * 100) / 100) }));
        return (
          <div key={s.id} className={`bg-white rounded-xl p-3 flex flex-col gap-2.5 ${done(s) ? 'border border-[#BFE3CB]' : 'border border-line'}`}>
            <span className="text-[15px] font-semibold">
              {c?.name}
              <span className="block text-xs font-normal text-muted">
                {c ? classLabel(c) : ''} · {s.container || 'container not set'}{s.container_size ? ` (${s.container_size} ${s.unit})` : ''} · last {s.last_counted_at ? formatWhen(s.last_counted_at) : 'never'}
              </span>
            </span>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="One fewer" onClick={() => set(n - 1)} className="w-12 h-12 rounded-[10px] border border-[#D6D2CC] bg-white text-[22px] font-bold cursor-pointer">−</button>
              <input aria-label={`Number of containers of ${c?.name}`} inputMode="decimal" value={String(n)} onChange={e => set(Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)}
                className="flex-1 min-w-0 h-12 text-center rounded-[10px] border border-[#D6D2CC] bg-[#FAFAF9] text-lg font-bold" />
              <button type="button" aria-label="One more" onClick={() => set(n + 1)} className="w-12 h-12 rounded-[10px] border border-[#D6D2CC] bg-white text-[22px] font-bold cursor-pointer">+</button>
              <button type="button" aria-pressed={done(s)} onClick={() => set(n)}
                className={`min-w-[70px] h-12 rounded-[10px] text-sm font-bold cursor-pointer ${done(s) ? 'bg-[#E3F3E8] text-[#1E6B3A] border-2 border-[#1E6B3A]' : 'bg-white border border-[#D6D2CC]'}`}>
                {done(s) ? 'Counted' : 'Same'}
              </button>
            </div>
            {!s.container_size && <span className="text-xs text-[#7A4A00]">Container size isn't set, so this can't be added to the site totals yet.</span>}
          </div>
        );
      })}
      <ErrorNote message={error} />
      {saved && <p role="status" className="m-0 text-sm text-[#1E6B3A] bg-[#E3F3E8] rounded-lg px-3 py-2.5">{saved}</p>}
      <button type="button" disabled={busy || !Object.keys(counts).length} onClick={save} className="min-h-[52px] rounded-xl border-0 bg-finlay text-white text-base font-bold cursor-pointer disabled:opacity-50">
        {busy ? 'Saving…' : `Save ${Object.keys(counts).length || ''} count(s)`}
      </button>
      <p className="mt-0 mb-6 text-xs text-muted text-center">Every count is dated and kept, so the register shows when it was last checked.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------
// Printable register (same layout as the paper registers)
// ---------------------------------------------------------------------------------

function PrintRegister({ siteId }: { siteId: string }) {
  const reg = useRegister();
  const site = reg.sites.find(s => s.id === siteId);
  if (!site) return reg.loaded ? <ErrorNote message="Site not found." /> : <p className="text-sm text-muted">Loading…</p>;
  const rules = stateRules(site.state);
  const year = new Date().getFullYear();
  const stock = reg.stock.filter(s => s.site_id === site.id);
  const chems = reg.chemicals.filter(c => c.active && stock.some(s => s.chemical_id === c.id));
  let n = 0;
  const cell = 'border border-[#BDB7AE] px-1.5 py-1 align-top';

  return (
    <div className="flex flex-col gap-3 max-w-[1100px] print:max-w-none">
      <div className="print:hidden flex gap-2 items-center flex-wrap">
        {back}
        <button type="button" onClick={() => window.print()} className="ml-auto min-h-11 px-4 rounded-lg border-0 bg-finlay text-white text-sm font-semibold cursor-pointer">Print or save as PDF</button>
      </div>
      <article className="bg-white p-6 print:p-0 text-[12px] leading-snug">
        <header className="flex justify-between items-start gap-4 border-b-2 border-finlay pb-3 mb-3">
          <div>
            <img src="/finlay-banner.jpg" alt="Finlay" className="h-10 w-auto block mb-2" />
            <h1 className="m-0 text-lg font-bold">HAZARDOUS CHEMICALS &amp; DG REGISTER</h1>
            <p className="m-0 font-semibold">{site.name} ({site.state})</p>
          </div>
          <div className="text-right">
            <p className="m-0">Document ref: REG-CHEM-{site.code}-{year}</p>
            <p className="m-0">Printed {formatDate(new Date())}</p>
            <p className="m-0">Review year: {year}</p>
          </div>
        </header>
        <p className="mt-0 mb-1"><strong>Legislation:</strong> {rules.register}.</p>
        <p className="mt-0 mb-3">This register lists the hazardous chemicals and dangerous goods stored, handled or used at {site.name}. Current safety data sheets (issued within the last 5 years) must be readily accessible to workers and emergency services. Quantities are from the latest stocktake.</p>
        {SECTIONS.map(section => {
          const rows = chems.filter(c => c.section === section);
          if (!rows.length) return null;
          return (
            <section key={section} className="mb-4 break-inside-avoid-page">
              <h2 className="m-0 mb-1 text-[13px] font-bold uppercase bg-[#F1EEEA] px-1.5 py-1">{section}</h2>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left">
                    {['#', 'Product', 'Manufacturer', 'DG class / hazard', 'UN', 'Storage location', 'Quantity', 'SDS issued'].map(h => <th key={h} scope="col" className={`${cell} bg-[#FAFAF9]`}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.flatMap(c =>
                    stock.filter(s => s.chemical_id === c.id).map(s => {
                      n += 1;
                      const sds = reg.currentSdsOf(c.id);
                      return (
                        <tr key={s.id}>
                          <td className={cell}>{n}</td>
                          <td className={cell}>{c.name}</td>
                          <td className={cell}>{c.manufacturer}</td>
                          <td className={cell}>{classLabel(c)}{c.hazard_summary && !c.dg_class ? ` · ${c.hazard_summary}` : ''}</td>
                          <td className={cell}>{c.un_number ?? ''}</td>
                          <td className={cell}>{s.location}</td>
                          <td className={cell}>{formatAmount(amountOf(s), s.unit)}</td>
                          <td className={cell}>{sds ? formatDay(sds.issue_date) : 'MISSING'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </section>
          );
        })}
        <footer className="mt-4 pt-2 border-t border-[#BDB7AE] text-[11px] text-muted flex justify-between">
          <span>Finlay Screening &amp; Crushing · {site.name}</span>
          <span>REG-CHEM-{site.code}-{year} · SDS validity &lt; 5 years</span>
        </footer>
      </article>
    </div>
  );
}

// ---------------------------------------------------------------------------------
// Bulk SDS upload: drop a folder's PDFs, check the matches, upload
// ---------------------------------------------------------------------------------

interface Pending {
  file: File;
  chemicalId: string;
  score: number;
  issueDate: string;
  status: 'ready' | 'done' | 'error' | 'skip';
  message?: string;
}

function BulkSdsUpload({ user }: { user: WhsUser }) {
  const reg = useRegister();
  const [items, setItems] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);

  if (!isOfficeAccess(user.access)) return <ErrorNote message="Only office roles can upload SDS files." />;

  function addFiles(files: File[]) {
    const pdfs = files.filter(f => /\.pdf$/i.test(f.name) && !/old safety data sheets/i.test((f as File & { webkitRelativePath?: string }).webkitRelativePath ?? ''));
    setItems(prev => [
      ...prev,
      ...pdfs.map(file => {
        const m = matchSdsFile(file.name, reg.chemicals);
        const ok = m && m.score >= 0.5;
        return { file, chemicalId: ok ? m.id : '', score: m?.score ?? 0, issueDate: issueDateFromName(file.name) ?? '', status: (ok ? 'ready' : 'skip') as Pending['status'] };
      }),
    ]);
  }

  const update = (i: number, patch: Partial<Pending>) => setItems(prev => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function uploadAll(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.status !== 'ready') continue;
      if (!it.chemicalId || !it.issueDate) {
        update(i, { status: 'error', message: !it.chemicalId ? 'Choose the product' : 'Enter the issue date' });
        continue;
      }
      const res = await uploadSds(it.chemicalId, it.file, it.issueDate);
      update(i, res.error ? { status: 'error', message: res.error } : { status: 'done', message: 'Uploaded' });
    }
    setBusy(false);
    reg.reload();
  }

  const ready = items.filter(i => i.status === 'ready');
  const missingDates = ready.filter(i => !i.issueDate).length;
  const stillMissing = reg.chemicals.filter(c => c.active && !reg.currentSdsOf(c.id)).length;

  return (
    <form onSubmit={uploadAll} className="flex flex-col gap-4 max-w-[1100px]">
      {back}
      <div>
        <h1 className="m-0 text-2xl font-bold">Upload SDS files</h1>
        <p className="mt-1.5 mb-0 text-muted text-[15px]">Choose a folder (for example I:\Safety Data Sheets\Oil &amp; Grease) or several PDFs. Each file is matched to a product by its name; check the matches and the issue dates, then upload. "Old Safety Data Sheets" folders are skipped. {stillMissing} product(s) still have no SDS.</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <label className="min-h-11 px-4 rounded-lg bg-ink text-white text-sm font-semibold cursor-pointer flex items-center">
          Choose a folder
          {/* webkitdirectory lets people pick a whole folder */}
          <input type="file" multiple accept="application/pdf" className="sr-only" {...({ webkitdirectory: '' } as Record<string, string>)} onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        </label>
        <label className="min-h-11 px-4 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold cursor-pointer flex items-center">
          Choose PDF files
          <input type="file" multiple accept="application/pdf" className="sr-only" onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        </label>
        {items.length > 0 && <button type="button" onClick={() => setItems([])} className="min-h-11 px-3 rounded-lg border-0 bg-transparent text-sm cursor-pointer underline">Clear list</button>}
      </div>

      {items.length > 0 && (
        <section className="bg-white border border-line rounded-xl overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[900px]">
            <thead>
              <tr className="text-muted text-xs text-left">
                <th scope="col" className="px-4 py-2.5 font-semibold border-b border-[#EEEBE6]">File</th>
                <th scope="col" className="px-2 py-2.5 font-semibold border-b border-[#EEEBE6]">Product</th>
                <th scope="col" className="px-2 py-2.5 font-semibold border-b border-[#EEEBE6]">Issue date (on the SDS)</th>
                <th scope="col" className="px-4 py-2.5 font-semibold border-b border-[#EEEBE6]">Upload?</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const current = it.chemicalId ? reg.currentSdsOf(it.chemicalId) : null;
                return (
                  <tr key={`${it.file.name}-${i}`} className={it.status === 'done' ? 'bg-[#F3FAF5]' : it.status === 'error' ? 'bg-[#FFF6F6]' : ''}>
                    <td className="px-4 py-2 border-b border-line-soft break-all">{it.file.name}{it.score > 0 && it.score < 0.5 && it.status === 'skip' ? <span className="block text-xs text-[#7A4A00]">No sure match: choose the product to include it</span> : null}</td>
                    <td className="px-2 py-2 border-b border-line-soft">
                      <select aria-label={`Product for ${it.file.name}`} value={it.chemicalId} disabled={it.status === 'done'}
                        onChange={e => update(i, { chemicalId: e.target.value, status: e.target.value ? 'ready' : 'skip' })}
                        className="min-h-10 max-w-[320px] rounded-lg border border-[#D6D2CC] bg-white px-2 text-[13px]">
                        <option value="">Not matched</option>
                        {reg.chemicals.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {current && it.status !== 'done' && <span className="block text-xs text-muted mt-0.5">Current SDS issued {formatDay(current.issue_date)}</span>}
                    </td>
                    <td className="px-2 py-2 border-b border-line-soft">
                      <input type="date" aria-label={`Issue date for ${it.file.name}`} value={it.issueDate} disabled={it.status === 'done'} onChange={e => update(i, { issueDate: e.target.value })}
                        className="min-h-10 rounded-lg border border-[#D6D2CC] bg-white px-2 text-[13px]" />
                    </td>
                    <td className="px-4 py-2 border-b border-line-soft whitespace-nowrap">
                      {it.status === 'done' ? <Pill tone="green">Uploaded</Pill> : it.status === 'error' ? <span className="text-[13px] text-[#8E0F15]">{it.message}</span> : (
                        <label className="flex gap-2 items-center text-[13px] cursor-pointer">
                          <input type="checkbox" checked={it.status === 'ready'} disabled={!it.chemicalId} onChange={e => update(i, { status: e.target.checked ? 'ready' : 'skip' })} className="w-5 h-5" /> Upload
                        </label>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap gap-3 items-center">
          <button type="submit" disabled={busy || !ready.length} className="min-h-12 px-5 rounded-lg border-0 bg-finlay text-white font-semibold cursor-pointer disabled:opacity-50">
            {busy ? 'Uploading…' : `Upload ${ready.length} file(s)`}
          </button>
          {missingDates > 0 && <span className="text-sm text-[#7A4A00]">{missingDates} file(s) need the issue date from the SDS (usually on page 1 or the last page).</span>}
        </div>
      )}
    </form>
  );
}
