import { useState, type FormEvent } from 'react';
import { addBooking, updateBooking } from '../services/bookings.ts';
import { bookingLabel, type Booking, type Subject } from '../utils/bookings.ts';
import { formatDay } from '../utils/dates.ts';
import { today } from '../utils/documents.ts';
import { ErrorNote, Field, inputClass } from './Form.tsx';

const btn = 'min-h-10 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-[13px] font-semibold cursor-pointer disabled:opacity-60';
const primary = 'min-h-10 px-4 rounded-lg border-0 bg-ink text-white text-[13px] font-semibold cursor-pointer disabled:opacity-60';

/** The booking for a check or a ticket: when it is booked for and who is doing it. Office roles can book, change and cancel. */
export function BookingBox({ subject, booking, canEdit, providerLabel = 'Who is doing it', onChanged }: { subject: Subject; booking: Booking | null; canEdit: boolean; providerLabel?: string; onChanged: () => void }) {
  const [form, setForm] = useState<{ booked_for: string; provider: string; reference: string; notes: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = booking ? bookingLabel(booking) : null;

  const start = () => setForm({ booked_for: booking?.booked_for ?? '', provider: booking?.provider ?? '', reference: booking?.reference ?? '', notes: booking?.notes ?? '' });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.booked_for) return setError('Pick the date it is booked for.');
    if (form.booked_for < today()) return setError('The booking date cannot be in the past.');
    setBusy(true);
    setError(null);
    const input = { booked_for: form.booked_for, provider: form.provider.trim(), reference: form.reference.trim(), notes: form.notes.trim() };
    const r = booking ? await updateBooking(booking.id, input) : await addBooking(subject, input);
    setBusy(false);
    if (r.error) return setError(r.error);
    setForm(null);
    onChanged();
  }

  async function cancel() {
    if (!booking) return;
    setBusy(true);
    const r = await updateBooking(booking.id, { status: 'cancelled' });
    setBusy(false);
    if (r.error) return setError(r.error);
    onChanged();
  }

  return (
    <div className="border border-line rounded-xl p-3.5 text-sm flex flex-col gap-2 bg-white">
      <div className="font-semibold">Booking</div>
      {booking && label && !form && (
        <div>
          <div className={label.passed ? 'text-[#7A4B00] font-semibold' : 'font-semibold'}>{label.passed ? `Booked for ${formatDay(booking.booked_for)}, but nothing recorded since` : `Booked for ${formatDay(booking.booked_for)}`}</div>
          <div className="text-muted">{[booking.provider, booking.reference && `Ref ${booking.reference}`].filter(Boolean).join(' · ') || 'No contractor or reference noted'}</div>
          {booking.notes && <div className="text-muted">{booking.notes}</div>}
          <div className="text-xs text-muted mt-1">Booked by {booking.created_by_name || 'unknown'}. It clears itself once the work is recorded.</div>
        </div>
      )}
      {!booking && !form && <div className="text-muted">Not booked yet.</div>}
      {canEdit && !form && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={start}>{booking ? 'Change booking' : 'Book it'}</button>
          {booking && <button type="button" className={btn} disabled={busy} onClick={() => void cancel()}>Cancel booking</button>}
        </div>
      )}
      {form && (
        <form onSubmit={save} className="grid grid-cols-2 gap-3">
          <Field label="Booked for" htmlFor={`bk-d-${subject.type}`}><input id={`bk-d-${subject.type}`} type="date" min={today()} value={form.booked_for} onChange={e => setForm({ ...form, booked_for: e.target.value })} className={inputClass} /></Field>
          <Field label={providerLabel} optional htmlFor={`bk-p-${subject.type}`}><input id={`bk-p-${subject.type}`} value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} className={inputClass} /></Field>
          <Field label="Reference or PO" optional htmlFor={`bk-r-${subject.type}`}><input id={`bk-r-${subject.type}`} value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} className={inputClass} /></Field>
          <Field label="Notes" optional htmlFor={`bk-n-${subject.type}`}><input id={`bk-n-${subject.type}`} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputClass} /></Field>
          <div className="col-span-2 flex gap-2"><button type="submit" disabled={busy} className={primary}>{busy ? 'Saving…' : 'Save booking'}</button><button type="button" className={btn} onClick={() => { setForm(null); setError(null); }}>Cancel</button></div>
        </form>
      )}
      <ErrorNote message={error} />
    </div>
  );
}
