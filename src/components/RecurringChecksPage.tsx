import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { WhsUser } from '../services/auth.ts';
import { addCheck, addTemplates, loadChecks, recordCheck, removeLogLine, updateCheck, type CheckSite } from '../services/recurringChecks.ts';
import { openFile } from '../services/files.ts';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { isOfficeAccess } from '../utils/access.ts';
import { formatDay } from '../utils/dates.ts';
import { checkPill, checkState, intervalLabel, lastDone, missingTemplates, nextDue, today, type CheckLogLine, type RecurringCheck } from '../utils/recurringChecks.ts';
import { ErrorNote, Field, inputClass, textareaClass } from './Form.tsx';
import { Pill } from './Pill.tsx';
import { SidePanel, rowOpens, useListPanel } from './SidePanel.tsx';
import { askConfirm } from './ConfirmHost.tsx';

const th = 'px-2 py-3 font-semibold border-b border-[#EEEBE6] text-left';
const td = 'px-2 py-3 border-b border-line-soft align-top';
const btn = 'min-h-10 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold cursor-pointer hover:text-finlay disabled:opacity-60';
const primary = 'min-h-10 px-4 rounded-lg border-0 bg-finlay hover:bg-finlay-dark text-white text-sm font-bold cursor-pointer disabled:opacity-60';

const TILE = { red: 'bg-[#FBE3E4] border-[#F1C0C2]', amber: 'bg-[#FFF3D6] border-[#F0DDA6]', green: 'bg-[#E3F3E6] border-[#BFDFC6]', grey: 'bg-white border-line' } as const;

/** Recurring checks: fire extinguishers, first aid kits, emergency lighting, drills. Each site has its own list. */
export function RecurringChecksPage({ user }: { user: WhsUser }) {
  const office = isOfficeAccess(user.access);
  const { site } = useSiteScope();
  const [sites, setSites] = useState<CheckSite[]>([]);
  const [checks, setChecks] = useState<RecurringCheck[]>([]);
  const [log, setLog] = useState<CheckLogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const load = () =>
    loadChecks().then(r => {
      setError(r.error ?? null);
      setSites(r.data?.sites ?? []);
      setChecks(r.data?.checks ?? []);
      setLog(r.data?.log ?? []);
      setLoaded(true);
    });
  useEffect(() => {
    void load();
  }, []);

  const logOf = useMemo(() => {
    const m = new Map<string, CheckLogLine[]>();
    for (const l of log) m.set(l.check_id, [...(m.get(l.check_id) ?? []), l]);
    return m;
  }, [log]);

  const shownSites = sites.filter(s => !site || s.id === site.id || s.id === site.depotSiteId);
  const shownChecks = checks.filter(c => shownSites.some(s => s.id === c.site_id));
  const { openId, setOpenId, close } = useListPanel(() => shownChecks.map(c => c.id));
  const open = checks.find(c => c.id === openId) ?? null;

  const states = shownChecks.map(c => checkState(c, logOf.get(c.id) ?? []));
  const count = (s: string) => states.filter(x => x === s).length;
  const toConfirm = shownChecks.filter(c => !c.rule_confirmed).length;

  async function addStandard(s: CheckSite) {
    setBusy(true);
    const r = await addTemplates(s.id, missingTemplates(s.state, checks.filter(c => c.site_id === s.id)));
    setBusy(false);
    if (r.error) setError(r.error);
    else await load();
  }

  const stat = (label: string, value: number, sub: string, tone: keyof typeof TILE) => (
    <div className={`border rounded-xl p-4 ${value ? TILE[tone] : TILE.grey}`}>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="text-[28px] font-bold leading-tight">{value}</div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  );

  return (
    <div className="flex gap-5 items-start">
      <div className="flex-1 min-w-0 flex flex-col gap-5">
        <div>
          <h1 className="m-0 text-[26px] font-bold">Recurring checks</h1>
          <p className="mt-1.5 mb-0 text-muted text-[15px]">Fire extinguishers, first aid kits, emergency lighting and drills. Each site has its own list, and each check says where its rule comes from.</p>
        </div>
        <ErrorNote message={error} />
        <section aria-label="Summary" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stat('Overdue', count('overdue') + count('never'), 'late, failed or not done yet', 'red')}
          {stat('Due in 30 days', count('due_soon'), 'coming up', 'amber')}
          {stat('Rule to confirm', toConfirm, 'interval not yet checked', 'amber')}
          {stat('Up to date', count('ok'), 'done and not yet due', 'green')}
        </section>

        {!loaded && <p className="text-muted">Loading…</p>}
        {loaded && shownSites.map(s => {
          const rows = checks.filter(c => c.site_id === s.id).map(c => ({ c, l: logOf.get(c.id) ?? [] })).map(x => ({ ...x, due: nextDue(x.c, x.l) })).sort((a, b) => (a.due ?? '0000').localeCompare(b.due ?? '0000'));
          const missing = missingTemplates(s.state, checks.filter(c => c.site_id === s.id));
          return (
            <section key={s.id} aria-label={s.name} className="bg-white border border-line rounded-xl overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line-soft">
                <h2 className="m-0 text-base font-bold">{s.name}</h2>
                <Pill tone="grey">{s.state}</Pill>
                {office && (
                  <span className="ml-auto flex gap-2">
                    {missing.length > 0 && <button type="button" disabled={busy} onClick={() => void addStandard(s)} className={btn}>{rows.length ? `Add ${missing.length} standard check${missing.length === 1 ? '' : 's'}` : `Start the ${s.state} list`}</button>}
                    <button type="button" onClick={() => setAdding(adding === s.id ? null : s.id)} className={btn}>Add a check</button>
                  </span>
                )}
              </div>
              {adding === s.id && <AddCheckForm siteId={s.id} onDone={() => { setAdding(null); void load(); }} onCancel={() => setAdding(null)} />}
              {rows.length === 0 && adding !== s.id && <p className="m-0 px-4 py-4 text-sm text-muted">No checks set up for this site yet.{office ? ` Use “Start the ${s.state} list” to begin with the usual ones.` : ''}</p>}
              {rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead><tr><th className={`${th} pl-4`}>Check</th><th className={th}>How often</th><th className={th}>Last done</th><th className={th}>Next due</th><th className={th}>Status</th><th className={`${th} pr-4`}>Where the rule comes from</th></tr></thead>
                    <tbody>
                      {rows.map(({ c, l, due }) => {
                        const last = lastDone(l);
                        const pill = checkPill(c, l);
                        return (
                          <tr key={c.id} onClick={e => rowOpens(e, () => setOpenId(c.id))} className={`cursor-pointer hover:bg-[#FAF8F6] ${openId === c.id ? 'bg-[#FAF8F6]' : ''}`}>
                            <td className={`${td} pl-4 font-semibold`}>{c.name}<span className="block text-xs text-muted font-normal">{c.category}</span></td>
                            <td className={td}>{intervalLabel(c.interval_months)}</td>
                            <td className={td}>{last ? <>{formatDay(last.done_on)}<span className="block text-xs text-muted">{last.done_by_kind === 'contractor' ? last.company || 'Contractor' : last.done_by_name || 'Staff'}</span></> : <span className="text-muted">Never</span>}</td>
                            <td className={td}>{due ? formatDay(due) : <span className="text-muted">—</span>}</td>
                            <td className={td}><Pill tone={pill.tone}>{pill.label}</Pill></td>
                            <td className={`${td} pr-4 text-muted`}>{c.basis}{!c.rule_confirmed && <span className="ml-1.5"><Pill tone="amber">To confirm</Pill></span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {open && (
        <SidePanel label={open.name} onClose={close}>
          <CheckPanel key={open.id} check={open} siteName={sites.find(s => s.id === open.site_id)?.name ?? ''} log={logOf.get(open.id) ?? []} user={user} office={office} onChanged={() => void load()} onRemoved={() => { close(); void load(); }} />
        </SidePanel>
      )}
    </div>
  );
}

function AddCheckForm({ siteId, onDone, onCancel }: { siteId: string; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [months, setMonths] = useState('12');
  const [basis, setBasis] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const m = Number(months);
    if (!name.trim()) return setError('Give the check a name.');
    if (!Number.isInteger(m) || m < 1 || m > 120) return setError('How often must be a whole number of months.');
    setBusy(true);
    const r = await addCheck({ site_id: siteId, name: name.trim(), category: category.trim(), interval_months: m, basis: basis.trim() });
    setBusy(false);
    if (r.error) setError(r.error);
    else onDone();
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap gap-3 items-end px-4 py-3 border-b border-line-soft bg-[#FAF8F6]">
      <Field label="Check" htmlFor="rc-name"><input id="rc-name" value={name} onChange={e => setName(e.target.value)} placeholder="Fire hose reel test" className={`${inputClass} w-64`} /></Field>
      <Field label="Heading" optional htmlFor="rc-cat"><input id="rc-cat" value={category} onChange={e => setCategory(e.target.value)} className={`${inputClass} w-40`} /></Field>
      <Field label="Every (months)" htmlFor="rc-m"><input id="rc-m" type="number" min={1} max={120} value={months} onChange={e => setMonths(e.target.value)} className={`${inputClass} w-28`} /></Field>
      <Field label="Where the rule comes from" optional htmlFor="rc-b"><input id="rc-b" value={basis} onChange={e => setBasis(e.target.value)} className={`${inputClass} w-64`} /></Field>
      <button type="submit" disabled={busy} className={primary}>Add</button>
      <button type="button" onClick={onCancel} className={btn}>Cancel</button>
      <div className="basis-full"><ErrorNote message={error} /></div>
    </form>
  );
}

function CheckPanel({ check, siteName, log, user, office, onChanged, onRemoved }: { check: RecurringCheck; siteName: string; log: CheckLogLine[]; user: WhsUser; office: boolean; onChanged: () => void; onRemoved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<'staff' | 'contractor'>('contractor');
  const [form, setForm] = useState({ done_on: today(), name: '', company: '', result: 'passed' as 'passed' | 'failed', notes: '' });
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [edit, setEdit] = useState<{ months: string; basis: string } | null>(null);
  const pill = checkPill(check, log);
  const due = nextDue(check, log);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (kind === 'contractor' && !form.company.trim()) return setError('Enter the contractor\'s company.');
    if (kind === 'staff' && !form.name.trim()) return setError('Enter who did the check.');
    setBusy(true);
    const r = await recordCheck(check, siteName, { done_on: form.done_on, done_by_kind: kind, done_by_name: form.name.trim(), company: kind === 'contractor' ? form.company.trim() : '', result: form.result, notes: form.notes.trim() }, file);
    setBusy(false);
    if (r.error) return setError(r.error);
    setForm({ ...form, notes: '', result: 'passed' });
    setFile(null);
    setFileKey(k => k + 1);
    onChanged();
    if (form.result === 'failed') await askConfirm({ title: 'Action raised', body: 'The failed check has been added to Actions, due in 14 days. Do the check again once it is fixed.', infoOnly: true });
  }

  async function saveEdit() {
    if (!edit) return;
    const m = Number(edit.months);
    if (!Number.isInteger(m) || m < 1 || m > 120) return setError('How often must be a whole number of months.');
    setBusy(true);
    const r = await updateCheck(check.id, { interval_months: m, basis: edit.basis.trim(), rule_confirmed: true });
    setBusy(false);
    if (r.error) return setError(r.error);
    setEdit(null);
    onChanged();
  }

  async function stop() {
    if (!(await askConfirm({ title: `Stop tracking “${check.name}”?`, body: 'It leaves this site\'s list. The history is kept.', confirmLabel: 'Stop tracking', danger: true }))) return;
    const r = await updateCheck(check.id, { active: false });
    if (r.error) setError(r.error);
    else onRemoved();
  }

  async function removeLine(l: CheckLogLine) {
    if (!(await askConfirm({ title: `Remove the ${formatDay(l.done_on)} line?`, body: 'Only do this for a line entered by mistake.', confirmLabel: 'Remove', danger: true }))) return;
    const r = await removeLogLine(l);
    if (r.error) setError(r.error);
    else onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="m-0 text-xl font-bold">{check.name}</h2>
        <p className="mt-1 mb-0 text-sm text-muted">{siteName} · {intervalLabel(check.interval_months)}</p>
        <div className="mt-2 flex flex-wrap gap-2 items-center"><Pill tone={pill.tone}>{pill.label}</Pill>{due && <span className="text-sm text-muted">Next due {formatDay(due)}</span>}</div>
      </div>
      <ErrorNote message={error} />

      <div className="border border-line rounded-xl p-3.5 text-sm">
        <div className="font-semibold mb-1">Where the rule comes from</div>
        <div className="text-muted">{check.basis || 'Not recorded.'}</div>
        {!check.rule_confirmed && <div className="mt-2"><Pill tone="amber">To confirm</Pill> <span className="text-muted text-xs">Check this interval against the current rule, then use Change interval to confirm it.</span></div>}
        {office && !edit && <button type="button" onClick={() => setEdit({ months: String(check.interval_months), basis: check.basis })} className={`${btn} mt-3`}>{check.rule_confirmed ? 'Change interval' : 'Confirm or change interval'}</button>}
        {edit && (
          <div className="mt-3 flex flex-col gap-3">
            <Field label="Every (months)" htmlFor="ci-m"><input id="ci-m" type="number" min={1} max={120} value={edit.months} onChange={e => setEdit({ ...edit, months: e.target.value })} className={`${inputClass} w-28`} /></Field>
            <Field label="Where the rule comes from" htmlFor="ci-b"><input id="ci-b" value={edit.basis} onChange={e => setEdit({ ...edit, basis: e.target.value })} className={inputClass} /></Field>
            <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void saveEdit()} className={primary}>Save and mark confirmed</button><button type="button" onClick={() => setEdit(null)} className={btn}>Cancel</button></div>
          </div>
        )}
      </div>

      {office && (
        <form onSubmit={save} className="flex flex-col gap-3 border border-line rounded-xl p-3.5">
          <h3 className="m-0 text-sm font-bold">Record this check</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date done" htmlFor="rk-on"><input id="rk-on" type="date" value={form.done_on} max={today()} onChange={e => setForm({ ...form, done_on: e.target.value })} className={inputClass} /></Field>
            <Field label="Done by" htmlFor="rk-kind">
              <select id="rk-kind" value={kind} onChange={e => setKind(e.target.value as 'staff' | 'contractor')} className={inputClass}>
                <option value="contractor">A contractor</option>
                <option value="staff">Our staff</option>
              </select>
            </Field>
            {kind === 'contractor' && <Field label="Company" htmlFor="rk-co"><input id="rk-co" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className={inputClass} /></Field>}
            <Field label={kind === 'contractor' ? 'Technician' : 'Who did it'} optional={kind === 'contractor'} htmlFor="rk-nm"><input id="rk-nm" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} /></Field>
            <Field label="Result" htmlFor="rk-res">
              <select id="rk-res" value={form.result} onChange={e => setForm({ ...form, result: e.target.value as 'passed' | 'failed' })} className={inputClass}>
                <option value="passed">All passed</option>
                <option value="failed">Something failed</option>
              </select>
            </Field>
          </div>
          <Field label="Notes" optional htmlFor="rk-notes" hint={form.result === 'failed' ? 'A failed check adds an action to fix it, due in 14 days.' : undefined}>
            <textarea id="rk-notes" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={textareaClass} />
          </Field>
          <Field label="Certificate or report" optional htmlFor="rk-file"><input key={fileKey} id="rk-file" type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-sm" /></Field>
          <div><button type="submit" disabled={busy} className={primary}>{busy ? 'Saving…' : 'Save'}</button></div>
        </form>
      )}

      <section aria-label="History">
        <h3 className="m-0 mb-2 text-[13px] font-semibold text-muted">History</h3>
        <div className="border border-line rounded-xl bg-white">
          {log.length === 0 && <p className="m-0 px-3.5 py-3 text-sm text-muted">Not recorded yet.</p>}
          {[...log].sort((a, b) => b.done_on.localeCompare(a.done_on) || b.created_at.localeCompare(a.created_at)).map((l, i) => (
            <div key={l.id} className={`flex items-center gap-3 px-3.5 py-2.5 text-sm ${i ? 'border-t border-line-soft' : ''}`}>
              <span className="flex-1 min-w-0">
                <span className="font-semibold">{formatDay(l.done_on)}</span> <Pill tone={l.result === 'passed' ? 'green' : 'red'}>{l.result === 'passed' ? 'Passed' : 'Failed'}</Pill>
                <span className="block text-xs text-muted">{l.done_by_kind === 'contractor' ? `${l.company || 'Contractor'}${l.done_by_name ? ` · ${l.done_by_name}` : ''}` : l.done_by_name || 'Staff'} · recorded by {l.recorded_by_name || 'unknown'}</span>
                {l.notes && <span className="block text-xs text-muted">{l.notes}</span>}
                {l.file_path && <button type="button" onClick={() => void openFile('whs-check-files', l.file_path as string)} className="mt-1 p-0 border-0 bg-transparent text-xs font-semibold text-finlay cursor-pointer underline">{l.file_name || 'Open the file'}</button>}
              </span>
              {user.access === 'admin' && <button type="button" onClick={() => void removeLine(l)} className={btn}>Remove</button>}
            </div>
          ))}
        </div>
      </section>

      {office && <div><button type="button" onClick={() => void stop()} className={btn}>Stop tracking this check</button></div>}
    </div>
  );
}
