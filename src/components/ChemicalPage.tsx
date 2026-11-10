import { useEffect, useState, type FormEvent } from 'react';
import type { WhsUser } from '../services/auth.ts';
import { addStock, createChemical, deleteStock, openSds, updateChemical, updateStock, uploadSds, type ChemicalInput } from '../services/chemicals.ts';
import { useRegister } from '../hooks/useRegister.ts';
import { go, hrefFor } from '../hooks/useRoute.ts';
import { isOfficeAccess } from '../utils/access.ts';
import { formatDay, formatWhen } from '../utils/dates.ts';
import {
  SECTIONS, amountOf, classLabel, classTone, formatAmount, issueDateFromName, sdsPill, sdsValidUntil, type Chemical, type DgClass, type PackingGroup, type Stock,
} from '../utils/chemicals.ts';
import { ErrorNote, Field, inputClass, textareaClass } from './Form.tsx';
import { Pill } from './Pill.tsx';

const CLASSES: DgClass[] = ['2.1', '2.2', '2.3', '3', '4.1', '4.2', '4.3', '5.1', '5.2', '6.1', '8', '9'];
const card = 'bg-white border border-line rounded-xl';
const small = 'min-h-10 rounded-lg border border-[#D6D2CC] bg-white px-2.5 text-sm';

const BLANK: ChemicalInput = {
  name: '', manufacturer: '', dg_class: null, subsidiary: '', packing_group: null, un_number: null, aerosol: false, combustible: null, ghs_hazardous: null,
  hazard_summary: '', h_statements: [], ppe: [], first_aid: '', spill: '', supplier_phone: '', section: SECTIONS[2], notes: '', active: true,
};

/** One chemical: hazards, where it's kept at every site, and its SDS versions. */
export function ChemicalPage({ id, user }: { id: string; user: WhsUser }) {
  const office = isOfficeAccess(user.access);
  const officer = user.access === 'admin' || user.access === 'whs_officer';
  const reg = useRegister();
  const chem = id === 'new' ? null : reg.chemById.get(id) ?? null;
  const [editing, setEditing] = useState(id === 'new');

  if (id !== 'new' && reg.loaded && !chem) return <ErrorNote message={reg.error ?? 'Chemical not found.'} />;
  if (id !== 'new' && !chem) return <p className="text-sm text-muted">Loading…</p>;

  if (editing || !chem) {
    return <ChemicalForm chem={chem} onDone={saved => { setEditing(false); if (!chem) go({ name: 'chemical', id: saved.id }); else reg.reload(); }} onCancel={() => (chem ? setEditing(false) : go({ name: 'module', id: 'chemicals' }))} />;
  }

  const sdsList = reg.sdsByChem.get(chem.id) ?? [];
  const current = reg.currentSdsOf(chem.id);
  const pill = sdsPill(current);
  const stock = reg.stock.filter(s => s.chemical_id === chem.id);

  return (
    <div className="flex flex-col gap-5 max-w-[1200px]">
      <a href={hrefFor({ name: 'module', id: 'chemicals' })} className="text-sm no-underline text-muted">← Chemical register</a>
      <div className="flex flex-wrap justify-between gap-4 items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2 items-center">
            {chem.un_number && <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[#EEEBE6]">UN {chem.un_number}</span>}
            <Pill tone={classTone(chem)}>{classLabel(chem)}</Pill>
            <Pill tone={pill.tone}>{pill.label}</Pill>
            {!chem.active && <Pill tone="grey">No longer used</Pill>}
          </div>
          <h1 className="mt-2 mb-0 text-2xl font-bold">{chem.name}</h1>
          <p className="mt-1.5 mb-0 text-muted text-[15px]">{chem.manufacturer}{chem.hazard_summary ? ` · ${chem.hazard_summary}` : ''}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {office && <button type="button" onClick={() => setEditing(true)} className="min-h-11 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold cursor-pointer">Edit</button>}
          {current && <button type="button" onClick={() => openSds(current.file_path)} className="min-h-11 px-4 rounded-lg border-0 bg-ink text-white text-sm font-semibold cursor-pointer">Open SDS</button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-5 items-start">
        <div className="flex-[2_1_560px] min-w-0 flex flex-col gap-5">
          <StockPanel chem={chem} stock={stock} sites={reg.sites} allStock={reg.stock} office={office} officer={officer} onChanged={reg.reload} />

          <section className={`${card} px-4.5 py-4 flex flex-col gap-2.5`}>
            <h2 className="m-0 text-[17px] font-semibold">Hazards (from the SDS)</h2>
            {chem.h_statements.length ? chem.h_statements.map(h => (
              <div key={h} className="text-sm px-3 py-2 rounded-lg bg-[#FFF6F6] border border-[#F3C9CB] text-[#8E0F15]">{h}</div>
            )) : <p className="m-0 text-sm text-muted">Not entered yet. Copy the H-statements from section 2 of the SDS{office ? ' using Edit' : ''}.</p>}
          </section>

          <section className={`${card} px-4.5 py-4 flex flex-col gap-2.5`}>
            <h2 className="m-0 text-[17px] font-semibold">PPE when handling</h2>
            {chem.ppe.length ? <div className="flex flex-wrap gap-2">{chem.ppe.map(p => <Pill key={p} tone="blue">{p}</Pill>)}</div> : <p className="m-0 text-sm text-muted">Not entered yet (SDS section 8).</p>}
          </section>

          <section className={`${card} px-4.5 py-4`}>
            <h2 className="mt-0 mb-2 text-[17px] font-semibold">First aid &amp; spills</h2>
            <p className="mt-0 mb-1.5 text-sm leading-relaxed whitespace-pre-line"><strong>First aid:</strong> {chem.first_aid || 'See SDS section 4.'}</p>
            <p className="m-0 text-sm leading-relaxed whitespace-pre-line"><strong>Spill:</strong> {chem.spill || 'See SDS section 6.'}</p>
            <p className="mt-2 mb-0 text-sm"><a href="tel:131126" className="font-semibold">Poisons Information 13 11 26</a>{chem.supplier_phone ? <> · Supplier <a href={`tel:${chem.supplier_phone.replace(/\s/g, '')}`}>{chem.supplier_phone}</a></> : null}</p>
          </section>
        </div>

        <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-5">
          <section className={`${card} px-4.5 py-4`}>
            <h2 className="mt-0 mb-2.5 text-[15px] font-semibold">Classification</h2>
            <dl className="m-0 flex flex-col gap-2.5 text-sm">
              <div><dt className="text-muted text-[13px]">Dangerous goods</dt><dd className="mt-0.5 ml-0 font-medium">{chem.dg_class ? `${classLabel(chem)}${chem.un_number ? `, UN ${chem.un_number}` : ''}` : chem.combustible ? `${chem.combustible} combustible liquid` : 'Not a dangerous good'}</dd></div>
              {chem.dg_class && !chem.packing_group && !chem.dg_class.startsWith('2') && chem.dg_class !== '9' && (
                <div className="text-[13px] text-[#7A4A00] bg-[#FFF1D6] rounded-lg px-2.5 py-2">Packing group not entered: counted as PG I (strictest) in site totals until the SDS is checked.</div>
              )}
              <div><dt className="text-muted text-[13px]">GHS hazardous chemical</dt><dd className="mt-0.5 ml-0 font-medium">{chem.ghs_hazardous === null ? 'Check the SDS' : chem.ghs_hazardous ? 'Yes' : 'No'}</dd></div>
              <div><dt className="text-muted text-[13px]">Register section</dt><dd className="mt-0.5 ml-0 font-medium">{chem.section}</dd></div>
              {chem.notes && <div><dt className="text-muted text-[13px]">Notes</dt><dd className="mt-0.5 ml-0 whitespace-pre-line">{chem.notes}</dd></div>}
            </dl>
          </section>

          <section className={`${card} overflow-hidden`}>
            <h2 className="m-0 px-4.5 py-3.5 border-b border-[#EEEBE6] text-[15px] font-semibold">SDS versions</h2>
            {sdsList.length === 0 && <p className="m-0 px-4.5 py-3.5 text-sm text-muted">No SDS uploaded yet.</p>}
            {sdsList.map((s, i) => (
              <div key={s.id} className="px-4.5 py-3 border-b border-line-soft text-sm flex justify-between gap-2.5">
                <span className="min-w-0">
                  <strong>Issued {formatDay(s.issue_date)}</strong>
                  <span className="block text-xs text-muted break-words">{i === 0 ? `Current · valid to ${formatDay(sdsValidUntil(s.issue_date))}` : 'Replaced · kept for records'} · {s.file_name} · uploaded {formatWhen(s.uploaded_at)} by {s.uploaded_by_name}</span>
                </span>
                <button type="button" onClick={() => openSds(s.file_path)} className="bg-transparent border-0 text-[13px] font-semibold text-ink underline cursor-pointer whitespace-nowrap min-h-10">Open</button>
              </div>
            ))}
            {office && <SdsUpload chemId={chem.id} onDone={reg.reload} />}
          </section>
        </div>
      </div>
    </div>
  );
}

function SdsUpload({ chemId, onDone }: { chemId: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return setError('Choose the SDS PDF.');
    if (!date) return setError('Enter the issue date printed on the SDS.');
    setBusy(true);
    const res = await uploadSds(chemId, file, date);
    setBusy(false);
    if (res.error) return setError(res.error);
    setFile(null);
    setDate('');
    setError(null);
    onDone();
  }
  return (
    <form onSubmit={submit} className="px-4.5 py-3.5 flex flex-col gap-2.5 bg-[#FAFAF9]">
      <span className="text-sm font-semibold">Upload a new SDS</span>
      <input type="file" accept="application/pdf" aria-label="SDS PDF" className="text-sm" onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !date) setDate(issueDateFromName(f.name) ?? ''); }} />
      <Field label="Issue date (on the SDS)" htmlFor="sds-date"><input id="sds-date" type="date" className={`${inputClass} min-h-10`} value={date} onChange={e => setDate(e.target.value)} /></Field>
      <ErrorNote message={error} />
      <button type="submit" disabled={busy} className="self-start min-h-10 px-3.5 rounded-lg border-0 bg-finlay text-white text-sm font-semibold cursor-pointer disabled:opacity-60">{busy ? 'Uploading…' : 'Upload'}</button>
    </form>
  );
}

function StockPanel({ chem, stock, sites, allStock, office, officer, onChanged }: {
  chem: Chemical; stock: Stock[]; sites: { id: string; name: string; state: string }[]; allStock: Stock[]; office: boolean; officer: boolean; onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ site_id: sites[0]?.id ?? '', location: '', container: '', container_size: '', unit: 'L' as 'L' | 'kg', max_count: '' });
  useEffect(() => {
    if (!draft.site_id && sites[0]) setDraft(d => ({ ...d, site_id: sites[0].id }));
  }, [sites, draft.site_id]);
  const locations = Array.from(new Set(allStock.filter(s => s.site_id === draft.site_id).map(s => s.location))).sort();

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!draft.location.trim()) return setError('Say where it is kept.');
    const res = await addStock({
      chemical_id: chem.id, site_id: draft.site_id, location: draft.location.trim(), container: draft.container.trim(),
      container_size: draft.container_size ? Number(draft.container_size) : null, unit: draft.unit, max_count: draft.max_count ? Number(draft.max_count) : null,
    });
    if (res.error) return setError(res.error);
    setAdding(false);
    setError(null);
    onChanged();
  }

  return (
    <section className={`${card} overflow-x-auto`}>
      <div className="px-4.5 py-3.5 border-b border-[#EEEBE6] flex justify-between items-center gap-3">
        <h2 className="m-0 text-[17px] font-semibold">Where it's kept</h2>
        {office && !adding && <button type="button" onClick={() => setAdding(true)} className="bg-transparent border-0 text-sm font-semibold text-finlay cursor-pointer min-h-10">+ Add a location</button>}
      </div>
      <p className="m-0 px-4.5 pt-3 text-xs text-muted">Quantity = number of containers × container size. For gas cylinders, enter the cylinder's water capacity in litres (stamped on the cylinder or from the supplier).</p>
      <table className="w-full border-collapse text-sm min-w-[720px]">
        <thead>
          <tr className="text-muted text-xs text-left">
            <th scope="col" className="px-4.5 py-2.5 font-semibold border-b border-[#EEEBE6]">Site</th>
            <th scope="col" className="px-2 py-2.5 font-semibold border-b border-[#EEEBE6]">Location</th>
            <th scope="col" className="px-2 py-2.5 font-semibold border-b border-[#EEEBE6]">Container</th>
            <th scope="col" className="px-2 py-2.5 font-semibold border-b border-[#EEEBE6]">Count</th>
            <th scope="col" className="px-2 py-2.5 font-semibold border-b border-[#EEEBE6]">Quantity</th>
            <th scope="col" className="px-2 py-2.5 font-semibold border-b border-[#EEEBE6]">Max</th>
            <th scope="col" className="px-4.5 py-2.5 font-semibold border-b border-[#EEEBE6]">Last counted</th>
          </tr>
        </thead>
        <tbody>
          {stock.map(s => <StockRow key={s.id} s={s} site={sites.find(x => x.id === s.site_id)} office={office} officer={officer} onChanged={onChanged} />)}
        </tbody>
      </table>
      {stock.length === 0 && <p className="m-0 px-4.5 py-4 text-sm text-muted">Not stored at any site yet.</p>}
      {adding && (
        <form onSubmit={add} className="px-4.5 py-4 border-t border-line-soft bg-[#FAFAF9] grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Site" htmlFor="st-site">
            <select id="st-site" className={inputClass} value={draft.site_id} onChange={e => setDraft({ ...draft, site_id: e.target.value })}>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name} ({s.state})</option>)}
            </select>
          </Field>
          <Field label="Storage location" htmlFor="st-loc">
            <input id="st-loc" list="st-locs" className={inputClass} value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} />
            <datalist id="st-locs">{locations.map(l => <option key={l} value={l} />)}</datalist>
          </Field>
          <Field label="Container" htmlFor="st-cont" hint="e.g. 205 L drum, 4 L tin, G-size cylinder">
            <input id="st-cont" className={inputClass} value={draft.container} onChange={e => setDraft({ ...draft, container: e.target.value })} />
          </Field>
          <Field label="Container size" htmlFor="st-size">
            <span className="flex gap-2">
              <input id="st-size" inputMode="decimal" className={inputClass} value={draft.container_size} onChange={e => setDraft({ ...draft, container_size: e.target.value.replace(/[^0-9.]/g, '') })} />
              <select aria-label="Unit" className={`${inputClass} w-20`} value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value as 'L' | 'kg' })}><option>L</option><option>kg</option></select>
            </span>
          </Field>
          <Field label="Most containers kept here" htmlFor="st-max">
            <input id="st-max" inputMode="numeric" className={inputClass} value={draft.max_count} onChange={e => setDraft({ ...draft, max_count: e.target.value.replace(/[^0-9.]/g, '') })} />
          </Field>
          <div className="flex gap-2 items-end">
            <button type="submit" className="min-h-11 px-4 rounded-lg border-0 bg-finlay text-white text-sm font-semibold cursor-pointer">Add</button>
            <button type="button" onClick={() => setAdding(false)} className="min-h-11 px-4 rounded-lg border border-line bg-white text-sm font-semibold cursor-pointer">Cancel</button>
          </div>
          <div className="col-span-full"><ErrorNote message={error} /></div>
        </form>
      )}
    </section>
  );
}

function StockRow({ s, site, office, officer, onChanged }: { s: Stock; site?: { name: string; state: string }; office: boolean; officer: boolean; onChanged: () => void }) {
  const [edit, setEdit] = useState(false);
  const [container, setContainer] = useState(s.container);
  const [size, setSize] = useState(s.container_size === null ? '' : String(s.container_size));
  const [unit, setUnit] = useState(s.unit);
  const [max, setMax] = useState(s.max_count === null ? '' : String(s.max_count));
  const [error, setError] = useState<string | null>(null);
  const cell = 'px-2 py-2.5 border-b border-line-soft align-top';

  async function save() {
    const res = await updateStock(s.id, { container: container.trim(), container_size: size ? Number(size) : null, unit, max_count: max ? Number(max) : null });
    if (res.error) return setError(res.error);
    setEdit(false);
    onChanged();
  }
  async function remove() {
    if (!window.confirm(`Remove ${s.location} for this chemical? Its count history goes too.`)) return;
    const res = await deleteStock(s.id);
    if (res.error) return setError(res.error);
    onChanged();
  }

  return (
    <tr>
      <td className={`${cell} pl-4.5`}>{site?.name ?? s.site_id} <span className="text-xs text-muted">{site?.state}</span></td>
      <td className={`${cell} text-muted`}>{s.location}</td>
      <td className={cell}>
        {edit ? (
          <span className="flex flex-col gap-1.5">
            <input aria-label="Container" className={small} value={container} onChange={e => setContainer(e.target.value)} placeholder="e.g. 205 L drum" />
            <span className="flex gap-1.5">
              <input aria-label="Container size" inputMode="decimal" className={`${small} w-20`} value={size} onChange={e => setSize(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Size" />
              <select aria-label="Unit" className={small} value={unit} onChange={e => setUnit(e.target.value as 'L' | 'kg')}><option>L</option><option>kg</option></select>
            </span>
          </span>
        ) : (
          <>{s.container || '—'}{s.container_size ? <span className="text-muted"> ({s.container_size} {s.unit})</span> : <span className="text-[#7A4A00]"> (size needed)</span>}</>
        )}
      </td>
      <td className={cell}>{s.count ?? '—'}</td>
      <td className={`${cell} font-semibold whitespace-nowrap`}>{formatAmount(amountOf(s), s.unit)}</td>
      <td className={cell}>
        {edit ? <input aria-label="Most containers kept" inputMode="numeric" className={`${small} w-20`} value={max} onChange={e => setMax(e.target.value.replace(/[^0-9.]/g, ''))} /> : s.max_count ?? '—'}
      </td>
      <td className={`${cell} pr-4.5 text-muted`}>
        {s.last_counted_at ? `${formatWhen(s.last_counted_at)} · ${s.last_counted_by_name}` : 'Not counted'}
        {office && (
          <span className="flex gap-3 mt-1">
            {edit ? (
              <>
                <button type="button" onClick={save} className="bg-transparent border-0 p-0 text-[13px] font-semibold text-finlay cursor-pointer min-h-8">Save</button>
                <button type="button" onClick={() => setEdit(false)} className="bg-transparent border-0 p-0 text-[13px] cursor-pointer min-h-8">Cancel</button>
              </>
            ) : (
              <button type="button" onClick={() => setEdit(true)} className="bg-transparent border-0 p-0 text-[13px] font-semibold text-ink underline cursor-pointer min-h-8">Edit</button>
            )}
            {officer && !edit && <button type="button" onClick={remove} className="bg-transparent border-0 p-0 text-[13px] text-finlay underline cursor-pointer min-h-8">Remove</button>}
          </span>
        )}
        {error && <span className="block text-[#8E0F15] text-xs mt-1">{error}</span>}
      </td>
    </tr>
  );
}

function ChemicalForm({ chem, onDone, onCancel }: { chem: Chemical | null; onDone: (c: Chemical) => void; onCancel: () => void }) {
  const [f, setF] = useState<ChemicalInput>(() => (chem ? { ...BLANK, ...chem } : BLANK));
  const [hText, setHText] = useState((chem?.h_statements ?? []).join('\n'));
  const [ppeText, setPpeText] = useState((chem?.ppe ?? []).join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ChemicalInput>) => setF(prev => ({ ...prev, ...patch }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setError('Enter the product name.');
    setBusy(true);
    const input: ChemicalInput = {
      ...f,
      name: f.name.trim(),
      un_number: f.un_number?.trim() || null,
      h_statements: hText.split('\n').map(x => x.trim()).filter(Boolean),
      ppe: ppeText.split(',').map(x => x.trim()).filter(Boolean),
      aerosol: f.dg_class?.startsWith('2') ? f.aerosol : false,
      packing_group: f.dg_class && !f.dg_class.startsWith('2') ? f.packing_group : null,
    };
    const { id: _ignore, ...clean } = input as ChemicalInput & { id?: string };
    const res = chem ? await updateChemical(chem.id, clean) : await createChemical(clean);
    setBusy(false);
    if (res.error || !res.data) return setError(res.error ?? 'Could not save.');
    onDone(res.data);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 max-w-[860px]">
      <h1 className="m-0 text-2xl font-bold">{chem ? `Edit ${chem.name}` : 'Add a chemical'}</h1>
      <div className={`${card} p-4.5 grid grid-cols-1 sm:grid-cols-2 gap-3.5`}>
        <Field label="Product name" htmlFor="c-name"><input id="c-name" className={inputClass} value={f.name} onChange={e => set({ name: e.target.value })} /></Field>
        <Field label="Manufacturer / supplier" htmlFor="c-maker"><input id="c-maker" className={inputClass} value={f.manufacturer} onChange={e => set({ manufacturer: e.target.value })} /></Field>
        <Field label="Register section" htmlFor="c-sec">
          <select id="c-sec" className={inputClass} value={f.section} onChange={e => set({ section: e.target.value })}>{SECTIONS.map(s => <option key={s}>{s}</option>)}</select>
        </Field>
        <Field label="Supplier emergency phone" htmlFor="c-phone" optional><input id="c-phone" className={inputClass} value={f.supplier_phone} onChange={e => set({ supplier_phone: e.target.value })} /></Field>
      </div>
      <div className={`${card} p-4.5 grid grid-cols-2 sm:grid-cols-4 gap-3.5`}>
        <Field label="DG class" htmlFor="c-class">
          <select id="c-class" className={inputClass} value={f.dg_class ?? ''} onChange={e => set({ dg_class: (e.target.value || null) as DgClass | null })}>
            <option value="">Not a DG</option>{CLASSES.map(c => <option key={c} value={c}>Class {c}</option>)}
          </select>
        </Field>
        <Field label="Packing group" htmlFor="c-pg">
          <select id="c-pg" className={inputClass} value={f.packing_group ?? ''} disabled={!f.dg_class || f.dg_class.startsWith('2')} onChange={e => set({ packing_group: (e.target.value || null) as PackingGroup | null })}>
            <option value="">—</option><option>I</option><option>II</option><option>III</option>
          </select>
        </Field>
        <Field label="UN number" htmlFor="c-un"><input id="c-un" inputMode="numeric" className={inputClass} value={f.un_number ?? ''} onChange={e => set({ un_number: e.target.value.replace(/\D/g, '').slice(0, 4) || null })} /></Field>
        <Field label="Subsidiary risk" htmlFor="c-sub" optional><input id="c-sub" className={inputClass} value={f.subsidiary} onChange={e => set({ subsidiary: e.target.value })} placeholder="e.g. 5.1" /></Field>
        <Field label="Combustible liquid" htmlFor="c-comb">
          <select id="c-comb" className={inputClass} value={f.combustible ?? ''} onChange={e => set({ combustible: (e.target.value || null) as 'C1' | 'C2' | null })}>
            <option value="">No</option><option>C1</option><option>C2</option>
          </select>
        </Field>
        <Field label="GHS hazardous" htmlFor="c-ghs">
          <select id="c-ghs" className={inputClass} value={f.ghs_hazardous === null ? '' : f.ghs_hazardous ? 'yes' : 'no'} onChange={e => set({ ghs_hazardous: e.target.value === '' ? null : e.target.value === 'yes' })}>
            <option value="">Check SDS</option><option value="yes">Yes</option><option value="no">No</option>
          </select>
        </Field>
        <label className="flex gap-2.5 items-center text-sm min-h-11 cursor-pointer self-end">
          <input type="checkbox" checked={f.aerosol} disabled={!f.dg_class?.startsWith('2')} onChange={e => set({ aerosol: e.target.checked })} className="w-5 h-5" /> Aerosol
        </label>
        <label className="flex gap-2.5 items-center text-sm min-h-11 cursor-pointer self-end">
          <input type="checkbox" checked={f.active} onChange={e => set({ active: e.target.checked })} className="w-5 h-5" /> Still used
        </label>
      </div>
      <div className={`${card} p-4.5 grid grid-cols-1 gap-3.5`}>
        <Field label="Hazard summary" htmlFor="c-sum"><input id="c-sum" className={inputClass} value={f.hazard_summary} onChange={e => set({ hazard_summary: e.target.value })} placeholder="e.g. Flammable liquid, eye irritant" /></Field>
        <Field label="Hazard statements (one per line, from SDS section 2)" htmlFor="c-h"><textarea id="c-h" rows={4} className={textareaClass} value={hText} onChange={e => setHText(e.target.value)} placeholder="H225 Highly flammable liquid and vapour" /></Field>
        <Field label="PPE (separate with commas, SDS section 8)" htmlFor="c-ppe"><input id="c-ppe" className={inputClass} value={ppeText} onChange={e => setPpeText(e.target.value)} placeholder="Safety glasses, Nitrile gloves" /></Field>
        <Field label="First aid (SDS section 4)" htmlFor="c-fa"><textarea id="c-fa" rows={3} className={textareaClass} value={f.first_aid} onChange={e => set({ first_aid: e.target.value })} /></Field>
        <Field label="Spills (SDS section 6)" htmlFor="c-sp"><textarea id="c-sp" rows={3} className={textareaClass} value={f.spill} onChange={e => set({ spill: e.target.value })} /></Field>
        <Field label="Notes" htmlFor="c-notes" optional><textarea id="c-notes" rows={2} className={textareaClass} value={f.notes} onChange={e => set({ notes: e.target.value })} /></Field>
      </div>
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="min-h-12 px-5 rounded-lg border-0 bg-finlay text-white font-semibold cursor-pointer disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={onCancel} className="min-h-12 px-5 rounded-lg border border-line bg-white font-semibold cursor-pointer">Cancel</button>
      </div>
    </form>
  );
}
