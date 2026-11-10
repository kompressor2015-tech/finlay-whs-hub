/** Small form pieces shared by the report forms and record pages. Large touch targets for gloves. */

import { useEffect, useId, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Camera, X } from 'lucide-react';
import type { MachineOption, SiteOption } from '../services/records.ts';

export const inputClass =
  'w-full min-h-12 rounded-[10px] border border-[#D6D2CC] bg-white px-3 text-[15px] text-ink focus:border-finlay outline-none';
export const textareaClass =
  'w-full rounded-[10px] border border-[#D6D2CC] bg-white p-3 text-[15px] text-ink focus:border-finlay outline-none resize-y';

export function Field({ label, hint, optional, htmlFor, children }: {
  label: string;
  hint?: string;
  optional?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label} {optional && <span className="text-muted font-normal">(optional)</span>}
      </label>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

/** A grid of big choice buttons (one can be picked). */
export function ChoiceGrid<T extends string>({ legend, options, value, onChange, columns = 2 }: {
  legend: string;
  options: { id: T; label: string; sub?: string }[];
  value: T;
  onChange: (v: T) => void;
  columns?: 2 | 3 | 4;
}) {
  const cols = columns === 4 ? 'grid-cols-2 sm:grid-cols-4' : columns === 3 ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <fieldset className="border-0 m-0 p-0">
      <legend className="text-[15px] font-semibold mb-2 p-0">{legend}</legend>
      <div className={`grid ${cols} gap-2`}>
        {options.map(o => {
          const on = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.id)}
              className={`min-h-14 rounded-xl px-3 py-2.5 text-left text-sm font-semibold cursor-pointer text-ink ${
                on ? 'bg-finlay-soft border-2 border-finlay' : 'bg-white border border-line'
              }`}
            >
              {o.label}
              {o.sub && <span className="block font-normal text-xs text-muted mt-0.5">{o.sub}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Pick a Finlay site, or type a client site or other place. */
export function SitePicker({ sites, siteId, siteName, onChange }: {
  sites: SiteOption[];
  siteId: string | null;
  siteName: string;
  onChange: (siteId: string | null, siteName: string) => void;
}) {
  const id = useId();
  const other = siteId === null;
  return (
    <Field label="Where" htmlFor={id}>
      <select
        id={id}
        className={inputClass}
        value={other ? '__other' : siteId}
        onChange={e => {
          const v = e.target.value;
          if (v === '__other') onChange(null, '');
          else onChange(v, sites.find(s => s.id === v)?.name ?? '');
        }}
      >
        {sites.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
        <option value="__other">Client site or somewhere else…</option>
      </select>
      {other && (
        <input aria-label="Name of the site" placeholder="Client and site name" className={inputClass} value={siteName} onChange={e => onChange(null, e.target.value)} />
      )}
    </Field>
  );
}

/** Type a unit number from the fleet register. */
export function MachinePicker({ machines, machineId, unitNo, onChange, label = 'Machine involved' }: {
  machines: MachineOption[];
  machineId: string | null;
  unitNo: string;
  onChange: (machineId: string | null, unitNo: string) => void;
  label?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState(unitNo);
  useEffect(() => setText(unitNo), [unitNo]);
  const match = useMemo(() => machines.find(m => m.id === machineId), [machines, machineId]);
  return (
    <Field label={label} optional htmlFor={id} hint={match ? match.model : 'Start typing the unit number'}>
      <input
        id={id}
        list={listId}
        inputMode="text"
        autoComplete="off"
        className={`${inputClass} ${match ? 'text-finlay font-semibold' : ''}`}
        value={text}
        onChange={e => {
          const v = e.target.value;
          setText(v);
          const found = machines.find(m => m.unitNo.toLowerCase() === v.trim().toLowerCase());
          onChange(found ? found.id : null, found ? found.unitNo : v.trim());
        }}
      />
      <datalist id={listId}>
        {machines.map(m => (
          <option key={m.id} value={m.unitNo}>{m.model}</option>
        ))}
      </datalist>
    </Field>
  );
}

/** Choose or take photos; shows small previews. */
export function PhotoPicker({ files, onChange, big }: { files: File[]; onChange: (files: File[]) => void; big?: boolean }) {
  const id = useId();
  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews]);
  return (
    <div className="flex flex-col gap-1.5">
      {!big && <span className="text-sm font-medium">Photos <span className="text-muted font-normal">(optional)</span></span>}
      <div className="flex flex-wrap gap-2">
        {previews.map((src, i) => (
          <div key={src} className="relative w-[84px] h-[84px]">
            <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover rounded-[10px]" />
            <button
              type="button"
              aria-label={`Remove photo ${i + 1}`}
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-ink text-white flex items-center justify-center border-0 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        <label
          htmlFor={id}
          className={`border border-dashed border-[#B8B2A9] rounded-[14px] bg-white cursor-pointer flex flex-col items-center justify-center gap-1.5 text-muted ${
            big && !files.length ? 'w-full h-40 text-[15px] font-semibold text-ink' : 'w-[84px] h-[84px] text-[13px]'
          }`}
        >
          <Camera className={big && !files.length ? 'w-8 h-8 text-finlay' : 'w-5 h-5'} aria-hidden="true" />
          {big && !files.length ? (
            <>
              Take a photo
              <span className="font-normal text-[13px] text-muted">Optional, but it helps</span>
            </>
          ) : (
            'Add'
          )}
        </label>
        <input
          id={id}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={e => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length) onChange([...files, ...picked].slice(0, 6));
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="m-0 text-sm text-[#8E0F15] bg-[#FBE3E4] rounded-lg px-3 py-2.5">{message}</p>;
}

export function PrimaryButton({ busy, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={busy || rest.disabled}
      className={`min-h-[52px] rounded-xl border-0 bg-finlay hover:bg-finlay-dark text-white text-base font-bold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${rest.className ?? ''}`}
    >
      {busy ? 'Saving…' : children}
    </button>
  );
}
