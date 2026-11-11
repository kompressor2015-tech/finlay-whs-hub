import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * The slide-in panel beside a register: click a row to read and act on the record without leaving
 * the list. Up and down arrows move to the next row, Esc closes. On a narrow screen the panel
 * covers the right side instead of sitting beside the list.
 */
export function useListPanel(getIds: () => string[], onClosed?: () => void) {
  const [openId, setOpenId] = useState<string | null>(null);
  const idsRef = useRef(getIds);
  idsRef.current = getIds;
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;

  const close = useCallback(() => {
    setOpenId(null);
    closedRef.current?.();
  }, []);

  useEffect(() => {
    if (!openId) return;
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Never steal keys while someone is typing
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const ids = idsRef.current();
        const next = ids[ids.indexOf(openId) + (e.key === 'ArrowDown' ? 1 : -1)];
        if (next) {
          e.preventDefault();
          setOpenId(next);
        }
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [openId, close]);

  return { openId, setOpenId, close };
}

/** Row click opens the panel, unless the click was on a link, button or field inside the row. */
export function rowOpens(e: MouseEvent, open: () => void) {
  if ((e.target as HTMLElement).closest('a,button,input,select,textarea,label')) return;
  open();
}

/** A reference link opens the panel on a plain click, and the full page on ctrl, cmd or shift click. */
export function linkOpens(e: MouseEvent, open: () => void) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  open();
}

export function SidePanel({ label, fullHref, onClose, children }: { label: string; fullHref: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside
      aria-label={label}
      className="fixed inset-y-0 right-0 z-30 w-[min(560px,100vw)] bg-white border-l border-line shadow-2xl flex flex-col xl:sticky xl:top-4 xl:inset-auto xl:z-auto xl:shadow-none xl:w-[520px] xl:flex-none xl:h-[calc(100vh-2rem)] xl:border xl:rounded-xl print:hidden"
    >
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-line-soft">
        <a href={fullHref} className="text-[13px] font-semibold text-ink">Open full page</a>
        <span className="text-xs text-muted hidden xl:inline">Up and down arrows for the next row · Esc to close</span>
        <button type="button" onClick={onClose} aria-label="Close panel" className="ml-auto w-9 h-9 rounded-lg border border-[#D6D2CC] bg-white flex items-center justify-center cursor-pointer hover:text-finlay">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
    </aside>
  );
}
