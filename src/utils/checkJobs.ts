/** Repair and follow-up work that comes out of a check: quote, approval, PO, booking, done. */

import type { Tone } from './attention.ts';

export type JobStatus = 'quoted' | 'approved' | 'po_raised' | 'done' | 'cancelled';

export interface CheckJob {
  id: string;
  check_id: string;
  title: string;
  supplier: string;
  quote_ref: string;
  quote_amount: number | null;
  po_number: string;
  status: JobStatus;
  booked_for: string | null;
  approved_by_name: string;
  approved_on: string | null;
  notes: string;
  file_path: string | null;
  file_name: string | null;
  created_by_name: string;
  created_at: string;
}

const LABEL: Record<JobStatus, { text: string; tone: Tone }> = {
  quoted: { text: 'Quote waiting for approval', tone: 'amber' },
  approved: { text: 'Approved, PO needed', tone: 'amber' },
  po_raised: { text: 'PO raised', tone: 'blue' },
  done: { text: 'Done', tone: 'green' },
  cancelled: { text: 'Cancelled', tone: 'grey' },
};

export function jobLabel(status: JobStatus): { text: string; tone: Tone } {
  return LABEL[status];
}

/** The status moves one step at a time; a WHS officer approves a quote. */
export function nextSteps(status: JobStatus): { to: JobStatus; label: string }[] {
  if (status === 'quoted') return [{ to: 'approved', label: 'Approve quote' }, { to: 'cancelled', label: 'Cancel' }];
  if (status === 'approved') return [{ to: 'po_raised', label: 'PO raised' }, { to: 'cancelled', label: 'Cancel' }];
  if (status === 'po_raised') return [{ to: 'done', label: 'Mark done' }, { to: 'cancelled', label: 'Cancel' }];
  return [];
}

export function isOpenJob(j: Pick<CheckJob, 'status'>): boolean {
  return j.status !== 'done' && j.status !== 'cancelled';
}

export function money(n: number | null): string {
  return n === null ? '' : n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}
