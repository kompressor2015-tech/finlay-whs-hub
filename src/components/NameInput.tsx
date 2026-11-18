import { useId, useMemo, useRef, useState } from 'react';
import { usePeopleNames } from '../hooks/usePeopleNames.ts';
import { applyName, currentSegment, suggest, type NameOption } from '../utils/nameSuggest.ts';
import { inputClass } from './Form.tsx';

/**
 * A text box that suggests workers on file as you type. Anything can still be typed (visitors, contractors, new people).
 * `multi` allows several names separated by commas. `onPick` tells the form which worker was chosen from the list.
 */
export function NameInput({ id, value, onChange, onPick, multi = false, placeholder, label, className }: {
  id?: string;
  value: string;
  onChange: (text: string) => void;
  onPick?: (person: NameOption) => void;
  multi?: boolean;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  const names = usePeopleNames();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<number | undefined>(undefined);
  const { query } = currentSegment(value, multi);
  const matches = useMemo(() => suggest(names, query), [names, query]);
  const showing = open && matches.length > 0 && !matches.every(m => m.name.toLowerCase() === query.toLowerCase());

  const choose = (m: NameOption) => {
    onChange(applyName(value, m.name, multi) + (multi ? ', ' : ''));
    onPick?.(m);
    setOpen(false);
    setActive(0);
  };

  return (
    <div className="relative">
      <input
        id={id}
        aria-label={label}
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        className={className ?? inputClass}
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => { window.clearTimeout(blurTimer.current); setOpen(true); }}
        onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 150); }}
        onKeyDown={e => {
          if (!showing) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); choose(matches[active] ?? matches[0]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {showing && (
        <ul id={listId} role="listbox" className="absolute z-20 left-0 right-0 top-full mt-1 m-0 p-1 list-none bg-white border border-[#D6D2CC] rounded-[10px] shadow-lg max-h-64 overflow-auto">
          {matches.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === active}>
              <button type="button" className={`w-full min-h-11 px-3 text-left text-[15px] rounded-lg border-0 cursor-pointer ${i === active ? 'bg-[#F0EDE8]' : 'bg-white'}`} onMouseDown={e => e.preventDefault()} onClick={() => choose(m)}>
                <span className="font-semibold">{m.name}</span>{m.position ? <span className="text-xs text-muted"> · {m.position}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
