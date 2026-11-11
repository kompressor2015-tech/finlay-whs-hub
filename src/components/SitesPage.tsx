import { useEffect, useState } from 'react';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { supabase } from '../services/supabase.ts';
import { ErrorNote, Field, inputClass } from './Form.tsx';

interface SiteRow { id: string; name: string; state: string; code: string; stocktake_days: number; also_known_as: string[] }

const card = 'bg-white border border-line rounded-xl';
const btn = 'min-h-10 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-[13px] font-semibold cursor-pointer disabled:opacity-60';
const btnPri = 'min-h-10 px-4 rounded-lg border-0 bg-ink text-white text-[13px] font-semibold cursor-pointer disabled:opacity-60';

/** Sites and the other names each one goes by. WHS officer and admin only. */
export function SitesPage() {
  const { refresh } = useSiteScope();
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    const { data, error: e } = await supabase.from('whs_sites').select('id, name, state, code, stocktake_days, also_known_as').order('name');
    if (e) setError(e.message);
    setRows(((data ?? []) as SiteRow[]).map(r => ({ ...r, also_known_as: r.also_known_as ?? [] })));
  }
  useEffect(() => { void load(); }, []);
  const changed = async () => { await load(); refresh(); };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-bold">Sites</h1>
          <p className="mt-1.5 mb-0 text-muted text-[15px]">Add the other names a site is known by, such as the fleet app&apos;s name. Reports made against any of them show under that site.</p>
        </div>
        <button type="button" className={btn} onClick={() => setAdding(!adding)}>+ Add a site</button>
      </div>
      <ErrorNote message={error} />
      {adding && <AddSite onDone={async () => { setAdding(false); await changed(); }} onError={setError} />}
      {rows.map(r => <SiteCard key={r.id} row={r} onSaved={changed} onError={setError} />)}
    </div>
  );
}

function SiteCard({ row, onSaved, onError }: { row: SiteRow; onSaved: () => void; onError: (m: string | null) => void }) {
  const [name, setName] = useState(row.name);
  const [days, setDays] = useState(String(row.stocktake_days));
  const [aka, setAka] = useState<string[]>(row.also_known_as);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const addAka = () => {
    const v = draft.trim();
    if (v && !aka.some(a => a.toLowerCase() === v.toLowerCase())) setAka([...aka, v]);
    setDraft('');
  };
  const dirty = name.trim() !== row.name || Number(days) !== row.stocktake_days || aka.join('|') !== row.also_known_as.join('|') || draft.trim() !== '';
  return (
    <section className={`${card} px-4.5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-3`}>
      <Field label="Name" htmlFor={`sn-${row.id}`}><input id={`sn-${row.id}`} className={inputClass} value={name} onChange={e => setName(e.target.value)} /></Field>
      <div className="text-sm"><span className="block font-semibold mb-1.5">State</span><span className="block min-h-11 leading-[44px]">{row.state} · {row.code}</span></div>
      <Field label="Stocktake every (days)" htmlFor={`sd-${row.id}`}><input id={`sd-${row.id}`} type="number" min={1} className={inputClass} value={days} onChange={e => setDays(e.target.value)} /></Field>
      <div className="col-span-2 sm:col-span-3">
        <span className="block text-sm font-semibold mb-1.5">Also known as</span>
        <div className="flex flex-wrap items-center gap-2">
          {aka.map(a => (
            <span key={a} className="inline-flex items-center gap-1.5 rounded-full bg-[#ECECEC] pl-3 pr-1 py-1 text-[13px] font-medium">
              {a}<button type="button" aria-label={`Remove ${a}`} className="w-6 h-6 rounded-full border-0 bg-transparent cursor-pointer text-muted" onClick={() => setAka(aka.filter(x => x !== a))}>×</button>
            </span>
          ))}
          <input aria-label="Add another name" placeholder="e.g. Brisbane Yard" className={`${inputClass} max-w-56`} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAka(); } }} />
          <button type="button" className={btn} onClick={addAka} disabled={!draft.trim()}>Add</button>
        </div>
        <p className="mt-1.5 mb-0 text-xs text-muted">The first word of each name is what's matched, so &quot;Brisbane Yard&quot; catches &quot;Brisbane Yard, Burpengary&quot; too.</p>
      </div>
      <div className="col-span-2 sm:col-span-3">
        <button type="button" disabled={busy || !dirty || !name.trim() || !(Number(days) > 0)} className={btnPri} onClick={async () => {
          setBusy(true); onError(null);
          const list = draft.trim() && !aka.some(a => a.toLowerCase() === draft.trim().toLowerCase()) ? [...aka, draft.trim()] : aka;
          const { error } = await supabase.from('whs_sites').update({ name: name.trim(), stocktake_days: Number(days), also_known_as: list }).eq('id', row.id);
          setBusy(false);
          if (error) onError(error.message); else { setDraft(''); onSaved(); }
        }}>Save</button>
      </div>
    </section>
  );
}

function AddSite({ onDone, onError }: { onDone: () => void; onError: (m: string | null) => void }) {
  const [name, setName] = useState('');
  const [state, setState] = useState('QLD');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className={`${card} px-4.5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3`}>
      <div className="col-span-2"><Field label="Site name" htmlFor="as-n"><input id="as-n" className={inputClass} value={name} onChange={e => setName(e.target.value)} /></Field></div>
      <Field label="State" htmlFor="as-s"><select id="as-s" className={inputClass} value={state} onChange={e => setState(e.target.value)}><option>QLD</option><option>VIC</option><option>NSW</option></select></Field>
      <Field label="Short code" htmlFor="as-c" hint="Three letters, e.g. BUR"><input id="as-c" maxLength={4} className={inputClass} value={code} onChange={e => setCode(e.target.value.toUpperCase())} /></Field>
      <div className="col-span-2 sm:col-span-4">
        <button type="button" disabled={busy || !name.trim() || !code.trim()} className={btnPri} onClick={async () => {
          setBusy(true); onError(null);
          const id = name.trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, '');
          const { error } = await supabase.from('whs_sites').insert({ id, name: name.trim(), state, code: code.trim() });
          setBusy(false);
          if (error) onError(error.code === '23505' ? 'A site with that first word already exists.' : error.message); else onDone();
        }}>Add site</button>
      </div>
    </section>
  );
}
