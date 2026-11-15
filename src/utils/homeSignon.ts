/** Sign-on items for the home screen: what a worker still has to sign, and which jobs have crew who have not. */

import type { HomeData } from './homeData.ts';
import { jobsWithGaps, outstandingFor, type Job, type JobPerson, type JobSwms, type SignOn } from './signon.ts';
import type { Swms, SwmsVersion } from './swms.ts';

export interface SignonRaw {
  jobs: Job[];
  jobSwms: JobSwms[];
  jobPeople: JobPerson[];
  signons: SignOn[];
  swms: Swms[];
  versions: SwmsVersion[];
  /** Active people (office roles only get a list) */
  people: { id: string; name: string }[];
  /** The worker record linked to the person logged in */
  mine: string | null;
}

export function withSignOns(home: HomeData, raw: SignonRaw, now: Date = new Date()): HomeData {
  let out = home;
  if (raw.mine) {
    const todo = outstandingFor(raw.mine, raw.jobs, raw.jobSwms, raw.jobPeople, raw.swms, raw.versions, raw.signons, now);
    out = {
      ...out,
      phoneToSign: [
        ...todo.map(t => ({
          id: `signon-${t.swms.id}`,
          title: t.swms.title,
          detail: `${t.job ? t.job.name : 'SWMS'} · ${t.again ? 'new version, sign again' : 'read and sign on'}`,
          pill: t.again ? 'Sign again' : 'Sign on',
          tone: t.again ? ('amber' as const) : ('blue' as const),
          href: `#/swms/${t.swms.id}`,
        })),
        ...out.phoneToSign,
      ],
    };
  }
  const gaps = jobsWithGaps(raw.jobs, raw.jobSwms, raw.jobPeople, raw.people, raw.versions, raw.signons, now);
  if (gaps.length) {
    const people = gaps.reduce((n, g) => n + g.missing, 0);
    const prev = out.navCounts.risk ?? 0;
    out = {
      ...out,
      attention: [...out.attention, { id: 'signon-gaps', urgency: 'due_soon', title: `${people} SWMS sign-on${people === 1 ? '' : 's'} still to do on ${gaps.length} job${gaps.length === 1 ? '' : 's'}`, detail: gaps.slice(0, 3).map(g => g.job.name).join(', '), moduleId: 'risk', href: '#/m/risk/jobs' }],
      navCounts: { ...out.navCounts, risk: prev + gaps.length },
    };
  }
  return out;
}
