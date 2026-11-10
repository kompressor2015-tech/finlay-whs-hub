import { useEffect, useState, type FormEvent } from 'react';
import { createHazard, uploadPhotos } from '../services/records.ts';
import type { WhsUser } from '../services/auth.ts';
import { useLookups } from '../hooks/useLookups.ts';
import { go } from '../hooks/useRoute.ts';
import { SEVERITIES, riskFor, type MadeSafe, type Severity } from '../utils/records.ts';
import { ChoiceGrid, ErrorNote, Field, MachinePicker, PhotoPicker, PrimaryButton, SitePicker, inputClass, textareaClass } from './Form.tsx';
import { Pill } from './Pill.tsx';

const SAFE: { id: MadeSafe; label: string }[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'partly', label: 'Partly' },
  { id: 'no', label: 'No' },
];

/** Report a hazard. Photo first, then a few quick questions. */
export function HazardForm({ user }: { user: WhsUser }) {
  const { machines, sites } = useLookups();
  const [photos, setPhotos] = useState<File[]>([]);
  const [description, setDescription] = useState('');
  const [site, setSite] = useState<{ id: string | null; name: string }>({ id: null, name: '' });
  const [spot, setSpot] = useState('');
  const [machine, setMachine] = useState<{ id: string | null; unitNo: string }>({ id: null, unitNo: '' });
  const [severity, setSeverity] = useState<Severity>('injury');
  const [madeSafe, setMadeSafe] = useState<MadeSafe>('no');
  const [safeNote, setSafeNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (site.id || site.name || !sites.length) return;
    const mine = sites.find(s => user.location && s.name.toLowerCase().includes(user.location.toLowerCase())) ?? sites[0];
    setSite({ id: mine.id, name: mine.name });
  }, [sites, site.id, site.name, user.location]);

  const risk = riskFor(severity);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!description.trim()) return setError('Please say what is unsafe.');
    if (!site.name.trim()) return setError('Please say where it is.');
    setBusy(true);
    try {
      const uploaded = await uploadPhotos(photos);
      if (uploaded.error) return setError(uploaded.error);
      const res = await createHazard({
        description: description.trim(),
        site_id: site.id,
        site_name: site.name.trim(),
        location_detail: spot.trim(),
        machine_id: machine.id,
        unit_no: machine.unitNo,
        photos: uploaded.data ?? [],
        severity,
        made_safe: madeSafe,
        made_safe_note: safeNote.trim(),
      });
      if (res.error || !res.data) return setError(res.error ?? 'Could not send the hazard.');
      go({ name: 'hazard', id: res.data.id });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4.5 max-w-[560px]">
      <h1 className="m-0 text-xl font-bold">Report a hazard</h1>

      <PhotoPicker files={photos} onChange={setPhotos} big />

      <Field label="What is unsafe?" htmlFor="haz-what">
        <textarea id="haz-what" rows={3} className={textareaClass} value={description} onChange={e => setDescription(e.target.value)} />
      </Field>

      <SitePicker sites={sites} siteId={site.id} siteName={site.name} onChange={(id, name) => setSite({ id, name })} />
      <input aria-label="Exact spot" placeholder="Exact spot, e.g. wash bay" className={inputClass} value={spot} onChange={e => setSpot(e.target.value)} />

      <MachinePicker label="Machine" machines={machines} machineId={machine.id} unitNo={machine.unitNo} onChange={(id, unitNo) => setMachine({ id, unitNo })} />

      <ChoiceGrid legend="How bad could it be?" options={SEVERITIES} value={severity} onChange={setSeverity} />
      <ChoiceGrid legend="Have you made it safe for now?" options={SAFE} value={madeSafe} onChange={setMadeSafe} columns={3} />

      {madeSafe !== 'no' && (
        <Field label="What did you do?" htmlFor="haz-safe">
          <input id="haz-safe" className={inputClass} value={safeNote} onChange={e => setSafeNote(e.target.value)} />
        </Field>
      )}

      <div className="bg-white border border-line rounded-xl px-3.5 py-3 flex gap-2.5 items-center">
        <Pill tone={risk.tone}>{risk.label} risk</Pill>
        <span className="text-[13px] text-muted leading-snug">{risk.note}</span>
      </div>

      <ErrorNote message={error} />
      <PrimaryButton type="submit" busy={busy}>Send hazard</PrimaryButton>
      <p className="mt-0 mb-6 text-xs text-muted text-center">The WHS officer reviews it and sets an action to fix it.</p>
    </form>
  );
}
