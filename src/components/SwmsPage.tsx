import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { NameInput } from './NameInput.tsx';
import { NameInput } from './NameInput.tsx';
import type { WhsUser } from '../services/auth.ts';
import { addSwmsReview, approveVersion, deleteSwms, discardDraft, loadSwms, removeSwmsReview, saveDraft, sendBack, startVersion, submitVersion, updateSwms, type VersionContent } from '../services/swms.ts';
import { loadRisks } from '../services/risks.ts';
import { uploadPhotos } from '../services/records.ts';
import { listDocuments } from '../services/documents.ts';
import { listHistory, photoLinks } from '../services/records.ts';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { go, hrefFor } from '../hooks/useRoute.ts';
import { isOfficeAccess, isOfficerAccess } from '../utils/access.ts';
import { brisbaneDay, formatDay, formatWhen } from '../utils/dates.ts';
import type { HistoryEntry } from '../utils/records.ts';
import type { WhsDocument } from '../utils/documents.ts';
import { afterLevel, beforeLevel, LEVELS, type Risk, type RiskControl } from '../utils/risks.ts';
import { contentOf, currentApproved, emptyStep, groupSteps, highAfterCount, HIGH_RISK_AREAS, openVersion, PERMIT_TYPES, REVIEW_CHECKS, stepCode, stepLevel, swmsIssues, swmsPill, swmsReviewBy, versionProblems, VERSION_LABEL, VOC_TYPES, type Swms, type SwmsReview, type SwmsStep, type SwmsVersion } from '../utils/swms.ts';
import { askConfirm } from './ConfirmHost.tsx';
import { ErrorNote, Field, inputClass, textareaClass } from './Form.tsx';
import { Pill } from './Pill.tsx';
import { RatingGrid } from './RatingGrid.tsx';
import { SwmsPrint } from './SwmsPrint.tsx';
import { SwmsSignOnSection } from './SwmsSignOnSection.tsx';
import { SignaturePad } from './SignaturePad.tsx';

const btn = 'min-h-10 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold cursor-pointer hover:text-finlay disabled:opacity-60';
const primary = 'min-h-10 px-4 rounded-lg border-0 bg-finlay hover:bg-finlay-dark text-white text-sm font-bold cursor-pointer disabled:opacity-60';
const card = 'bg-white border border-line rounded-xl p-4';
const label = 'text-xs font-semibold text-muted mb-1';

const contentFrom = (v: SwmsVersion): VersionContent => contentOf(v);

function Checks({ legend, options, value, onChange }: { legend: string; options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="m-0 p-0 border-0">
      <legend className={label}>{legend}</legend>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
        {options.map(o => (
          <label key={o} className="flex items-start gap-2 text-sm min-h-8 cursor-pointer"><input type="checkbox" className="mt-1 w-4 h-4" checked={value.includes(o)} onChange={e => onChange(e.target.checked ? [...value, o] : value.filter(x => x !== o))} />{o}</label>
        ))}
      </div>
    </fieldset>
  );
}

/** Show a saved signature, or let someone draw one and keep it. */
function SignBox({ title, path, urls, editable, onSigned }: { title: string; path: string | null; urls: Record<string, string>; editable: boolean; onSigned: (path: string | null) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (path) return (
    <div className="flex items-center gap-3">
      {urls[path] ? <img src={urls[path]} alt={`${title} signature`} className="h-12 border border-line-soft rounded bg-white" /> : <span className="text-sm text-muted">Signed</span>}
      {editable && <button type="button" className={btn} onClick={() => onSigned(null)}>Sign again</button>}
    </div>
  );
  if (!editable) return <span className="text-sm text-muted">Not signed</span>;
  return (
    <div className="flex flex-col gap-2">
      <SignaturePad onChange={setFile} label={title} />
      <ErrorNote message={err} />
      <div><button type="button" className={btn} disabled={!file || busy} onClick={async () => { setBusy(true); const r = await uploadPhotos([file!]); setBusy(false); if (r.error || !r.data?.[0]) setErr(r.error ?? 'The signature could not be saved.'); else { setErr(null); onSigned(r.data[0]); } }}>{busy ? 'Saving…' : 'Use this signature'}</button></div>
    </div>
  );
}

function Sec({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={`${card} flex flex-col gap-3`}>
      <div><h2 className="m-0 text-base font-bold">{title}</h2>{hint && <p className="m-0 mt-0.5 text-xs text-muted">{hint}</p>}</div>
      {children}
    </section>
  );
}

function Read({ label: l, value }: { label: string; value: string | null | undefined }) {
  return value ? <div><div className={label}>{l}</div><div className="text-sm whitespace-pre-wrap">{value}</div></div> : null;
}

/** One SWMS as a full page: write it, send it for approval, approve it with a signature, review it. */
export function SwmsPage({ id, user }: { id: string; user: WhsUser }) {
  const officer = isOfficerAccess(user.access);
  const office = isOfficeAccess(user.access);
  const back = office ? '#/m/risk/swms' : '#/m/swms';
  const { sites } = useSiteScope();
  const [swms, setSwms] = useState<Swms | null>(null);
  const [versions, setVersions] = useState<SwmsVersion[]>([]);
  const [reviews, setReviews] = useState<SwmsReview[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [controls, setControls] = useState<RiskControl[]>([]);
  const [docs, setDocs] = useState<WhsDocument[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<VersionContent | null>(null);
  const [dirty, setDirty] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [sig, setSig] = useState<File | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [position, setPosition] = useState('WHS Officer');
  const [backNote, setBackNote] = useState('');
  const [rev, setRev] = useState({ on: brisbaneDay(new Date()), note: '' });

  const load = useCallback(async () => {
    const r = await loadSwms();
    if (r.error) { setError(r.error); setLoaded(true); return; }
    setError(null);
    setSwms(r.data!.swms.find(s => s.id === id) ?? null);
    setVersions(r.data!.versions.filter(v => v.swms_id === id).sort((a, b) => b.version - a.version));
    setReviews(r.data!.reviews.filter(v => v.swms_id === id));
    setLoaded(true);
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void loadRisks().then(r => { setRisks(r.data?.risks ?? []); setControls(r.data?.controls ?? []); });
    void listDocuments().then(r => setDocs(r.data ?? []));
  }, []);
  useEffect(() => { void listHistory('swms', id).then(setHistory); }, [id, swms?.updated_at, versions.length, reviews.length]);

  const picked = useMemo(() => versions.find(v => v.id === pickedId) ?? openVersion(versions) ?? currentApproved(versions) ?? versions[0] ?? null, [versions, pickedId]);
  // Load the editable copy when the shown version changes
  useEffect(() => {
    if (picked && picked.status === 'draft') { setDraft(contentFrom(picked)); setDirty(false); setProblems([]); } else setDraft(null);
  }, [picked?.id, picked?.status, picked?.updated_at]);
  const sigPaths = [picked?.signature_path, draft?.author_signature_path ?? picked?.author_signature_path, draft?.supervisor_signature_path ?? picked?.supervisor_signature_path, ...(draft?.consulted ?? picked?.consulted ?? []).map(c => c.signature_path)].filter((x): x is string => Boolean(x));
  const sigKey = sigPaths.join('|');
  useEffect(() => {
    const need = sigPaths.filter(p => !urls[p]);
    if (!need.length) return;
    void Promise.all(need.map(async p => [p, (await photoLinks([p]))[0]] as const)).then(r => setUrls(u => ({ ...u, ...Object.fromEntries(r.filter(x => x[1])) })));
  }, [sigKey]);

  if (!loaded) return <p className="text-muted">Loading…</p>;
  if (!swms) return (
    <div className={card}><h1 className="m-0 text-xl font-bold">SWMS not found</h1><p className="mt-2 mb-0 text-sm"><a href={back} className="text-finlay">Back to the SWMS list</a></p></div>
  );

  const run = async (fn: () => Promise<{ error?: string }>, after?: () => void) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.error) { setError(r.error); return false; }
    setError(null);
    await load();
    after?.();
    return true;
  };

  const editing = Boolean(picked && picked.status === 'draft' && draft);
  const approved = currentApproved(versions);
  const open = openVersion(versions);
  const pill = swmsPill(swms, versions);
  const issues = swmsIssues(swms, versions);
  const by = swmsReviewBy(swms);
  const siteName = sites.find(s => s.id === swms.site_id)?.name ?? 'All sites';
  const shownContent: VersionContent | null = editing ? draft : picked ? contentFrom(picked) : null;

  const patch = (p: Partial<VersionContent>) => { setDraft(d => (d ? { ...d, ...p } : d)); setDirty(true); };
  const setStep = (i: number, p: Partial<SwmsStep>) => patch({ steps: draft!.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const moveStep = (i: number, d: -1 | 1) => {
    const a = [...draft!.steps]; const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    patch({ steps: a });
  };
  const addFromRisk = (riskId: string) => {
    const r = risks.find(x => x.id === riskId);
    if (!r) return;
    const cs = controls.filter(c => c.risk_id === r.id).map(c => c.what).join('\n');
    const step: SwmsStep = { ...emptyStep(), hazard: r.title, before: [r.before_likelihood, r.before_consequence], after: r.after_likelihood && r.after_consequence ? [r.after_likelihood, r.after_consequence] : null, controls: cs, risk_id: r.id };
    patch({ steps: [...draft!.steps, step], linked_risk_ids: Array.from(new Set([...draft!.linked_risk_ids, r.id])) });
  };

  const save = () => run(async () => saveDraft(picked!.id, draft!));
  const send = async () => {
    const p = versionProblems(draft!);
    setProblems(p);
    if (p.length) return;
    if (highAfterCount(draft!.steps) > 0 && !(await askConfirm({ title: 'Some steps are still high risk after controls', body: 'The approver will see this. Send it anyway?', confirmLabel: 'Send for approval' }))) return;
    await run(async () => { const s = await saveDraft(picked!.id, draft!); return s.error ? s : submitVersion(picked!.id); });
  };

  return (
    <>
    {picked && <SwmsPrint swms={swms} version={picked} sigs={urls} risksRef={swms.risk_register_ref ? `Risk register ref: ${swms.risk_register_ref}` : ''} />}
    <div className="flex flex-col gap-4 max-w-[1000px] print:hidden">
      <a href={back} className="text-sm text-finlay no-underline print:hidden">← All SWMS</a>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-muted">{swms.swms_number ? `SWMS ${swms.swms_number}` : swms.ref} · {siteName}</div>
          <h1 className="m-0 mt-1 text-2xl font-bold">{swms.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2"><Pill tone={pill.tone}>{pill.label}</Pill>{issues.slice(1).map(i => <Pill key={i.key} tone={i.tone}>{i.label}</Pill>)}{approved && <Pill tone="green">In use: version {approved.version}</Pill>}</div>
        </div>
        <div className="flex gap-2 print:hidden">
          {picked && <button type="button" className={btn} onClick={() => window.print()}>Print</button>}
        </div>
      </div>
      <ErrorNote message={error} />

      {versions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <span className="text-sm text-muted">Version</span>
          {versions.map(v => (
            <button key={v.id} type="button" aria-pressed={picked?.id === v.id} onClick={() => setPickedId(v.id)} className={`min-h-9 px-3 rounded-full text-[13px] font-semibold cursor-pointer border ${picked?.id === v.id ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[#D6D2CC]'}`}>
              {v.version} · {VERSION_LABEL[v.status].label}
            </button>
          ))}
        </div>
      )}

      {!picked ? (
        <div className={card}>
          <p className="m-0 text-sm text-muted">{office ? 'This SWMS has no version yet.' : 'This SWMS has not been approved yet, so it cannot be used.'}</p>
          {office && <button type="button" className={`${primary} mt-3`} disabled={busy} onClick={() => void run(() => startVersion(swms.id))}>Start writing</button>}
        </div>
      ) : (
        <>
          {picked.status === 'draft' && picked.decision_note && (
            <div className="rounded-xl border border-[#F0DDA6] bg-[#FFF3D6] p-3.5 text-sm"><b>Sent back:</b> {picked.decision_note}</div>
          )}
          {picked.status === 'approved' && (
            <div className={`${card} flex flex-wrap items-center gap-4`}>
              <div className="text-sm"><b>Approved</b> by {picked.approved_by_name} on {picked.approved_at ? formatDay(picked.approved_at.slice(0, 10)) : ''}. This version is locked.</div>
              {picked.signature_path && urls[picked.signature_path] && <img src={urls[picked.signature_path]} alt={`Signature of ${picked.approved_by_name}`} className="h-12 border border-line-soft rounded bg-white" />}
            </div>
          )}
          {picked.status === 'superseded' && <div className={`${card} text-sm text-muted`}>This version was replaced by a newer one. It is kept for the record.</div>}

          {/* Details */}
          <Sec title="Details" hint="Finlay's company name, address and ABN print on the form automatically.">
            {editing && draft ? (
              <>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Site or project name" htmlFor="d-site"><input id="d-site" value={draft.site_name} onChange={e => patch({ site_name: e.target.value })} className={inputClass} placeholder="Shadforths Aura (on behalf of Soilcyclers)" /></Field>
                  <Field label="Site address or location" optional htmlFor="d-addr"><input id="d-addr" value={draft.site_address} onChange={e => patch({ site_address: e.target.value })} className={inputClass} /></Field>
                </div>
                <Field label="Work activity" htmlFor="w-cov"><textarea id="w-cov" rows={3} value={draft.work_covered} onChange={e => patch({ work_covered: e.target.value })} className={textareaClass} placeholder="Scheduled service, inspection, lubrication and minor repairs carried out on site by a field service technician" /></Field>
                <Field label="Expected start date" optional htmlFor="d-start"><input id="d-start" type="date" value={draft.expected_start ?? ''} onChange={e => patch({ expected_start: e.target.value || null })} className={`${inputClass} max-w-[220px]`} /></Field>
              </>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 gap-3"><Read label="Site or project" value={shownContent?.site_name} /><Read label="Site address" value={shownContent?.site_address} /></div>
                <Read label="Work activity" value={shownContent?.work_covered} />
                <Read label="Expected start" value={shownContent?.expected_start ? formatDay(shownContent.expected_start) : ''} />
              </>
            )}
          </Sec>

          <Sec title="High risk areas involved" hint="Tick all that apply.">
            {editing && draft ? (
              <>
                <Checks legend="High risk areas" options={HIGH_RISK_AREAS} value={draft.high_risk_areas} onChange={v => patch({ high_risk_areas: v })} />
                <Field label="Other" optional htmlFor="d-hro"><input id="d-hro" value={draft.high_risk_other} onChange={e => patch({ high_risk_other: e.target.value })} className={inputClass} /></Field>
              </>
            ) : (
              <div className="flex flex-wrap gap-2">{[...(shownContent?.high_risk_areas ?? []), ...(shownContent?.high_risk_other ? [shownContent.high_risk_other] : [])].map(a => <Pill key={a} tone="amber">{a}</Pill>)}{!(shownContent?.high_risk_areas.length || shownContent?.high_risk_other) && <span className="text-sm text-muted">None ticked.</span>}</div>
            )}
          </Sec>

          <Sec title="The people" hint="The author signs before sending it for approval. The approver signs when approving.">
            {editing && draft ? (
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <div className="text-sm font-semibold">Author: {picked.created_by_name}</div>
                  <Field label="Position" htmlFor="a-pos"><input id="a-pos" value={draft.author_position} onChange={e => patch({ author_position: e.target.value })} className={inputClass} placeholder="Safety officer" /></Field>
                  <SignBox title="Author signature" path={draft.author_signature_path} urls={urls} editable onSigned={p => patch({ author_signature_path: p })} />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="text-sm font-semibold">Supervisor of the work</div>
                  <Field label="Name" optional htmlFor="s-name"><NameInput id="s-name" value={draft.supervisor_name} onChange={t => patch({ supervisor_name: t })} /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Position" optional htmlFor="s-pos"><input id="s-pos" value={draft.supervisor_position} onChange={e => patch({ supervisor_position: e.target.value })} className={inputClass} /></Field>
                    <Field label="Contact details" optional htmlFor="s-con"><input id="s-con" value={draft.supervisor_contact} onChange={e => patch({ supervisor_contact: e.target.value })} className={inputClass} /></Field>
                  </div>
                  <SignBox title="Supervisor signature" path={draft.supervisor_signature_path} urls={urls} editable onSigned={p => patch({ supervisor_signature_path: p })} />
                </div>
              </div>
            ) : (
              <div className="grid sm:grid-cols-3 gap-3 text-sm">
                <div><div className={label}>Author</div>{picked.created_by_name}{shownContent?.author_position && `, ${shownContent.author_position}`}<div className="mt-1"><SignBox title="Author" path={shownContent?.author_signature_path ?? null} urls={urls} editable={false} onSigned={() => {}} /></div></div>
                <div><div className={label}>Supervisor</div>{shownContent?.supervisor_name || 'To be advised'}{shownContent?.supervisor_position && `, ${shownContent.supervisor_position}`}{shownContent?.supervisor_contact && <div className="text-muted">{shownContent.supervisor_contact}</div>}<div className="mt-1"><SignBox title="Supervisor" path={shownContent?.supervisor_signature_path ?? null} urls={urls} editable={false} onSigned={() => {}} /></div></div>
                <div><div className={label}>Approver</div>{picked.approved_by_name || 'Not approved yet'}{picked.approver_position && `, ${picked.approver_position}`}</div>
              </div>
            )}
          </Sec>

          <Sec title="Persons consulted" hint="Workers and others who helped develop this SWMS. Each can sign here.">
            {(editing && draft ? draft.consulted : shownContent?.consulted ?? []).map((c, i) => (
              <div key={i} className="flex flex-wrap items-start gap-3 border-t border-line-soft pt-3 first:border-0 first:pt-0">
                {editing && draft ? (
                  <>
                    <div className="w-56"><Field label="Name" htmlFor={`c-${i}`}><NameInput id={`c-${i}`} value={c.name} onChange={t => patch({ consulted: draft.consulted.map((x, j) => (j === i ? { ...x, name: t } : x)) })} /></Field></div>
                    <SignBox title={`${c.name || 'Person'} signature`} path={c.signature_path} urls={urls} editable onSigned={p => patch({ consulted: draft.consulted.map((x, j) => (j === i ? { ...x, signature_path: p } : x)) })} />
                    <button type="button" className={`${btn} ml-auto`} onClick={() => patch({ consulted: draft.consulted.filter((_, j) => j !== i) })}>Remove</button>
                  </>
                ) : (
                  <><span className="text-sm font-semibold w-56">{c.name}</span><SignBox title={c.name} path={c.signature_path} urls={urls} editable={false} onSigned={() => {}} /></>
                )}
              </div>
            ))}
            {!(editing ? draft?.consulted.length : shownContent?.consulted.length) && <p className="m-0 text-sm text-muted">No one added.</p>}
            {editing && draft && <div><button type="button" className={btn} onClick={() => patch({ consulted: [...draft.consulted, { name: '', signature_path: null }] })}>+ Add a person</button></div>}
          </Sec>

          <Sec title="Legislation, chemicals, permits and review">
            {editing && draft ? (
              <>
                <Field label="Finlay safe work standards and legislation applicable to the works" hint="Starts with the standard list. Edit as needed." htmlFor="l-leg"><textarea id="l-leg" rows={6} value={draft.legislation} onChange={e => patch({ legislation: e.target.value })} className={textareaClass} /></Field>
                <div>
                  <div className={label}>Hazardous chemicals required</div>
                  {draft.chemicals.map((c, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <input aria-label="Chemical" value={c.name} onChange={e => patch({ chemicals: draft.chemicals.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="Chemical" className="min-h-10 flex-1 rounded-lg border border-[#D6D2CC] bg-white px-3 text-sm" />
                      <input aria-label="SDS number" value={c.sds} onChange={e => patch({ chemicals: draft.chemicals.map((x, j) => (j === i ? { ...x, sds: e.target.value } : x)) })} placeholder="SDS number or ID" className="min-h-10 w-44 rounded-lg border border-[#D6D2CC] bg-white px-3 text-sm" />
                      <button type="button" className={btn} onClick={() => patch({ chemicals: draft.chemicals.filter((_, j) => j !== i) })}>Remove</button>
                    </div>
                  ))}
                  <button type="button" className={btn} onClick={() => patch({ chemicals: [...draft.chemicals, { name: '', sds: '' }] })}>+ Add a chemical</button>
                </div>
                <Checks legend="Permits required" options={PERMIT_TYPES} value={draft.permit_types} onChange={v => patch({ permit_types: v })} />
                {draft.permit_types.includes('Other') && <Field label="Other permit" htmlFor="p-oth"><input id="p-oth" value={draft.permits} onChange={e => patch({ permits: e.target.value })} className={inputClass} /></Field>}
                <Checks legend="Review" options={REVIEW_CHECKS.map(r => r.label)} value={REVIEW_CHECKS.filter(r => draft.review_checks.includes(r.id)).map(r => r.label)} onChange={v => patch({ review_checks: REVIEW_CHECKS.filter(r => v.includes(r.label)).map(r => r.id) })} />
              </>
            ) : (
              <>
                <Read label="Legislation and standards" value={shownContent?.legislation} />
                {shownContent && shownContent.chemicals.length > 0 && <div><div className={label}>Hazardous chemicals</div>{shownContent.chemicals.map((c, i) => <div key={i} className="text-sm">{c.name}{c.sds && ` (SDS ${c.sds})`}</div>)}</div>}
                <Read label="Permits required" value={[...(shownContent?.permit_types ?? []), shownContent?.permits ? `(${shownContent.permits})` : ''].filter(Boolean).join(', ')} />
                <Read label="Reviewed" value={REVIEW_CHECKS.filter(r => shownContent?.review_checks.includes(r.id)).map(r => r.label).join('\n')} />
              </>
            )}
          </Sec>

          <Sec title="Personnel and equipment">
            {([['who_may', 'Occupations', 'Tradesperson'], ['qualifications', 'Qualifications, licences and training', 'Competency in mobile plant servicing\nLock out / tag out training'], ['tools', 'Tools and equipment', 'Torque wrench\nGrease gun\nSpill kit'], ['sops', 'Safe operating procedures (SOPs)', 'Safe Work Instructions TTS620T Service'], ['plant', 'Fixed and mobile plant and equipment', 'Terex Finlay TTS620T'], ['ppe', 'Safety, emergency equipment and PPE', 'Steel-capped safety boots\nLong sleeve high-vis clothing\nHearing protection'], ['emergency', 'In an emergency', 'Stop work, call 000, muster point']] as const).map(([k, l, ph]) => editing && draft ? (
              <Field key={k} label={l} hint="One per line" optional htmlFor={`x-${k}`}><textarea id={`x-${k}`} rows={3} value={draft[k]} onChange={e => patch({ [k]: e.target.value } as Partial<VersionContent>)} placeholder={ph} className={textareaClass} /></Field>
            ) : <Read key={k} label={l} value={shownContent?.[k]} />)}
            {editing && draft
              ? <Checks legend="Verification of competency (VOC)" options={VOC_TYPES} value={draft.voc} onChange={v => patch({ voc: v })} />
              : <Read label="Verification of competency" value={shownContent?.voc.join(', ')} />}
          </Sec>

          {/* Steps */}
          <section className="flex flex-col gap-3">
            <div><h2 className="m-0 text-base font-bold">Steps</h2><p className="m-0 mt-0.5 text-xs text-muted">Ratings use the Finlay matrix. After controls: 20 or more is Extreme, work does not proceed. 16 to 19 is High, the Project, Site or Operations Manager must approve.</p></div>
            {(shownContent?.steps ?? []).length === 0 && <div className={`${card} text-sm text-muted`}>No steps yet.</div>}
            {editing && draft
              ? draft.steps.map((s, i) => (
                <div key={i} className={`${card} flex flex-col gap-3`}>
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-ink text-white text-sm font-bold grid place-items-center">{i + 1}</span>
                    <div className="ml-auto flex gap-1.5">
                      <button type="button" className={btn} aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => moveStep(i, -1)}>↑</button>
                      <button type="button" className={btn} aria-label={`Move step ${i + 1} down`} disabled={i === draft.steps.length - 1} onClick={() => moveStep(i, 1)}>↓</button>
                      <button type="button" className={btn} onClick={() => patch({ steps: draft.steps.filter((_, j) => j !== i) })}>Remove</button>
                    </div>
                  </div>
                  <Field label="Section heading" optional hint="Steps with the same heading are grouped, such as Site arrival setup" htmlFor={`s-${i}-sec`}>
                    <input id={`s-${i}-sec`} list="swms-sections" value={s.section} onChange={e => setStep(i, { section: e.target.value })} className={inputClass} />
                  </Field>
                  <Field label="Work sequence: what is done" htmlFor={`s-${i}-step`}><input id={`s-${i}-step`} value={s.step} onChange={e => setStep(i, { step: e.target.value })} className={inputClass} /></Field>
                  <Field label="Potential hazards" hint="What could hurt someone in this step" htmlFor={`s-${i}-haz`}><textarea id={`s-${i}-haz`} rows={2} value={s.hazard} onChange={e => setStep(i, { hazard: e.target.value })} className={textareaClass} /></Field>
                  <div className="flex flex-wrap gap-6">
                    <RatingGrid label="Inherent risk (before controls)" likelihood={s.before?.[0] ?? null} consequence={s.before?.[1] ?? null} onChange={(l, c) => setStep(i, { before: [l, c] })} />
                    <RatingGrid label="Residual risk (after controls)" likelihood={s.after?.[0] ?? null} consequence={s.after?.[1] ?? null} onChange={(l, c) => setStep(i, { after: [l, c] })} />
                  </div>
                  <Field label="Action / control measure" hint="One per line, best control first" htmlFor={`s-${i}-ctl`}><textarea id={`s-${i}-ctl`} rows={3} value={s.controls} onChange={e => setStep(i, { controls: e.target.value })} className={textareaClass} /></Field>
                  <Field label="Action by" optional htmlFor={`s-${i}-who`}><input id={`s-${i}-who`} value={s.who} onChange={e => setStep(i, { who: e.target.value })} className={inputClass} placeholder="Technician" /></Field>
                  {s.risk_id && <div className="text-xs text-muted">From the risk register: {risks.find(r => r.id === s.risk_id)?.ref ?? 'a risk'}</div>}
                </div>
              ))
              : groupSteps(shownContent?.steps ?? []).map((g, gi) => (
                <div key={gi} className="flex flex-col gap-3">
                  {g.section && <h3 className="m-0 text-sm font-bold uppercase tracking-wide">{g.section}</h3>}
                  {g.steps.map(({ step: s, index: i }) => {
                    const b = stepLevel(s, 'before'); const a = stepLevel(s, 'after');
                    return (
                      <div key={i} className={`${card} flex gap-3`}>
                        <span className="w-7 h-7 shrink-0 rounded-full bg-ink text-white text-sm font-bold grid place-items-center">{i + 1}</span>
                        <div className="flex-1 min-w-0 flex flex-col gap-2 text-sm">
                          <div className="font-semibold">{s.step}</div>
                          <div><span className="text-muted">Hazards: </span>{s.hazard}</div>
                          <div className="flex flex-wrap items-center gap-2">{b && <Pill tone={LEVELS[b].tone}>Before: {stepCode(s, 'before')} {LEVELS[b].label}</Pill>}{a && <Pill tone={LEVELS[a].tone}>After: {stepCode(s, 'after')} {LEVELS[a].label}</Pill>}</div>
                          <div><span className="text-muted">Controls:</span><div className="whitespace-pre-wrap">{s.controls}</div></div>
                          {s.who && <div><span className="text-muted">Action by: </span>{s.who}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            {editing && draft && (
              <div className="flex flex-wrap items-center gap-2">
                <datalist id="swms-sections">{Array.from(new Set(draft.steps.map(s => s.section).filter(Boolean))).map(x => <option key={x} value={x} />)}</datalist>
                <button type="button" className={btn} onClick={() => patch({ steps: [...draft.steps, emptyStep(draft.steps[draft.steps.length - 1]?.section ?? '')] })}>+ Add a step</button>
                <select aria-label="Add a step from a risk" value="" onChange={e => { if (e.target.value) addFromRisk(e.target.value); }} className="min-h-10 rounded-lg border border-[#D6D2CC] bg-white px-2 text-sm max-w-[320px]">
                  <option value="">+ Add a step from the risk register…</option>
                  {risks.filter(r => r.status === 'active').map(r => <option key={r.id} value={r.id}>{r.ref} · {r.title}</option>)}
                </select>
              </div>
            )}
          </section>

          {/* Draft actions */}
          {editing && (
            <section className={`${card} flex flex-col gap-3 print:hidden`}>
              {problems.length > 0 && (
                <div role="alert" className="rounded-lg border border-[#F0DDA6] bg-[#FFF3D6] p-3 text-sm">
                  <b>Fix these before sending for approval:</b>
                  <ul className="m-0 mt-1 pl-5">{problems.map(p => <li key={p}>{p}</li>)}</ul>
                </div>
              )}
              <div className="flex flex-wrap gap-2 items-center">
                <button type="button" className={btn} disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'Saving…' : dirty ? 'Save draft' : 'Saved'}</button>
                <button type="button" className={primary} disabled={busy} onClick={() => void send()}>Send for approval</button>
                <button type="button" className={`${btn} ml-auto text-[#9B1218] border-[#E3B7B7]`} disabled={busy} onClick={async () => { if (await askConfirm({ title: `Discard draft version ${picked.version}?`, body: 'The draft is deleted. Approved versions are not affected.', confirmLabel: 'Discard draft', danger: true })) await run(async () => discardDraft(picked.id), () => setPickedId(null)); }}>Discard draft</button>
              </div>
              <p className="m-0 text-xs text-muted">Nothing is used on site until the WHS officer approves it with a signature.</p>
            </section>
          )}

          {/* Awaiting approval */}
          {picked.status === 'awaiting' && (
            <section className={`${card} flex flex-col gap-3 print:hidden`}>
              <h2 className="m-0 text-base font-bold">Approval</h2>
              <p className="m-0 text-sm">Sent for approval by {picked.submitted_by_name || 'the office'} on {picked.submitted_at ? formatWhen(picked.submitted_at) : ''}.{highAfterCount(picked.steps) > 0 ? ` ${highAfterCount(picked.steps)} step(s) are still high risk after controls.` : ''}</p>
              {officer ? (
                <>
                  <p className="m-0 text-sm text-muted">Read the steps above. Sign to approve this version. It becomes the version used on site and locks.</p>
                  <Field label="Your position" htmlFor="ap-pos"><input id="ap-pos" value={position} onChange={e => setPosition(e.target.value)} className={inputClass} placeholder="Service manager" /></Field>
                  <SignaturePad onChange={setSig} label="Approver's signature" />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={primary} disabled={busy || !sig || !position.trim()} onClick={() => void run(async () => approveVersion(picked.id, sig!, position.trim() || 'WHS Officer'), () => setSig(null))}>Approve and sign</button>
                  </div>
                  <div className="flex gap-2 items-end">
                    <Field label="Or send it back with a note" htmlFor="sb"><input id="sb" value={backNote} onChange={e => setBackNote(e.target.value)} className={inputClass} placeholder="Step 3 needs a stronger control" /></Field>
                    <button type="button" className={btn} disabled={busy || !backNote.trim()} onClick={() => void run(async () => sendBack(picked.id, backNote.trim()), () => setBackNote(''))}>Send back</button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-muted">Waiting for the WHS officer or an administrator.</span>
                  <button type="button" className={btn} disabled={busy} onClick={() => void run(async () => sendBack(picked.id, ''))}>Take it back to edit</button>
                </div>
              )}
            </section>
          )}

          {/* Approved: next actions */}
          {office && picked.status === 'approved' && (
            <section className={`${card} flex flex-col gap-3 print:hidden`}>
              <div className="flex flex-wrap gap-2">
                {open
                  ? <button type="button" className={btn} onClick={() => setPickedId(open.id)}>Go to version {open.version} ({VERSION_LABEL[open.status].label.toLowerCase()})</button>
                  : <button type="button" className={primary} disabled={busy} onClick={() => void run(async () => { const r = await startVersion(swms.id, contentFrom(picked)); if (r.data) setPickedId(r.data.id); return r; })}>Start a new version to change it</button>}
              </div>
              <form className="flex flex-col gap-2 border-t border-line-soft pt-3" onSubmit={e => { e.preventDefault(); void run(async () => addSwmsReview(swms.id, rev.on, rev.note.trim()), () => setRev({ ...rev, note: '' })); }}>
                <h3 className="m-0 text-sm font-bold">Review with no changes</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date" htmlFor="sr-on"><input id="sr-on" type="date" max={brisbaneDay(new Date())} value={rev.on} onChange={e => setRev({ ...rev, on: e.target.value })} className={inputClass} /></Field>
                  <Field label="Note" optional htmlFor="sr-note"><input id="sr-note" value={rev.note} onChange={e => setRev({ ...rev, note: e.target.value })} className={inputClass} /></Field>
                </div>
                <div><button type="submit" className={btn} disabled={busy || !rev.on}>Save review</button></div>
              </form>
            </section>
          )}
          {picked.status === 'approved' && approved?.id === picked.id && swms.status === 'active' && <SwmsSignOnSection key={picked.id} swms={swms} version={picked} user={user} />}
        </>
      )}

      {/* Details and review */}
      <section className={`${card} flex flex-col gap-2 text-sm print:hidden`}>
        <h2 className="m-0 text-base font-bold">Owner and review</h2>
        <div>{swms.owner_name} · reviewed every {swms.review_months} months{swms.reviewed_on ? ` · last reviewed ${formatDay(swms.reviewed_on)}${swms.reviewed_by_name ? ` by ${swms.reviewed_by_name}` : ''}` : ' · never reviewed'}{by ? ` · next ${formatDay(by)}` : ''}</div>
        <div>
          <span className="text-muted">Document file: </span>
          {swms.document_id
            ? <a href={hrefFor({ name: 'document', id: swms.document_id })} className="text-finlay">{docs.find(d => d.id === swms.document_id)?.title ?? 'Open the file'}</a>
            : <span className="text-muted">none linked</span>}
          {' '}
          {office && <select aria-label="Link a document" value={swms.document_id ?? ''} onChange={e => void run(async () => updateSwms(swms.id, { document_id: e.target.value || null }))} className="min-h-9 rounded-lg border border-[#D6D2CC] bg-white px-2 text-[13px] ml-1">
            <option value="">None</option>
            {docs.filter(d => d.doc_type === 'swms').map(d => <option key={d.id} value={d.id}>{[d.doc_no, d.title].filter(Boolean).join(' · ')}</option>)}
          </select>}
        </div>
        {reviews.length > 0 && (
          <div className="mt-1 border border-line rounded-xl">
            {reviews.map((v, i) => (
              <div key={v.id} className={`flex items-center gap-3 px-3.5 py-2.5 ${i ? 'border-t border-line-soft' : ''}`}>
                <span className="flex-1"><b>{formatDay(v.reviewed_on)}</b> · {v.reviewed_by_name || 'Unknown'}{v.note && <span className="block text-xs text-muted">{v.note}</span>}</span>
                {user.access === 'admin' && <button type="button" disabled={busy} className={btn} onClick={async () => { if (await askConfirm({ title: `Remove the ${formatDay(v.reviewed_on)} review?`, body: 'Only do this for a line entered by mistake.', confirmLabel: 'Remove', danger: true })) void run(async () => removeSwmsReview(v.id)); }}>Remove</button>}
              </div>
            ))}
          </div>
        )}
      </section>

      {office && history.length > 0 && (
        <section className="print:hidden">
          <div className={label}>History</div>
          <ul className="m-0 p-0 list-none text-[13px] text-muted">{history.map(h => <li key={h.id} className="py-0.5">{formatWhen(h.occurred_at)} · {h.actor_name}: {h.what}</li>)}</ul>
          <div className="text-xs text-muted mt-1">History cannot be edited.</div>
        </section>
      )}

      <div className={`${office ? 'flex' : 'hidden'} flex-wrap gap-2 print:hidden`}>
        <button type="button" disabled={busy} className={btn} onClick={() => void run(async () => updateSwms(swms.id, { status: swms.status === 'active' ? 'retired' : 'active' }))}>{swms.status === 'active' ? 'Retire this SWMS' : 'Put back in use'}</button>
        {user.access === 'admin' && <button type="button" disabled={busy} className={`${btn} text-[#9B1218] border-[#E3B7B7]`} onClick={async () => { if (await askConfirm({ title: `Delete ${swms.ref}?`, body: 'This removes the SWMS and all its versions for good. Retire it instead if it is no longer used.', confirmLabel: 'Delete', danger: true })) { setBusy(true); const r = await deleteSwms(swms.id); setBusy(false); if (r.error) setError(r.error); else go({ name: 'module', id: 'risk' }); } }}>Delete</button>}
      </div>
    </div>
    </>
  );
}
