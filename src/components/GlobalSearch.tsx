import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { loadHomeRaw } from '../services/home.ts';
import type { HomeRaw } from '../utils/homeBuild.ts';
import { SEARCH_GROUPS, searchAll } from '../utils/globalSearch.ts';
import { useSiteScope } from '../hooks/useSiteScope.tsx';

/** The top bar search. Press / to jump to it, arrow keys to choose, Enter to open, Esc to close. */
export function GlobalSearch() {
  const { site } = useSiteScope();
  const [q, setQ] = useState('');
  const [raw, setRaw] = useState<HomeRaw | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const loadedAt = useRef(0);

  // The lists are fetched when you first use the box, and again if they are over 2 minutes old
  function ensureLoaded() {
    if (loading || (raw && Date.now() - loadedAt.current < 120_000)) return;
    setLoading(true);
    loadHomeRaw().then(r => {
      setRaw(r);
      loadedAt.current = Date.now();
      setLoading(false);
    });
  }

  const hits = useMemo(() => (raw ? searchAll(raw, q, site) : []), [raw, q, site]);
  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !(t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable))) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, []);

  function go(href: string) {
    window.location.hash = href;
    setOpen(false);
    setQ('');
    input.current?.blur();
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      input.current?.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(hits.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(0, a - 1));
    } else if (e.key === 'Enter' && hits[active]) {
      go(hits[active].href);
    }
  }

  const searching = q.trim().length >= 2;
  return (
    <div ref={box} className="relative flex-[1_1_280px] max-w-[520px]">
      <label htmlFor="search" className="sr-only">Search</label>
      <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
      <input
        ref={input}
        id="search"
        type="search"
        value={q}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && searching}
        aria-controls="search-results"
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { ensureLoaded(); setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder="Search incidents, hazards, actions, chemicals, units, people"
        className="w-full h-10 rounded-lg border border-[#D6D2CC] bg-[#FAFAF9] pl-10 pr-10 text-sm"
      />
      <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted border border-[#D6D2CC] rounded px-1.5 bg-white pointer-events-none" aria-hidden="true">/</kbd>
      {open && searching && (
        <div id="search-results" role="listbox" className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-line rounded-xl shadow-lg z-30 max-h-[70vh] overflow-y-auto py-1.5">
          {loading && !raw && <p className="m-0 px-4 py-3 text-sm text-muted">Searching…</p>}
          {raw && hits.length === 0 && <p className="m-0 px-4 py-3 text-sm text-muted">Nothing found{site ? ` at ${site.name}` : ''}.</p>}
          {SEARCH_GROUPS.map(g => {
            const rows = hits.filter(h => h.group === g);
            if (!rows.length) return null;
            return (
              <div key={g}>
                <div className="text-[11px] font-semibold tracking-wider uppercase text-muted px-4 pt-2.5 pb-1">{g}</div>
                {rows.map(h => {
                  const i = hits.indexOf(h);
                  return (
                    <a key={h.group + h.id} href={h.href} role="option" aria-selected={i === active} onClick={() => go(h.href)} onMouseEnter={() => setActive(i)}
                      className={`block no-underline text-ink px-4 py-2 ${i === active ? 'bg-finlay-soft' : ''}`}>
                      <span className="block text-sm font-medium">{h.title}</span>
                      {h.detail && <span className="block text-xs text-muted mt-0.5">{h.detail}</span>}
                    </a>
                  );
                })}
              </div>
            );
          })}
          {site && raw && hits.length > 0 && <p className="m-0 px-4 pt-2 pb-1 text-xs text-muted border-t border-line-soft mt-1.5">Showing {site.name} only. Choose All sites to search everywhere.</p>}
        </div>
      )}
    </div>
  );
}
