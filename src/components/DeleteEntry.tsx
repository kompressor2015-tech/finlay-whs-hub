import { useState } from 'react';
import { deleteRecord, type DeletableType } from '../services/records.ts';
import type { WhsUser } from '../services/auth.ts';
import { askConfirm } from './ConfirmHost.tsx';
import { ErrorNote } from './Form.tsx';

const NAMES: Record<DeletableType, string> = { incident: 'incident', hazard: 'hazard', action: 'action', check: 'check' };

/**
 * A quiet "delete" at the bottom of a record, for administrators only: for something made in
 * error or to be restarted. The database enforces the same rule (and keeps notifiable incidents).
 */
export function DeleteEntry({ type, id, user, label, detail, blockedReason, onDeleted }: {
  type: DeletableType;
  id: string;
  user: WhsUser;
  /** e.g. "INC-0004" */
  label: string;
  /** What else goes with it, shown in the pop-up */
  detail?: string[];
  /** Set when this one must be kept (notifiable incidents) */
  blockedReason?: string;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (user.access !== 'admin') return null;

  if (blockedReason) {
    return <p className="m-0 mt-2 text-[13px] text-muted border-t border-line pt-4">{blockedReason}</p>;
  }

  async function click() {
    setError(null);
    const ok = await askConfirm({
      title: `Delete ${label}?`,
      body: `This removes the ${NAMES[type]} for good. Use it for something made in error or to start again. A line is kept in the history saying you deleted it.`,
      items: detail,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const res = await deleteRecord(type, id);
    setBusy(false);
    if (res.error) return setError(res.error);
    onDeleted();
  }

  return (
    <div className="mt-2 border-t border-line pt-4 flex flex-col gap-2 items-start">
      <ErrorNote message={error} />
      <button type="button" disabled={busy} onClick={() => void click()}
        className="min-h-11 px-4 rounded-lg border border-[#E3B7B7] bg-white text-[#B42318] text-sm font-semibold cursor-pointer disabled:opacity-60">
        {busy ? 'Deleting…' : `Delete this ${NAMES[type]}`}
      </button>
      <span className="text-[12px] text-muted">Only administrators see this.</span>
    </div>
  );
}
