/**
 * Dates and times for the WHS app. Everything shows in Brisbane time (no daylight saving),
 * with dates written DD/MM/YYYY, the same as the fleet app.
 */

export const TIME_ZONE = 'Australia/Brisbane';

const dateFmt = new Intl.DateTimeFormat('en-AU', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const weekdayFmt = new Intl.DateTimeFormat('en-AU', { timeZone: TIME_ZONE, weekday: 'long' });
const shortWeekdayFmt = new Intl.DateTimeFormat('en-AU', { timeZone: TIME_ZONE, weekday: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-AU', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** 10/11/2026 */
export function formatDate(value: Date | string): string {
  const d = toDate(value);
  return Number.isNaN(d.getTime()) ? '' : dateFmt.format(d);
}

/** Tuesday 10/11/2026 */
export function formatLongDate(value: Date | string): string {
  const d = toDate(value);
  return Number.isNaN(d.getTime()) ? '' : `${weekdayFmt.format(d)} ${dateFmt.format(d)}`;
}

/** 08:12 */
export function formatTime(value: Date | string): string {
  const d = toDate(value);
  return Number.isNaN(d.getTime()) ? '' : timeFmt.format(d);
}

/** The Brisbane calendar day of a moment, as YYYY-MM-DD (for comparing days). */
export function brisbaneDay(value: Date | string): string {
  const d = toDate(value);
  const parts = dateFmt.formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Whole days from Brisbane "today" to a YYYY-MM-DD date (negative when it is in the past). */
export function daysUntil(day: string, now: Date = new Date()): number {
  const today = Date.parse(`${brisbaneDay(now)}T00:00:00Z`);
  const target = Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}

/**
 * When something was reported, in plain words: "Today 08:12", "Yesterday 16:40",
 * "Mon 09/11" within the last week, otherwise the full date.
 */
export function formatWhen(value: Date | string, now: Date = new Date()): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '';
  const diff = -daysUntil(brisbaneDay(d), now);
  if (diff === 0) return `Today ${formatTime(d)}`;
  if (diff === 1) return `Yesterday ${formatTime(d)}`;
  if (diff > 1 && diff < 7) return `${shortWeekdayFmt.format(d)} ${formatDate(d).slice(0, 5)}`;
  return formatDate(d);
}

/** Today's Brisbane date and time for form fields: { date: '2026-11-10', time: '10:52' }. */
export function nowForInputs(now: Date = new Date()): { date: string; time: string } {
  return { date: brisbaneDay(now), time: formatTime(now) };
}

/** A Brisbane date and time from form fields as an ISO timestamp (Brisbane is always UTC+10). */
export function fromInputs(date: string, time: string): string {
  return new Date(`${date}T${time || '00:00'}:00+10:00`).toISOString();
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 2026-11-13 -> 13/11/2026 (for date-only values such as due dates). */
export function formatDay(day: string | null | undefined): string {
  if (!day) return '';
  const [y, m, d] = day.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

/** Good morning / Good afternoon / Good evening, by the time in Brisbane. */
export function greeting(now: Date = new Date()): string {
  const hour = Number(timeFmt.format(now).slice(0, 2));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
