import { useState } from 'react';

const card = 'bg-white border border-line rounded-xl px-4.5 py-4';

const DOCS = [
  {
    id: 'swms', name: 'SWMS', full: 'Safe Work Method Statement', tone: 'border-t-[#9B1218]',
    what: 'A written statement for a specific job that lists the high risk work, the hazards and the controls, step by step. The workers doing the job are consulted and sign on to it.',
    law: 'Required by law before high risk construction work starts. A site, client or principal contractor can also ask for one for other work.',
    when: 'Work at height over 2 m, energised electrical work, confined spaces, work near powered mobile plant, excavation over 1.5 m, hazardous chemicals or fuel lines, and the other high risk areas on the SWMS form.',
    where: 'Risk & SWMS, SWMS tab (approval by the WHS officer, version history, sign-on).',
  },
  {
    id: 'jsa', name: 'JSA', full: 'Job Safety Analysis (also called JHA or JSEA)', tone: 'border-t-[#C98A10]',
    what: 'A quick, job-specific risk assessment: break the job into steps, say what could hurt someone and how each hazard is controlled. Often done on the day by the crew and supervisor.',
    law: 'Not a defined legal document. It is a way of managing risk. It does not replace a SWMS where one is required.',
    when: 'Lower-risk, one-off or changing jobs, or a site that asks for a JSA. A good check on the day, even when a SWMS already exists.',
    where: 'Risk & SWMS, JSA tab (print it and the crew sign the paper copy).',
  },
  {
    id: 'swi', name: 'SWI', full: 'Safe Work Instruction (also called a SOP)', tone: 'border-t-[#1E6B3A]',
    what: 'A standing procedure for how Finlay does a routine task or operates a machine. Written once and used again and again. It is not about one job or one site.',
    law: 'Not a legal document and not a risk assessment of a particular job. It supports a SWMS or JSA, which can list the SWI numbers that apply.',
    when: 'Repeatable tasks and equipment, such as changing a jaw plate or operating a screen.',
    where: 'Documents (SWI-001 and up). Reference the numbers in the SOPs section of a SWMS.',
  },
] as const;

const CHOICES = [
  { id: 'high', q: 'I am doing high risk work on a job (height, energised electrical, confined space, powered mobile plant, trenching, hazardous chemicals or fuel lines)', a: 'swms', note: 'You need a SWMS. It is a legal requirement for high risk construction work. A JSA is a good extra check on the day, but it does not replace the SWMS.' },
  { id: 'low', q: 'I am doing a lower-risk or one-off job and want to check the hazards and controls', a: 'jsa', note: 'A JSA fits. If you tick any high risk area in it, the app tells you that a SWMS is needed.' },
  { id: 'routine', q: 'I want to write down how we always do a routine task or run a machine', a: 'swi', note: 'That is a Safe Work Instruction. Put it in Documents. It is not enough on its own for a job at a customer site.' },
  { id: 'rejected', q: 'A site rejected my document', a: 'swms', note: 'Ask the site exactly what they need. The usual reason is a SWI or JSA sent where they need a SWMS (for high risk construction work), or the site wants its own template. A SWI describes how a task is normally done. It does not cover this job, its site, or the crew signing on.' },
] as const;

/** Plain-words guide to the three documents, so people know which one to use. */
export function DocGuidePage() {
  const [pick, setPick] = useState<string>('');
  const choice = CHOICES.find(c => c.id === pick);
  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div>
        <h1 className="m-0 text-2xl font-bold">Which document do I need?</h1>
        <p className="mt-1.5 mb-0 text-muted text-[15px]">SWMS, JSA and SWI sound alike but they do different jobs. They are not interchangeable.</p>
      </div>

      <section className={`${card} flex flex-col gap-3`} aria-label="Pick what you are doing">
        <h2 className="m-0 text-base font-bold">What are you doing?</h2>
        <div className="flex flex-col gap-2">
          {CHOICES.map(c => (
            <button key={c.id} type="button" aria-pressed={pick === c.id} onClick={() => setPick(c.id)} className={`text-left min-h-11 px-3.5 py-2.5 rounded-lg border text-sm cursor-pointer ${pick === c.id ? 'bg-ink text-white border-ink' : 'bg-white border-[#D6D2CC]'}`}>{c.q}</button>
          ))}
        </div>
        {choice && (
          <div role="status" className="rounded-xl border-2 border-[#1E6B3A] bg-[#EAF5EE] px-4 py-3 text-sm">
            <div className="font-bold text-base mb-1">Use a {DOCS.find(d => d.id === choice.a)?.name}</div>
            {choice.note}
          </div>
        )}
      </section>

      <div className="grid md:grid-cols-3 gap-4">
        {DOCS.map(d => (
          <section key={d.id} className={`${card} border-t-4 ${d.tone} flex flex-col gap-2.5 text-sm`}>
            <div><h2 className="m-0 text-xl font-bold">{d.name}</h2><div className="text-xs text-muted">{d.full}</div></div>
            <p className="m-0">{d.what}</p>
            <div><div className="text-xs font-semibold text-muted">Legal status</div>{d.law}</div>
            <div><div className="text-xs font-semibold text-muted">Use it for</div>{d.when}</div>
            <div><div className="text-xs font-semibold text-muted">In this app</div>{d.where}</div>
          </section>
        ))}
      </div>

      <section className={`${card} overflow-x-auto`} aria-label="Comparison">
        <table className="w-full border-collapse text-sm">
          <thead><tr className="text-left text-muted text-xs uppercase tracking-wide"><th className="py-2 pr-3" /><th className="py-2 pr-3">SWMS</th><th className="py-2 pr-3">JSA</th><th className="py-2">SWI</th></tr></thead>
          <tbody>
            {[
              ['About', 'One job, one site', 'One job, one site', 'A routine task, any site'],
              ['Required by law', 'Yes, for high risk construction work', 'No', 'No'],
              ['Rates the risk', 'Yes, before and after controls', 'Yes, before and after controls', 'Not for a particular job'],
              ['Crew sign on', 'Yes, to the approved version', 'Yes, on the printed copy', 'No'],
              ['Approved by', 'WHS officer or admin, signed', 'Supervisor completes it', 'Document owner'],
              ['When written', 'Before the work starts', 'Before or on the day', 'Once, then reviewed'],
            ].map(r => <tr key={r[0]} className="border-t border-line-soft align-top"><th scope="row" className="py-2 pr-3 text-left font-semibold">{r[0]}</th><td className="py-2 pr-3">{r[1]}</td><td className="py-2 pr-3">{r[2]}</td><td className="py-2">{r[3]}</td></tr>)}
          </tbody>
        </table>
      </section>

      <p className="m-0 text-xs text-muted">General guidance, not legal advice. The exact rules depend on the state and the type of work, and sites and clients often have stricter requirements of their own. When unsure, ask the WHS officer, the site, or the regulator (WHSQ in Queensland).</p>
    </div>
  );
}
