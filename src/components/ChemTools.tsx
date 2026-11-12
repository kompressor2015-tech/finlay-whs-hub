import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { WhsUser } from '../services/auth.ts';
import { authoriseStocktake, finishStocktake, getStocktake, listStocktakes, openSds, recordCount, updateSite, uploadSds } from '../services/chemicals.ts';
import { photoLinks, uploadPhotos } from '../services/records.ts';
import { rememberSite, rememberedSite, useRegister } from '../hooks/useRegister.ts';
import { go, hrefFor } from '../hooks/useRoute.ts';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { isOfficeAccess } from '../utils/access.ts';
import { brisbaneDay, formatDate, formatDay, formatWhen } from '../utils/dates.ts';
import { looseMatch } from '../utils/search.ts';
import {
  SECTIONS, WARN_AT, amountOf, classLabel, classTone, formatAmount, issueDateFromName, matchSdsFile, sdsPill, siteTotals, stateRules, stocktakeDue, worstLine,
  type Stock,
} from '../utils/chemicals.ts';
import {
  FREQUENCIES, buildSheet, classToConfirm, countedThisRound, frequencyLabel, roundProgress, sheetTotals, snapshotLines, stocktakeRef, type Stocktake,
} from '../utils/stocktakes.ts';
import { SignaturePad } from './SignaturePad.tsx';
import { ErrorNote } from './Form.tsx';
import { Pill } from './Pill.tsx';

/** Routes #/chem/<tool> to the right screen. */
export function ChemTool({ tool, user }: { tool: string; user: WhsUser }) {
  if (tool === 'find-sds') return <FindSds />;
  if (tool === 'upload-sds') return <BulkSdsUpload user={user} />;
  if (tool === 'stocktake') return <StocktakePicker />;
  const m = /^(totals|stocktake|print|sheet)-([a-z0-9_-]+)$/.exec(tool);
  if (m?.[1] === 'totals') return <FollowSwitcher tool="totals"><SiteTotals siteId={m[2]} /></FollowSwitcher>;
  if (m?.[1] === 'stocktake') return <Stocktake siteId={m[2]} user={user} />;
  if (m?.[1] === 'sheet') return <StocktakeSheet id={m[2]} user={user} />;
  if (m?.[1] === 'print') return <FollowSwitcher tool="print"><PrintRegister siteId={m[2]} /></FollowSwitcher>;
  return <ErrorNote message="Page not found." />;
}

/**
 * The site switcher at the top changes which site these pages show: pick another site and the page
 * moves to it (All sites goes back to the register). Only a change made while the page is open counts,
 * so a link straight to one site's totals still opens that site.
 */
function FollowSwitcher({ tool, children }: { tool: 'totals' | 'print'; children: ReactNode }) {
  const scope = useSiteScope();
  const current = scope.site?.id ?? 'all';
  const first = useRef(current);
  useEffect(() => {
    if (current === first.current) return;
    first.current = current;
    go(current === 'all' ? { name: 'module', id: 'chemicals' } : { name: 'chem', id: `${tool}-${current}` });
  }, [current, tool]);
  return <>{children}</>;
}

// ---------------------------------------------------------------------------------
// Pick a site to count (the phone's way in to stocktakes)
// ---------------------------------------------------------------------------------

function StocktakePicker() {
  const reg = useRegister();
  return (
    <div className="flex flex-col gap-3 max-w-[560px]">
      <h1 className="m-0 text-xl font-bold">Chemical stocktake</h1>
      <p className="m-0 text-[13px] text-muted">Pick the site you are counting.</p>
      <ErrorNote message={reg.error} />
      {!reg.loaded && <p className="m-0 text-sm text-muted">Loading…</p>}
      {reg.sites.map(site => {
        const stock = reg.stock.filter(s => s.site_id === site.id);
        const take = stocktakeDue(site, stock);
        const tone = take.state === 'overdue' ? 'red' : take.state === 'due_soon' || take.state === 'never' ? 'amber' : 'green';
        const label = take.state === 'never' ? 'First stocktake' : take.state === 'overdue' ? 'Overdue' : `Due ${formatDay(take.due)}`;
        return (
          <a key={site.id} href={hrefFor({ name: 'chem', id: `stocktake-${site.id}` })} onClick={() => rememberSite(site.id)}
            className="no-underline text-ink bg-white border border-line rounded-xl p-3.5 min-h-16 flex items-center gap-3">
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-semibold">{site.name}</span>
              <span className="block text-[13px] text-muted mt-0.5">{site.state} · {stock.length} items</span>
            </span>
            <Pill tone={tone}>{label}</Pill>
          </a>
        );
      })}
    </div>
  );
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
  const unconfirmed = reg.chemicals.filter(c => c.active && classToConfirm(c) && stock.some(s => s.chemical_id === c.id));

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

      {unconfirmed.length > 0 && (
        <section className="bg-[#FFF1D6] border border-[#F2D9A6] rounded-xl px-4.5 py-3.5 text-sm leading-relaxed text-[#4A3200]">
          <strong>{unconfirmed.length} product(s) are not in these totals yet: DG class to confirm.</strong> Enter each class from section 14 of its SDS. If any of them is a dangerous good, the totals below are too low until then.
          <span className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {unconfirmed.map(c => <a key={c.id} href={hrefFor({ name: 'chemical', id: c.id })} className="text-[#4A3200] font-semibold">{c.name}</a>)}
          </span>
        </section>
      )}

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

function Stocktake({ siteId, user }: { siteId: string; user: WhsUser }) {
  const reg = useRegister();
  const officer = user.access === 'admin' || user.access === 'whs_officer';
  const site = reg.sites.find(s => s.id === siteId);
  const stock = reg.stock.filter(s => s.site_id === siteId);
  const locations = Array.from(new Set(stock.map(s => s.location))).sort();
  const [loc, setLoc] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [past, setPast] = useState<Stocktake[] | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    listStocktakes(siteId).then(res => setPast(res.data ?? []));
  }, [siteId]);

  const lastDone = past?.[0]?.done_at ?? null;

  useEffect(() => {
    if (!loc && locations.length && past) {
      const firstLeft = locations.find(l => stock.some(s => s.location === l && !countedThisRound(s, lastDone)));
      setLoc(firstLeft ?? locations[0]);
    }
  }, [locations, loc, stock, past, lastDone]);

  if (!site) return reg.loaded ? <ErrorNote message="Site not found." /> : <p className="text-sm text-muted">Loading…</p>;
  const here = stock.filter(s => s.location === loc);
  const done = (s: Stock) => s.id in counts || countedThisRound(s, lastDone);
  const take = stocktakeDue(site, stock);
  const round = roundProgress(stock, lastDone);
  const unsaved = Object.keys(counts).length;

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
    setSaved(`Saved ${unsaved} count(s) for ${loc}.`);
    setCounts({});
    await reg.reload();
    const next = locations[locations.indexOf(loc) + 1];
    if (next) setLoc(next);
  }

  async function finish() {
    if (round.left.length && !notes.trim()) return setError('Say why some items were not counted.');
    setBusy(true);
    setError(null);
    const res = await finishStocktake(siteId, snapshotLines(stock, reg.chemById), notes.trim());
    setBusy(false);
    if (res.error || !res.data) return setError(res.error ?? 'Could not finish the stocktake.');
    go({ name: 'chem', id: `sheet-${res.data.id}` });
  }

  async function changeFrequency(days: number) {
    const res = await updateSite(siteId, { stocktake_days: days });
    if (res.error) setError(res.error);
    else reg.reload();
  }

  return (
    <div className="flex flex-col gap-3 max-w-[560px]">
      {back}
      <div>
        <h1 className="m-0 text-xl font-bold">Stocktake: {site.name}</h1>
        <p className="mt-1 mb-0 text-[13px] text-muted">
          {frequencyLabel(site.stocktake_days)} · {take.state === 'never' ? 'first stocktake' : `next due ${formatDay(take.due)}`}. Count the containers; the app works out the litres or kilograms.
        </p>
        {officer && (
          <label className="mt-2 flex items-center gap-2 text-[13px]">
            <span className="text-muted">How often:</span>
            <select value={site.stocktake_days} onChange={e => changeFrequency(Number(e.target.value))} className="min-h-10 rounded-lg border border-[#D6D2CC] bg-white px-2 text-[13px]">
              {[...FREQUENCIES, ...(FREQUENCIES.some(f => f.days === site.stocktake_days) ? [] : [{ days: site.stocktake_days, label: frequencyLabel(site.stocktake_days) }])].map(f => <option key={f.days} value={f.days}>{f.label}</option>)}
            </select>
          </label>
        )}
      </div>
      <label htmlFor="st-loc" className="text-sm font-medium">Location</label>
      <select id="st-loc" value={loc} onChange={e => { setLoc(e.target.value); setSaved(null); }} className="min-h-12 rounded-[10px] border border-[#D6D2CC] bg-white px-3 text-[15px]">
        {locations.map(l => {
          const left = stock.filter(s => s.location === l && !countedThisRound(s, lastDone)).length;
          return <option key={l} value={l}>{l}{left ? ` (${left} to count)` : ' (done)'}</option>;
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
                {c ? (classToConfirm(c) ? 'Class to confirm' : classLabel(c)) : ''} · {s.container || 'container not set'}{s.container_size ? ` (${s.container_size} ${s.unit})` : ''} · last {s.last_counted_at ? formatWhen(s.last_counted_at) : 'never'}
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
      {saved && <p role="status" className="m-0 text-sm text-[#1E6B3A] bg-[#E3F3E8] rounded-lg px-3 py-2.5">{saved}</p>}
      <button type="button" disabled={busy || !unsaved} onClick={save} className="min-h-[52px] rounded-xl border-0 bg-finlay text-white text-base font-bold cursor-pointer disabled:opacity-50">
        {busy ? 'Saving…' : `Save ${unsaved || ''} count(s)`}
      </button>

      <section className="mt-3 bg-white border border-line rounded-xl p-3.5 flex flex-col gap-2.5">
        <h2 className="m-0 text-[15px] font-semibold">Finish the stocktake</h2>
        <p className="m-0 text-[13px] text-muted">
          {round.counted} of {round.total} items counted this round{lastDone ? ` (since the last stocktake on ${formatDate(lastDone)})` : ''}. Finishing keeps a copy of every count as the stocktake sheet, ready to print and authorise.
        </p>
        {round.left.length > 0 && (
          <p className="m-0 text-[13px] text-[#4A3200] bg-[#FFF1D6] rounded-lg px-3 py-2">
            Still to count: {round.left.slice(0, 6).map(s => `${reg.chemById.get(s.chemical_id)?.name ?? ''} (${s.location})`).join(', ')}{round.left.length > 6 ? ` and ${round.left.length - 6} more` : ''}. Their last count will go on the sheet.
          </p>
        )}
        <label htmlFor="st-notes" className="text-sm font-medium">Notes{round.left.length ? ' (why some were not counted)' : ' (optional)'}</label>
        <textarea id="st-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="rounded-[10px] border border-[#D6D2CC] bg-white px-3 py-2 text-[15px]" />
        <ErrorNote message={error} />
        <button type="button" disabled={busy || unsaved > 0 || !round.total} onClick={finish}
          className="min-h-[52px] rounded-xl border-2 border-ink bg-white text-ink text-base font-bold cursor-pointer disabled:opacity-50">
          {unsaved ? 'Save the counts above first' : round.left.length ? `Finish with ${round.left.length} not counted` : 'Finish stocktake'}
        </button>
      </section>

      <section className="mb-6">
        <h2 className="m-0 mb-2 text-[15px] font-semibold">Past stocktakes</h2>
        <div className="bg-white border border-line rounded-xl overflow-hidden">
          {past === null ? <p className="m-0 p-3.5 text-sm text-muted">Loading…</p> : past.length === 0 ? (
            <p className="m-0 p-3.5 text-sm text-muted">None finished yet.</p>
          ) : past.map(t => (
            <a key={t.id} href={hrefFor({ name: 'chem', id: `sheet-${t.id}` })} className="no-underline text-ink flex items-center gap-3 px-3.5 py-3 min-h-14 border-b border-line-soft last:border-b-0">
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-medium">{formatDate(t.done_at)}</span>
                <span className="block text-[13px] text-muted">Counted by {t.counted_by_name || 'unknown'}{t.authorised_at ? ` · authorised by ${t.authorised_by_name}` : ''}</span>
              </span>
              {t.authorised_at ? <Pill tone="green">Authorised</Pill> : <Pill tone="amber">To authorise</Pill>}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------
// Stocktake sheet: printable, in the layout of the old Monthly Dangerous Goods Audit
// ---------------------------------------------------------------------------------

function StocktakeSheet({ id, user }: { id: string; user: WhsUser }) {
  const reg = useRegister();
  const office = isOfficeAccess(user.access);
  const [st, setSt] = useState<Stocktake | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getStocktake(id).then(res => (res.data ? setSt(res.data) : setError(res.error ?? 'Stocktake not found.')));
  }, [id]);

  useEffect(() => {
    if (st?.authorised_signature) photoLinks([st.authorised_signature]).then(urls => setSigUrl(urls[0] ?? null));
  }, [st?.authorised_signature]);

  const sheet = useMemo(() => (st ? buildSheet(st.lines) : null), [st]);
  const site = st ? reg.sites.find(s => s.id === st.site_id) : undefined;

  if (error && !st) return <ErrorNote message={error} />;
  if (!st || !sheet || !site) return <p className="text-sm text-muted">Loading…</p>;

  const worst = worstLine(sheetTotals(site.state, st.lines));
  const ref = stocktakeRef(site.code, st.done_at, brisbaneDay);
  const cols = Array.from({ length: sheet.columns }, (_, i) => i);
  const cell = 'border border-[#BDB7AE] px-1.5 py-1 align-top';
  const num = `${cell} text-right tabular-nums`;
  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toLocaleString('en-AU', { maximumFractionDigits: 1 }));

  async function authorise() {
    if (!signature) return setError('Sign in the box first.');
    setBusy(true);
    setError(null);
    const up = await uploadPhotos([signature]);
    if (up.error || !up.data?.[0]) {
      setBusy(false);
      return setError(up.error ?? 'Could not save the signature.');
    }
    const res = await authoriseStocktake(id, up.data[0]);
    setBusy(false);
    if (res.error || !res.data) return setError(res.error ?? 'Could not authorise.');
    setSt(res.data);
  }

  return (
    <div className="flex flex-col gap-3 max-w-[1100px] print:max-w-none">
      <div className="print:hidden flex gap-2 items-center flex-wrap">
        <a href={hrefFor({ name: 'chem', id: `stocktake-${site.id}` })} className="text-sm no-underline text-muted">← Stocktake: {site.name}</a>
        <button type="button" onClick={() => window.print()} className="ml-auto min-h-11 px-4 rounded-lg border-0 bg-finlay text-white text-sm font-semibold cursor-pointer">Print or save as PDF</button>
        <span className="basis-full text-right text-xs text-muted">For a PDF file, choose "Save as PDF" as the printer in the print window.</span>
      </div>

      {!st.authorised_at && (
        <section className="print:hidden bg-white border border-line rounded-xl p-4 flex flex-col gap-3">
          <h2 className="m-0 text-[15px] font-semibold">Authorise this stocktake</h2>
          {office ? (
            <>
              <p className="m-0 text-sm text-muted">Check the counts below, then sign. Once authorised the sheet can't be changed.</p>
              <div className="max-w-[460px]"><SignaturePad label={`Signature: ${user.name}`} onChange={setSignature} /></div>
              <ErrorNote message={error} />
              <button type="button" disabled={busy || !signature} onClick={authorise} className="self-start min-h-12 px-5 rounded-lg border-0 bg-finlay text-white font-semibold cursor-pointer disabled:opacity-50">
                {busy ? 'Saving…' : 'Authorise stocktake'}
              </button>
            </>
          ) : (
            <p className="m-0 text-sm text-muted">Waiting for a supervisor or the WHS officer to check and sign it.</p>
          )}
        </section>
      )}

      <article className="bg-white p-6 print:p-0 text-[12px] leading-snug">
        <header className="flex justify-between items-start gap-4 border-b-2 border-finlay pb-3 mb-3">
          <div>
            <img src="/finlay-banner.jpg" alt="Finlay" className="h-10 w-auto block mb-2" />
            <p className="m-0 font-semibold">Finlay Screening and Crushing Systems Pty Ltd</p>
            <h1 className="m-0 text-lg font-bold">CHEMICAL &amp; DANGEROUS GOODS STOCKTAKE</h1>
          </div>
          <div className="text-right">
            <p className="m-0">Ref: {ref}</p>
            <p className="m-0"><strong>Area:</strong> {site.name} ({site.state})</p>
            <p className="m-0"><strong>Date:</strong> {formatDate(st.done_at)}</p>
            <p className="m-0"><strong>Conducted by:</strong> {st.counted_by_name}</p>
            <p className="m-0">{frequencyLabel(site.stocktake_days)}</p>
          </div>
        </header>

        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left">
              <th scope="col" className={`${cell} bg-[#FAFAF9]`}>Product</th>
              {cols.map(i => (
                <Fragment key={i}>
                  <th scope="col" className={`${cell} bg-[#FAFAF9] text-right`}>Cont (L/kg)</th>
                  <th scope="col" className={`${cell} bg-[#FAFAF9] text-right`}>Qty</th>
                  <th scope="col" className={`${cell} bg-[#FAFAF9] text-right`}>Subtotal</th>
                </Fragment>
              ))}
              <th scope="col" className={`${cell} bg-[#FAFAF9] text-right`}>Total</th>
            </tr>
          </thead>
          <tbody>
            {sheet.sections.map(sec => (
              <Fragment key={sec.section}>
                <tr><th scope="rowgroup" colSpan={sheet.columns * 3 + 2} className={`${cell} text-left uppercase bg-[#F1EEEA]`}>{sec.letter}. {sec.section}</th></tr>
                {sec.rows.map(r => (
                  <tr key={r.chemical_id} className="break-inside-avoid">
                    <td className={cell}>
                      <span className="font-semibold">{r.name}</span>
                      <span className="block text-[10px] text-muted">{r.class_confirmed ? r.class_label : 'CLASS TO CONFIRM'} · {r.locations.join(', ')}</span>
                    </td>
                    {cols.map(i => {
                      const g = r.groups[i];
                      return (
                        <Fragment key={i}>
                          <td className={num}>{g ? (g.size === null ? 'size?' : fmt(g.size)) : ''}</td>
                          <td className={num}>{g ? (g.qty === null ? 'not counted' : fmt(g.qty)) : ''}</td>
                          <td className={num}>{fmt(g?.subtotal)}</td>
                        </Fragment>
                      );
                    })}
                    <td className={`${num} font-semibold`}>{fmt(r.total)}</td>
                  </tr>
                ))}
                <tr>
                  <td className={`${cell} text-right font-semibold`} colSpan={sheet.columns * 3 + 1}>{sec.letter}. total</td>
                  <td className={`${num} font-semibold`}>{fmt(sec.total)}</td>
                </tr>
              </Fragment>
            ))}
            <tr className="bg-[#F1EEEA] font-bold">
              <td className={cell}>Grand total</td>
              {cols.map(i => (
                <Fragment key={i}>
                  <td className={cell} /><td className={cell} />
                  <td className={num}>{fmt(sheet.columnTotals[i])}</td>
                </Fragment>
              ))}
              <td className={num}>{fmt(sheet.grandTotal)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-3 flex flex-col gap-1 break-inside-avoid">
          <p className="m-0">
            <strong>Against the manifest quantities ({stateRules(site.state).thresholds}):</strong>{' '}
            {worst ? `highest is ${worst.label.split(',')[0]} at ${Math.round(worst.pctManifest * 100)}% (${worst.total.toLocaleString('en-AU')} of ${worst.manifest.toLocaleString('en-AU')} ${worst.unit}): ${worst.status === 'over' ? 'OVER, a manifest and notification are required' : worst.status === 'close' ? 'under, but close' : 'under'}.` : 'no dangerous goods or C1 liquids counted.'}
          </p>
          {sheet.toConfirm > 0 && <p className="m-0">{sheet.toConfirm} product(s) had the DG class still to confirm and are not in that check.</p>}
          {sheet.incomplete > 0 && <p className="m-0">{sheet.incomplete} item(s) not counted or with no container size are not in the totals.</p>}
          {st.notes && <p className="m-0"><strong>Notes:</strong> {st.notes}</p>}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-8 break-inside-avoid">
          <div>
            <p className="m-0"><strong>Count done by:</strong> {st.counted_by_name}</p>
            <p className="m-0 text-muted">{formatDate(st.done_at)}</p>
          </div>
          <div>
            <p className="m-0"><strong>Authorised:</strong> {st.authorised_at ? `${st.authorised_by_name}, ${formatDate(st.authorised_at)}` : ''}</p>
            {sigUrl ? <img src={sigUrl} alt={`Signature of ${st.authorised_by_name}`} className="mt-1 h-16 max-w-full object-contain" /> : <div className="mt-6 border-b border-ink w-64" aria-hidden="true" />}
          </div>
        </div>

        <footer className="mt-4 pt-2 border-t border-[#BDB7AE] text-[11px] text-muted flex justify-between">
          <span>Finlay Screening &amp; Crushing · {site.name}</span>
          <span>{ref} · {sheet.items} item(s) counted</span>
        </footer>
      </article>
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
        <span className="basis-full text-right text-xs text-muted">For a PDF file, choose "Save as PDF" as the printer in the print window.</span>
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
            <section key={section} className="mb-4">
              <h2 className="m-0 mb-1 text-[13px] font-bold uppercase bg-[#F1EEEA] px-1.5 py-1 break-after-avoid">{section}</h2>
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
                        <tr key={s.id} className="break-inside-avoid">
                          <td className={cell}>{n}</td>
                          <td className={cell}>{c.name}</td>
                          <td className={cell}>{c.manufacturer}</td>
                          <td className={cell}>{classToConfirm(c) ? <strong>CLASS TO CONFIRM FROM SDS</strong> : classLabel(c)}{c.hazard_summary && !c.dg_class ? ` · ${c.hazard_summary}` : ''}</td>
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
