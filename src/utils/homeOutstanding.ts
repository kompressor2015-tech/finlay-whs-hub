/** Work and bookings that are still open (quotes, POs, booked dates), for the home screen. */

import type { HomeData } from './homeData.ts';
import type { ComingItem } from './homeBoard.ts';
import type { AttentionItem } from './attention.ts';
import { isOpenJob, jobLabel, type CheckJob } from './checkJobs.ts';
import { openBooking, type Booking } from './bookings.ts';
import type { CheckLogLine, RecurringCheck } from './recurringChecks.ts';
import { daysUntil } from './dates.ts';

export interface Outstanding {
  jobs: CheckJob[];
  bookings: Booking[];
  /** Everything needed to say which check or person a record belongs to */
  checks: RecurringCheck[];
  log: CheckLogLine[];
  sites: { id: string; name: string }[];
  people: { id: string; name: string; tickets: { name: string; issued_on: string | null }[] }[];
}

const href = '#/m/recurring';

export function outstandingItems(o: Outstanding, now: Date = new Date()): AttentionItem[] {
  const out: AttentionItem[] = [];
  const checkOf = new Map(o.checks.map(c => [c.id, c]));
  const siteName = (id: string) => o.sites.find(s => s.id === id)?.name ?? '';

  for (const j of o.jobs.filter(isOpenJob)) {
    const c = checkOf.get(j.check_id);
    if (!c) continue;
    const late = !!j.booked_for && daysUntil(j.booked_for, now) < 0;
    const gaps = [!j.po_number && j.status === 'po_raised' ? 'PO number not entered' : '', !j.booked_for ? 'no booked date' : '', late ? 'booked date has passed' : ''].filter(Boolean);
    out.push({
      id: `job-${j.id}`,
      urgency: late ? 'overdue' : 'review',
      title: `${siteName(c.site_id)}: ${j.title}, ${jobLabel(j.status).text.toLowerCase()}`,
      detail: [j.supplier, j.quote_ref && `Quote ${j.quote_ref}`, ...gaps].filter(Boolean).join(' · '),
      moduleId: 'recurring',
      href,
    });
  }

  for (const b of o.bookings.filter(x => x.status === 'booked' && daysUntil(x.booked_for, now) < 0)) {
    if (b.subject_type === 'check') {
      const c = checkOf.get(b.check_id ?? '');
      if (!c || !openBooking([b], { type: 'check', checkId: c.id }, o.log.filter(l => l.check_id === c.id).map(l => l.done_on))) continue;
      out.push({ id: `booking-${b.id}`, urgency: 'overdue', title: `${siteName(c.site_id)}: ${c.name} booking has passed, not recorded`, detail: [b.provider, 'Record it, or change the booking'].filter(Boolean).join(' · '), moduleId: 'recurring', href });
    } else {
      const p = o.people.find(x => x.id === b.person_id);
      if (!p || !openBooking([b], { type: 'ticket', personId: p.id, ticketName: b.ticket_name }, p.tickets.filter(t => t.name.trim().toLowerCase() === b.ticket_name.trim().toLowerCase()).map(t => t.issued_on))) continue;
      out.push({ id: `booking-${b.id}`, urgency: 'overdue', title: `${p.name}: ${b.ticket_name} booking has passed, not recorded`, detail: [b.provider, 'Add the new ticket, or change the booking'].filter(Boolean).join(' · '), moduleId: 'training', href: '#/m/training' });
    }
  }
  return out;
}

export function withOutstanding(home: HomeData, o: Outstanding, now: Date = new Date()): HomeData {
  const items = outstandingItems(o, now);
  const work = {
    open: o.jobs.filter(isOpenJob).length,
    booked: o.bookings.filter(b => b.status === 'booked' && daysUntil(b.booked_for, now) >= 0).length,
    late: items.filter(i => i.urgency === 'overdue').length,
  };
  return { ...home, attention: [...home.attention, ...items], work };
}

/** Booked dates in the next 30 days, for the Coming up list. */
export function bookingsComing(o: Outstanding, now: Date = new Date(), windowDays = 30): ComingItem[] {
  const out: ComingItem[] = [];
  const checkOf = new Map(o.checks.map(c => [c.id, c]));
  for (const b of o.bookings.filter(x => x.status === 'booked')) {
    const left = daysUntil(b.booked_for, now);
    if (left < 0 || left > windowDays) continue;
    if (b.subject_type === 'check') {
      const c = checkOf.get(b.check_id ?? '');
      if (!c) continue;
      out.push({ day: b.booked_for, what: `${c.name} booked${b.provider ? ` (${b.provider})` : ''}`, site: o.sites.find(s => s.id === c.site_id)?.name ?? '', href });
    } else {
      const p = o.people.find(x => x.id === b.person_id);
      if (p) out.push({ day: b.booked_for, what: `${b.ticket_name} booked: ${p.name}`, site: '', href: '#/m/training' });
    }
  }
  for (const j of o.jobs.filter(isOpenJob)) {
    if (!j.booked_for) continue;
    const left = daysUntil(j.booked_for, now);
    const c = checkOf.get(j.check_id);
    if (c && left >= 0 && left <= windowDays) out.push({ day: j.booked_for, what: `${j.title}${j.supplier ? ` (${j.supplier})` : ''}`, site: o.sites.find(s => s.id === c.site_id)?.name ?? '', href });
  }
  return out;
}
