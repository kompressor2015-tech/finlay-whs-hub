import { useEffect, useState, type FormEvent } from 'react';
import { createIncident, uploadPhotos } from '../services/records.ts';
import type { WhsUser } from '../services/auth.ts';
import { useLookups } from '../hooks/useLookups.ts';
import { go } from '../hooks/useRoute.ts';
import { fromInputs, nowForInputs } from '../utils/dates.ts';
import { INCIDENT_TYPES, NOTIFIABLE_REASONS, WHSQ_PHONE, WHSQ_TEL, type IncidentType, type NotifiableReason } from '../utils/records.ts';
import { ChoiceGrid, ErrorNote, Field, MachinePicker, PhotoPicker, PrimaryButton, SitePicker, inputClass, textareaClass } from './Form.tsx';

/** Report an incident. Built for a phone first; also used on the desktop. */
export function IncidentForm({ user }: { user: WhsUser }) {
  const { machines, sites } = useLookups();
  const start = nowForInputs();
  const [type, setType] = useState<IncidentType>('injury');
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [site, setSite] = useState<{ id: string | null; name: string }>({ id: null, name: '' });
  const [spot, setSpot] = useState('');
  const [machine, setMachine] = useState<{ id: string | null; unitNo: string }>({ id: null, unitNo: '' });
  const [people, setPeople] = useState('');
  const [description, setDescription] = useState('');
  const [done, setDone] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [reasons, setReasons] = useState<NotifiableReason[]>([]);
  const [called, setCalled] = useState(false);
  const [whsqRef, setWhsqRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to the person's usual yard once the sites have loaded.
  useEffect(() => {
    if (site.id || site.name || !sites.length) return;
    const mine = sites.find(s => user.location && s.name.toLowerCase().includes(user.location.toLowerCase())) ?? sites[0];
    setSite({ id: mine.id, name: mine.name });
  }, [sites, site.id, site.name, user.location]);

  const notifiable = reasons.length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!description.trim()) return setError('Please describe what happened.');
    if (!site.name.trim()) return setError('Please say where it happened.');
    setBusy(true);
    try {
      const uploaded = await uploadPhotos(photos);
      if (uploaded.error) return setError(uploaded.error);
      const res = await createIncident({
        type,
        occurred_at: fromInputs(date, time),
        site_id: site.id,
        site_name: site.name.trim(),
        location_detail: spot.trim(),
        machine_id: machine.id,
        unit_no: machine.unitNo,
        people: people.trim(),
        description: description.trim(),
        immediate_action: done.trim(),
        photos: uploaded.data ?? [],
        notifiable_reasons: reasons,
        whsq_reference: whsqRef.trim(),
        whsq_called_at: notifiable && called ? new Date().toISOString() : null,
        whsq_called_by: notifiable && called ? user.name : '',
      });
      if (res.error || !res.data) return setError(res.error ?? 'Could not send the report.');
      go({ name: 'incident', id: res.data.id });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4.5 max-w-[560px]">
      <div>
        <h1 className="m-0 text-xl font-bold">Report an incident</h1>
        <p className="mt-1.5 mb-0 text-sm text-muted leading-relaxed">Make the area safe and get first aid first.</p>
      </div>

      <ChoiceGrid legend="What happened?" options={INCIDENT_TYPES} value={type} onChange={setType} />

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Date" htmlFor="inc-date">
          <input id="inc-date" type="date" className={inputClass} value={date} max={start.date} onChange={e => setDate(e.target.value)} required />
        </Field>
        <Field label="Time" htmlFor="inc-time">
          <input id="inc-time" type="time" className={inputClass} value={time} onChange={e => setTime(e.target.value)} required />
        </Field>
      </div>

      <SitePicker sites={sites} siteId={site.id} siteName={site.name} onChange={(id, name) => setSite({ id, name })} />
      <input aria-label="Exact spot" placeholder="Exact spot, e.g. wash bay, bay 3" className={inputClass} value={spot} onChange={e => setSpot(e.target.value)} />

      <MachinePicker machines={machines} machineId={machine.id} unitNo={machine.unitNo} onChange={(id, unitNo) => setMachine({ id, unitNo })} />

      <Field label="Who was involved?" htmlFor="inc-people">
        <input id="inc-people" placeholder="Names, or visitor / contractor" className={inputClass} value={people} onChange={e => setPeople(e.target.value)} />
      </Field>

      <Field label="Describe what happened" htmlFor="inc-what">
        <textarea id="inc-what" rows={4} placeholder="What were you doing, what went wrong, any injury" className={textareaClass} value={description} onChange={e => setDescription(e.target.value)} />
      </Field>

      <PhotoPicker files={photos} onChange={setPhotos} />

      <Field label="What has been done so far?" htmlFor="inc-done">
        <textarea id="inc-done" rows={2} placeholder="First aid, area barricaded, machine tagged out…" className={textareaClass} value={done} onChange={e => setDone(e.target.value)} />
      </Field>

      <fieldset className="border border-line rounded-xl bg-white m-0 p-3.5 flex flex-col">
        <legend className="text-[15px] font-bold px-1">Is it notifiable to WHSQ?</legend>
        <p className="mt-0 mb-1.5 text-[13px] text-muted leading-relaxed">Tick any that apply. Only if it came from the work.</p>
        {NOTIFIABLE_REASONS.map(r => {
          const on = reasons.includes(r.id);
          return (
            <label key={r.id} className="flex gap-3 items-start min-h-11 py-2 border-t border-line-soft cursor-pointer">
              <input
                type="checkbox"
                checked={on}
                onChange={() => setReasons(on ? reasons.filter(x => x !== r.id) : [...reasons, r.id])}
                className="w-[22px] h-[22px] mt-px flex-none accent-[#B9151C]"
              />
              <span className="text-sm leading-snug">
                <span className="font-semibold">{r.title}</span>
                {r.sub && <span className="block text-muted text-[13px] mt-0.5">{r.sub}</span>}
              </span>
            </label>
          );
        })}
      </fieldset>

      {notifiable && (
        <div role="alert" className="bg-finlay text-white rounded-xl p-4 flex flex-col gap-2.5">
          <div className="font-bold text-[17px]">Notifiable: call WHSQ now</div>
          <a href={WHSQ_TEL} className="no-underline bg-white text-[#8E0F15] rounded-[10px] min-h-[52px] flex items-center justify-center font-bold text-[17px]">
            Call {WHSQ_PHONE}
          </a>
          <ul className="m-0 pl-4.5 text-sm leading-relaxed">
            <li>Leave the site as it is until an inspector says otherwise (only to help someone or make it safe).</li>
            <li>Tell your supervisor and the WHS officer straight away.</li>
          </ul>
          <label className="flex gap-3 items-center min-h-11 cursor-pointer text-sm font-semibold">
            <input type="checkbox" checked={called} onChange={e => setCalled(e.target.checked)} className="w-[22px] h-[22px] flex-none accent-white" />
            I have called WHSQ
          </label>
          <label htmlFor="inc-ref" className="text-[13px] font-semibold">WHSQ reference or person spoken to</label>
          <input id="inc-ref" className="min-h-11 rounded-lg border-0 px-3 text-[15px] text-ink" value={whsqRef} onChange={e => setWhsqRef(e.target.value)} />
        </div>
      )}

      <ErrorNote message={error} />
      <PrimaryButton type="submit" busy={busy}>Send report</PrimaryButton>
      <p className="mt-0 mb-6 text-xs text-muted text-center">It goes straight onto the incident register.</p>
    </form>
  );
}
