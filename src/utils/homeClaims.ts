/** Claim alerts on the home screen: certificates ending or lapsed, missed appointments, return to work reviews, insurer notice. */

import type { HomeData } from './homeData.ts';
import { claimAttention, isOpen, STATES, type Appointment, type Certificate, type Claim, type ClaimAttention } from './claims.ts';

const RANK: Record<string, number> = { red: 0, amber: 1 };

export function withClaims(
  home: HomeData,
  claims: Claim[],
  certs: Certificate[],
  appts: Appointment[],
  names: Map<string, string>,
  now: Date = new Date(),
): HomeData {
  const attention = [...home.attention];
  let needing = 0;
  for (const c of claims.filter(isOpen)) {
    const alerts: ClaimAttention[] = claimAttention(
      c,
      certs.filter(x => x.claim_id === c.id),
      c.injury_date ? `${c.injury_date}T12:00:00+10:00` : c.created_at,
      now,
      appts.filter(a => a.claim_id === c.id),
    ).filter(a => a.tone in RANK);
    if (!alerts.length) continue;
    alerts.sort((a, b) => RANK[a.tone] - RANK[b.tone]);
    needing++;
    const worst = alerts[0] as ClaimAttention;
    const who = names.get(c.person_id) ?? 'A worker';
    const more = alerts.length > 1 ? ` · ${alerts.length - 1} more on this claim` : '';
    attention.push({
      id: `claim-${c.id}`,
      urgency: worst.tone === 'red' ? 'overdue' : 'due_soon',
      title: `${who}: ${worst.what}`.slice(0, 140),
      detail: `${STATES[c.state].scheme} claim${more}`,
      moduleId: 'people',
      href: `#/people/${c.person_id}`,
    });
  }
  return { ...home, attention, navCounts: { ...home.navCounts, ...(needing ? { people: needing } : {}) } };
}
