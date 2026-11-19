/**
 * Builds the bulk of a JSA from the text of a Safe Work Instruction (SWI).
 * An SWI is written for one machine and has a fixed layout: safety rules ("2. Safety before and during maintenance"),
 * a procedure ("3. Procedure"), and short Hazards / Controls lists. The site, date, crew and the risk ratings are
 * deliberately left for the crew, because they depend on the job and the site.
 */

import { emptyStep, type SwmsStep } from './swms.ts';
import type { JsaContent } from './jsa.ts';

export interface SwiMeta { docNo: string; title: string; version?: string }

export interface SwiDraft {
  content: Pick<JsaContent, 'title' | 'work_covered' | 'steps' | 'ppe' | 'permits'>;
  /** Plain-English notes on what was and was not picked up, shown to the person making the JSA. */
  notes: string[];
}

const NOISE = /disclaimer|foreseeable operation|operation outside the scope|scope contemplated|separate risk assessment|^page \d+ of \d+/i;
const MAX_PER_STEP = 8;

function clean(text: string): string[] {
  return text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l && !NOISE.test(l));
}

const numbered = /^\(?(\d{1,2})[.)]?\)?\s+(\S.*)$/;

/**
 * Pulls numbered items out of lines. A number only starts a new item if it follows on (1, 2, 3...),
 * so a wrapped line such as "13 mm spanner" is not mistaken for a new item. A restart at 1 begins a new run.
 */
export function numberedItems(lines: string[]): string[][] {
  const runs: string[][] = [];
  let last = 0;
  for (const line of lines) {
    const m = numbered.exec(line);
    const n = m ? Number(m[1]) : 0;
    if (m && (n === last + 1 || n === 1)) {
      if (n === 1) runs.push([]);
      runs[runs.length - 1].push(m[2]);
      last = n;
    } else if (runs.length) {
      const r = runs[runs.length - 1];
      r[r.length - 1] = `${r[r.length - 1]} ${line}`;
    }
  }
  return runs;
}

const SECTION_WORDS = /^(preparation|pre-?start|final inspection|tracking|engine|hydraulic|electrical|cleaning|shut ?down|start-?up|installation|removal|isolation|procedure)$/i;
const headingLike = (l: string) => l.split(' ').length <= 4 && !/[.:;]$/.test(l) && !/\d/.test(l) && /^[A-Z]/.test(l);

interface Section { heading: string; /** Unnumbered lines that come before the numbered steps */ intro: string[]; items: string[] }

function procedureSections(lines: string[]): Section[] {
  const sections: Section[] = [];
  let cur: Section | null = null;
  let last = 0;
  const open = (heading: string) => { cur = { heading, intro: [], items: [] }; sections.push(cur); last = 0; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = numbered.exec(line);
    const n = m ? Number(m[1]) : 0;
    if (m && (n === last + 1 || n === 1)) {
      if (!cur) open('Procedure');
      else if (n === 1 && last > 0) open('Procedure (continued)');
      cur!.items.push(m[2]);
      last = n;
      continue;
    }
    const next = lines[i + 1] ?? '';
    const nextIsOne = numbered.exec(next)?.[1] === '1';
    if (SECTION_WORDS.test(line) || (headingLike(line) && nextIsOne)) { open(titleCase(line)); continue; }
    if (!cur) open('Procedure');
    // Lines in a section with no numbering are separate points; in a numbered one they wrap from the step above.
    if (last > 0 && cur!.items.length) cur!.items[cur!.items.length - 1] += ` ${line}`;
    else cur!.intro.push(line);
  }
  return sections.filter(s => s.items.length || s.intro.length);
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const HAZARD_WORDS: [RegExp, string][] = [
  [/crush|jack.?stand|blocks|guards?\b|moving parts|rotating|entangle/i, 'Crush or entanglement from moving parts'],
  [/hydraulic[^.]*(pressure|leak)|penetrate the skin/i, 'Hydraulic fluid under pressure (injection injury)'],
  [/exhaust|ventilat|fumes/i, 'Exhaust fumes'],
  [/smok|open flame|fuel|fire/i, 'Fire or fuel spill'],
  [/battery|electrolyte|acid/i, 'Battery acid and electrical short'],
  [/harness|above 2 ?m|fall from|working at height/i, 'Fall from height'],
  [/overhead wires|overhead power/i, 'Contact with overhead wires'],
  [/\bhot\b|burn/i, 'Hot surfaces and fluids'],
  [/slip|trip/i, 'Slips, trips and falls'],
  [/noise|hearing/i, 'Noise'],
  [/flying particles|dust|eye injury|eye protection/i, 'Eye injury from dust or flying particles'],
  [/lifting|manual handling|musculoskeletal|heavy/i, 'Manual handling strain'],
  [/work alone|never work alone/i, 'Working alone with no one to raise the alarm'],
];

export function hazardsIn(text: string): string[] {
  return HAZARD_WORDS.filter(([re]) => re.test(text)).map(([, label]) => label);
}

const PPE_WORDS: [RegExp, string][] = [
  [/hard hat/i, 'Hard hat'], [/safety glasses|eye protection/i, 'Safety glasses'], [/face shield/i, 'Face shield'],
  [/mono ?goggles|goggles/i, 'Goggles'], [/hearing protection|ear ?muffs|ear plugs/i, 'Hearing protection'],
  [/gloves/i, 'Gloves'], [/safety boots|steel.?cap/i, 'Safety boots'], [/hi.?vis/i, 'Hi-vis clothing'],
  [/harness/i, 'Harness (work above 2 m)'], [/respirator|dust mask/i, 'Respirator or dust mask'],
];

export function ppeIn(text: string): string[] {
  return PPE_WORDS.filter(([re]) => re.test(text)).map(([, label]) => label);
}

const firstSentence = (s: string) => {
  const m = /^(.*?[.!?])(\s|$)/.exec(s);
  const t = (m ? m[1] : s).trim();
  return t.length > 180 ? `${t.slice(0, 177)}…` : t;
};

const idx = (lines: string[], re: RegExp, from = 0) => { for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i; return -1; };

export function swiToJsa(text: string, meta: SwiMeta): SwiDraft {
  const lines = clean(text);
  const notes: string[] = [];
  const ref = [meta.docNo, meta.title].filter(Boolean).join(' ');
  const based = `Based on ${ref}${meta.version ? `, version ${meta.version}` : ''}.`;

  const safetyAt = idx(lines, /^2\.?\s*safety before/i);
  const procAt = idx(lines, /^3\.?\s*procedure/i, Math.max(safetyAt, 0));
  const riskAt = idx(lines, /^plant risk assessment/i, Math.max(procAt, 0));
  const hazAt = idx(lines, /^hazards:?$/i, Math.max(procAt, 0));
  const ctlAt = hazAt >= 0 ? idx(lines, /^controls:?$/i, hazAt) : -1;
  const end = riskAt >= 0 ? riskAt : lines.length;

  // Safety rules: the numbered rules in section 2 and the electrical and engine rules after them.
  const rulesLines = safetyAt >= 0 ? lines.slice(safetyAt + 1, procAt >= 0 ? procAt : end).filter(l => !/^electrical and engine safety/i.test(l)) : [];
  const rules = numberedItems(rulesLines).flat();

  // Procedure and the SWI's own hazards and controls lists.
  const procEnd = hazAt >= 0 ? hazAt : end;
  const procLines = procAt >= 0 ? lines.slice(procAt + 1, procEnd) : [];
  const sections = procedureSections(procLines);
  const swiHazards = hazAt >= 0 ? numberedItems(lines.slice(hazAt + 1, ctlAt >= 0 ? ctlAt : end)).flat() : [];
  const swiControls = ctlAt >= 0 ? numberedItems(lines.slice(ctlAt + 1, end)).flat() : [];

  const steps: SwmsStep[] = [];
  const procHazards = [...swiHazards, ...hazardsIn(sections.map(s => [...s.intro, ...s.items].join(' ')).join(' ')).filter(h => !swiHazards.some(x => x.toLowerCase().includes(h.split(' ')[0].toLowerCase())))];

  if (rules.length) {
    const s = emptyStep('Before work starts');
    s.step = 'Make the machine and area safe before starting';
    s.hazard = hazardsIn(rules.join(' ')).join('\n');
    s.controls = rules.map(firstSentence).join('\n');
    s.who = 'All crew';
    steps.push(s);
  } else notes.push('No safety rules were found in the SWI, so the "before work starts" step was not made.');

  for (const sec of sections) {
    for (let from = 0; from < Math.max(sec.items.length, 1); from += MAX_PER_STEP) {
      const part = sec.items.slice(from, from + MAX_PER_STEP);
      const label = sec.items.length > MAX_PER_STEP ? `${sec.heading} (${from + 1}–${from + part.length})` : sec.heading;
      const s = emptyStep(sec.heading);
      s.step = [label, ...(from === 0 ? sec.intro : []), ...part.map((p, i) => `${from + i + 1}. ${p}`)].join('\n');
      s.hazard = procHazards.join('\n');
      s.controls = swiControls.join('\n');
      steps.push(s);
    }
  }
  if (!sections.length) notes.push('The procedure could not be read from the file (it may be a scan or laid out as pictures). Add the steps yourself.');
  if (sections.length && !swiHazards.length) notes.push('The SWI has no Hazards list, so the hazards for each step were worked out from its wording. Check them.');
  if (!steps.length) steps.push(emptyStep());

  const all = lines.join(' ');
  const ppe = ppeIn(all);
  const permits = /lock.?out|isolat/i.test(all) ? 'Isolation and personal lock-out before any work on the machine' : '';
  if (!ppe.length) notes.push('No PPE was named in the text. The SWI shows PPE as pictures, so tick what is needed.');

  notes.push('Risk ratings are left blank on purpose. Rate each step for this job and this site.');
  return { content: { title: meta.title ? `${meta.title} (from ${meta.docNo || 'SWI'})` : 'JSA from SWI', work_covered: based, steps, ppe: ppe.join(', '), permits }, notes };
}
