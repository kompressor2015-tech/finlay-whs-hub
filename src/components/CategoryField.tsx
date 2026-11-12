import { useEffect, useState } from 'react';
import { listDocuments } from '../services/documents.ts';
import { CATEGORY_SUGGESTIONS } from '../utils/documents.ts';

const NEW = '__new__';
const inputClass = 'w-full min-h-11 rounded-lg border border-[#D6D2CC] bg-white px-3 text-[15px]';

/** Pick from the categories already in use (so none is doubled up), or type a new one. */
export function CategoryField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const [existing, setExisting] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    void listDocuments().then(res => {
      const used = Array.from(new Set<string>((res.data ?? []).map(d => (d.category ?? '').trim()).filter(Boolean)));
      setExisting(used.sort((a, b) => a.localeCompare(b)));
    });
  }, []);

  const options = existing.length ? existing : CATEGORY_SUGGESTIONS;
  const inList = !value || options.some(o => o === value);
  const showText = typing || !inList;

  // Typing something that only differs by capital letters uses the one already listed
  function typed(v: string) {
    const match = options.find(o => o.toLowerCase() === v.trim().toLowerCase());
    onChange(match ?? v);
  }

  return (
    <div className="flex flex-col gap-2">
      <select id={id} value={showText ? NEW : value} className={inputClass}
        onChange={e => {
          if (e.target.value === NEW) { setTyping(true); onChange(''); } else { setTyping(false); onChange(e.target.value); }
        }}>
        <option value="">No category</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
        <option value={NEW}>Type a new one…</option>
      </select>
      {showText && (
        <input aria-label="New category" value={value} onChange={e => typed(e.target.value)} onBlur={e => typed(e.target.value.trim())}
          placeholder="e.g. Electrical" className={inputClass} autoFocus={typing} />
      )}
    </div>
  );
}
