import { useEffect, useRef, useState } from 'react';

export interface ConfirmOptions {
  title: string;
  body?: string;
  /** A list of things still to do (shown as bullets) */
  items?: string[];
  confirmLabel?: string;
  /** Red confirm button, for deleting */
  danger?: boolean;
  /** Just tells the person something: one OK button, no Cancel */
  infoOnly?: boolean;
}

type Ask = (o: ConfirmOptions) => Promise<boolean>;
let asker: Ask | null = null;

/** A proper pop-up in place of the browser's own confirm box (which shows the site address). */
export function askConfirm(o: ConfirmOptions | string): Promise<boolean> {
  const opts: ConfirmOptions = typeof o === 'string'
    ? { title: o, body: /^(Delete|Remove)/.test(o) ? 'This can\'t be undone.' : undefined, confirmLabel: /^Delete/.test(o) ? 'Delete' : /^Remove/.test(o) ? 'Remove' : 'Yes', danger: /^(Delete|Remove)/.test(o) }
    : o;
  return asker ? asker(opts) : Promise.resolve(window.confirm(opts.title));
}

export function ConfirmHost() {
  const ref = useRef<HTMLDialogElement>(null);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolve = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    asker = o => new Promise<boolean>(res => {
      resolve.current?.(false);
      resolve.current = res;
      setOpts(o);
    });
    return () => { asker = null; };
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d || !opts) return;
    if (!d.open) d.showModal();
  }, [opts]);

  function finish(ok: boolean) {
    ref.current?.close();
    resolve.current?.(ok);
    resolve.current = null;
    setOpts(null);
  }

  return (
    <dialog ref={ref} onCancel={e => { e.preventDefault(); finish(false); }} onClick={e => { if (e.target === ref.current) finish(false); }}
      className="m-auto rounded-xl border border-line p-0 w-[min(440px,calc(100vw-32px))] backdrop:bg-black/40 shadow-xl">
      {opts && (
        <div className="p-5 flex flex-col gap-3">
          <h2 className="m-0 text-lg font-semibold">{opts.title}</h2>
          {opts.body && <p className="m-0 text-sm text-muted leading-relaxed whitespace-pre-line">{opts.body}</p>}
          {opts.items && opts.items.length > 0 && (
            <ul className="m-0 pl-5 flex flex-col gap-1 text-sm">{opts.items.map(i => <li key={i}>{i}</li>)}</ul>
          )}
          <div className="flex gap-2 justify-end pt-1">
            {!opts.infoOnly && <button type="button" onClick={() => finish(false)} className="min-h-11 px-4 rounded-lg border border-line bg-white text-sm font-semibold cursor-pointer">Cancel</button>}
            <button type="button" autoFocus onClick={() => finish(!opts.infoOnly)} className={`min-h-11 px-4 rounded-lg border-0 text-white text-sm font-semibold cursor-pointer ${opts.danger ? 'bg-finlay' : 'bg-ink'}`}>
              {opts.confirmLabel ?? (opts.infoOnly ? 'OK' : 'Yes')}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
