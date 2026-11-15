import type { ReactNode } from 'react';
import { COMPANY, groupSteps, HIGH_RISK_AREAS, PERMIT_TYPES, REVIEW_CHECKS, stepCode, swmsReviewBy, VOC_TYPES, type Swms, type SwmsVersion } from '../utils/swms.ts';
import { CONSEQUENCES, LIKELIHOODS, riskLevel, riskScore, type RiskLevel } from '../utils/risks.ts';
import { formatDay } from '../utils/dates.ts';

const cell = 'border border-[#2A6FA8] px-2 py-1 align-top';
const head = `${cell} bg-[#D9E5F3] font-bold`;
const box = (on: boolean) => (on ? '☒' : '☐');
const MATRIX_BG: Record<RiskLevel, string> = { low: '#99CC00', medium: '#FFFF00', high: '#FFB000', extreme: '#FF0000' };
const lines = (t: string) => t.split('\n').map(x => x.trim()).filter(Boolean);

function Bullets({ text }: { text: string }) {
  const l = lines(text);
  return l.length ? <ul className="m-0 pl-4">{l.map((x, i) => <li key={i}>{x}</li>)}</ul> : null;
}

function Page({ children, version, published }: { children: ReactNode; version: SwmsVersion; published: string }) {
  return (
    <section className="swms-page break-after-page">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[26px] font-medium font-sans">Safe Work Method Statement (SWMS)</div>
        <img src="/finlay-logo.jpg" alt="Finlay" className="h-10" />
      </div>
      {children}
      <div className="mt-3 text-[10px]"><b>Version:</b> {version.version}.0 <b>Date Published:</b> {published}</div>
    </section>
  );
}

/** The printed SWMS, laid out like the Finlay form. Only shows when printing. */
export function SwmsPrint({ swms, version, sigs, risksRef }: { swms: Swms; version: SwmsVersion; sigs: Record<string, string>; risksRef: string }) {
  const published = formatDay((version.approved_at ?? version.updated_at).slice(0, 10));
  const sig = (p: string | null) => (p && sigs[p] ? <img src={sigs[p]} alt="Signature" className="h-8" /> : null);
  const groups = groupSteps(version.steps);
  return (
    <div className="hidden print:block text-[11px] leading-snug text-black">
      <style>{'@page { size: A4 landscape; margin: 10mm; } .break-after-page { break-after: page; } .swms-page:last-child { break-after: auto; }'}</style>
      <Page version={version} published={published}>
        <table className="w-full border-collapse mb-0">
          <tbody>
            <tr><td className={head}>Risk Register Ref No:</td><td className={cell}>{swms.risk_register_ref}</td><td className={head}>Date:</td><td className={cell}>{published}</td><td className={head}>SWMS Number:</td><td className={cell}>{swms.swms_number || swms.ref}</td><td className={head}>Rev:</td><td className={cell}>{version.version}</td></tr>
            <tr><td className={head}>Site / Project Name:</td><td className={cell} colSpan={3}>{version.site_name}</td><td className={head}>Site Address / Location:</td><td className={cell} colSpan={3}>{version.site_address}</td></tr>
            <tr><td className={head}>Work Activity</td><td className={cell} colSpan={3}>{version.work_covered}</td><td className={head}>Company Name, Address &amp; ABN</td><td className={cell} colSpan={3}>{COMPANY.name}<br />{COMPANY.address}<br />{COMPANY.abn}</td></tr>
            <tr><td className={head}>Finlay Safe Work Standards / Legislation Applicable to Works</td><td className={cell} colSpan={7}><Bullets text={version.legislation} /></td></tr>
          </tbody>
        </table>
      </Page>
      <Page version={version} published={published}>
        <div className={head}>High Risk Areas involved in Activity (tick all applicable)</div>
        <div className="grid grid-cols-3 border border-[#2A6FA8] p-2 gap-x-4">
          {HIGH_RISK_AREAS.map(a => <div key={a}>{box(version.high_risk_areas.includes(a))} {a}</div>)}
          <div>{box(Boolean(version.high_risk_other))} {version.high_risk_other || '(other)'}</div>
        </div>
        <table className="w-full border-collapse mt-2">
          <tbody>
            <tr><td className={head} colSpan={2}>SWMS Scribe or Author</td><td className={head} colSpan={2}>Supervisor of the Work Activity</td><td className={head} colSpan={2}>Authorised Approval</td></tr>
            <tr><td className={head}>Name:</td><td className={cell}>{version.created_by_name}</td><td className={head}>Name:</td><td className={cell}>{version.supervisor_name}</td><td className={head}>Name:</td><td className={cell}>{version.approved_by_name}</td></tr>
            <tr><td className={head}>Position</td><td className={cell}>{version.author_position}</td><td className={head}>Position:</td><td className={cell}>{version.supervisor_position}</td><td className={head}>Position:</td><td className={cell}>{version.approver_position}</td></tr>
            <tr><td className={head}>Signature:</td><td className={cell}>{sig(version.author_signature_path)}</td><td className={head}>Signature:</td><td className={cell}>{sig(version.supervisor_signature_path)}</td><td className={head}>Signature:</td><td className={cell}>{sig(version.signature_path)}</td></tr>
            <tr><td className={head}>Date:</td><td className={cell}>{version.submitted_at ? formatDay(version.submitted_at.slice(0, 10)) : ''}</td><td className={head}>Contact details</td><td className={cell}>{version.supervisor_contact}</td><td className={head}>Date:</td><td className={cell}>{version.approved_at ? formatDay(version.approved_at.slice(0, 10)) : ''}</td></tr>
            <tr><td className={head}>Expected Start date</td><td className={cell} colSpan={5}>{version.expected_start ? formatDay(version.expected_start) : ''}</td></tr>
          </tbody>
        </table>
        <table className="w-full border-collapse mt-2">
          <thead><tr><th className={`${head} text-center`} colSpan={4}>Persons Consulted in the Development of this SWMS</th></tr><tr><th className={head}>Name</th><th className={head}>Signature</th><th className={head}>Name</th><th className={head}>Signature</th></tr></thead>
          <tbody>
            {Array.from({ length: Math.max(1, Math.ceil(version.consulted.length / 2)) }).map((_, r) => (
              <tr key={r}>{[0, 1].map(c => { const p = version.consulted[r * 2 + c]; return [<td key={`n${c}`} className={cell}>{p?.name}</td>, <td key={`s${c}`} className={cell}>{sig(p?.signature_path ?? null)}</td>]; })}</tr>
            ))}
          </tbody>
        </table>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <table className="border-collapse w-full">
            <thead><tr><th className={head}>Hazardous Chemicals Required</th><th className={head}>SDS Number/ID</th></tr></thead>
            <tbody>{(version.chemicals.length ? version.chemicals : [{ name: '', sds: '' }]).map((c, i) => <tr key={i}><td className={cell}>{c.name || ' '}</td><td className={cell}>{c.sds}</td></tr>)}</tbody>
          </table>
          <table className="border-collapse w-full">
            <thead><tr><th className={head}>Review</th><th className={head}>Reviewed</th></tr></thead>
            <tbody>
              {REVIEW_CHECKS.map(r => <tr key={r.id}><td className={cell}>{r.label}</td><td className={`${cell} text-center`}>{version.review_checks.includes(r.id) ? 'Yes' : ''}</td></tr>)}
              <tr><td className={cell}>SWMS Scheduled Review Date</td><td className={`${cell} text-center`}>{formatDay(swmsReviewBy(swms))}</td></tr>
            </tbody>
          </table>
        </div>
        <div className={`${cell} mt-2`}><b>Permits Required?</b> {box(version.permit_types.length > 0)} {PERMIT_TYPES.map(p => `${box(version.permit_types.includes(p))} ${p}`).join('   ')} {version.permits && `(${version.permits})`}</div>
      </Page>
      <Page version={version} published={published}>
        <table className="w-full border-collapse">
          <thead><tr><th className={`${head} text-center`} colSpan={2}>Personnel Details</th><th className={`${head} text-center`} colSpan={2}>Equipment Details</th></tr></thead>
          <tbody>
            <tr><td className={head}>Occupations</td><td className={cell}><Bullets text={version.who_may} /></td><td className={head}>Tools and Equipment</td><td className={cell}><Bullets text={version.tools} />{version.sops && <><b>This task must be carried out in accordance with these Safe Operating Procedures (SOPs):</b><Bullets text={version.sops} /></>}</td></tr>
            <tr><td className={head}>Qualifications</td><td className={cell}><Bullets text={version.qualifications} /></td><td className={head}>Fixed &amp; Mobile Plant and Equipment</td><td className={cell}><Bullets text={version.plant} /></td></tr>
            <tr><td className={head}>Verification of Competency (VOC)</td><td className={cell}>{VOC_TYPES.map(v => <div key={v}>{box(version.voc.includes(v))} {v}</div>)}</td><td className={head}>Safety / Emergency Equipment and PPE</td><td className={cell}><Bullets text={version.ppe} /></td></tr>
            {version.emergency && <tr><td className={head}>In an emergency</td><td className={cell} colSpan={3}><Bullets text={version.emergency} /></td></tr>}
          </tbody>
        </table>
      </Page>
      <Page version={version} published={published}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="font-bold mb-1">1) Identify Consequence</div>
            <table className="w-full border-collapse"><tbody>{[...CONSEQUENCES].reverse().map(c => <tr key={c.n}><td className={head}>C{c.n}-{c.label}</td><td className={cell}>{c.sub}</td></tr>)}</tbody></table>
            <div className="font-bold mt-2 mb-1">2) Identify Likelihood</div>
            <table className="w-full border-collapse"><tbody>{LIKELIHOODS.map(l => <tr key={l.n}><td className={head}>L{l.n}-{l.label}</td><td className={cell}>{l.sub}</td></tr>)}</tbody></table>
          </div>
          <div>
            <div className="font-bold mb-1">3) Score Risk</div>
            <table className="w-full border-collapse text-center">
              <thead><tr><th className={head}></th>{CONSEQUENCES.map(c => <th key={c.n} className={head}>C{c.n} {c.label}</th>)}</tr></thead>
              <tbody>{LIKELIHOODS.map(l => <tr key={l.n}><td className={head}>L{l.n} {l.label}</td>{CONSEQUENCES.map(c => { const lv = riskLevel(l.n, c.n) as RiskLevel; return <td key={c.n} className={cell} style={{ background: MATRIX_BG[lv] }}>{lv[0].toUpperCase() + lv.slice(1)}<br /><b>{riskScore(l.n, c.n)}</b></td>; })}</tr>)}</tbody>
            </table>
            <div className="font-bold mt-2 mb-1">4) Determine Management Response (level of risk after controls)</div>
            <table className="w-full border-collapse"><tbody>
              <tr><td className={cell} style={{ background: MATRIX_BG.extreme }}>20-25 Extreme</td><td className={cell}><b>Stop</b> – work is not to proceed without additional controls applied. Consult HSSE Advisor for guidance.</td></tr>
              <tr><td className={cell} style={{ background: MATRIX_BG.high }}>16-19 High</td><td className={cell}><b>Stop</b> – re-evaluate controls to determine whether additional controls can be applied. High residual risk must be approved by the Project / Site / Operations Manager.</td></tr>
              <tr><td className={cell} style={{ background: MATRIX_BG.medium }}>9-15 Medium</td><td className={cell}>Ensure all controls identified in the SWMS are implemented and understood by work crews. Re-evaluate risks if controls are not applied or the scope changes.</td></tr>
              <tr><td className={cell} style={{ background: MATRIX_BG.low }}>1-8 Low</td><td className={cell}></td></tr>
            </tbody></table>
          </div>
        </div>
      </Page>
      <Page version={version} published={published}>
        <table className="w-full border-collapse">
          <thead><tr><th className={head}>Work Sequence / Basic Task Steps</th><th className={head}>Potential Hazards</th><th className={head}>Inherent Risk Score</th><th className={head}>Action / Control Measure</th><th className={head}>Residual Risk Score</th><th className={head}>Action by</th></tr></thead>
          <tbody>
            {groups.map((g, gi) => [
              g.section ? <tr key={`h${gi}`}><td className={`${cell} text-[14px] font-bold uppercase`} colSpan={6}>{g.section}</td></tr> : null,
              ...g.steps.map(({ step, index }) => (
                <tr key={index} className="break-inside-avoid">
                  <td className={cell}>{step.step}</td><td className={cell}>{step.hazard}</td><td className={`${cell} text-center`}>{stepCode(step, 'before')}</td>
                  <td className={cell}><Bullets text={step.controls} /></td><td className={`${cell} text-center`}>{stepCode(step, 'after')}</td><td className={cell}>{step.who}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
        <div className="mt-1 text-[10px]">{risksRef}</div>
      </Page>
    </div>
  );
}
