/** The SWMS register: one line per SWMS, laid out like Finlay's register form. */

import { currentApproved, type Swms, type SwmsReview, type SwmsVersion } from './swms.ts';

export interface RegisterRow {
  /** Finlay's own SWMS number (falls back to the app ref) */
  no: string;
  riskRef: string;
  title: string;
  /** YYYY-MM-DD the works started, or '' */
  commenced: string;
  /** Up to four review dates, oldest first (the latest four when there are more) */
  reviews: string[];
  revision: string;
}

/**
 * Date works commenced: the expected start date of the first version that has one, otherwise the day the first
 * version was approved, otherwise the day the SWMS was created.
 */
export function commencedOn(s: Swms, versions: SwmsVersion[]): string {
  const sorted = [...versions].sort((a, b) => a.version - b.version);
  const start = sorted.find(v => v.expected_start)?.expected_start;
  if (start) return start.slice(0, 10);
  const approved = sorted.find(v => v.approved_at)?.approved_at;
  return (approved ?? s.created_at ?? '').slice(0, 10);
}

export function registerRows(swms: Swms[], versions: SwmsVersion[], reviews: SwmsReview[]): RegisterRow[] {
  return swms
    .filter(s => s.status === 'active')
    .map(s => {
      const vs = versions.filter(v => v.swms_id === s.id);
      const latest = currentApproved(vs) ?? [...vs].sort((a, b) => b.version - a.version)[0];
      const dates = [...new Set(reviews.filter(r => r.swms_id === s.id).map(r => r.reviewed_on.slice(0, 10)))].sort();
      return {
        no: s.swms_number || s.ref,
        riskRef: s.risk_register_ref,
        title: s.title,
        commenced: commencedOn(s, vs),
        reviews: dates.slice(-4),
        revision: latest ? `${latest.version}.0` : '',
      };
    })
    .sort((a, b) => a.no.localeCompare(b.no, 'en', { numeric: true }));
}
