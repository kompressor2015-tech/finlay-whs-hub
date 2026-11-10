/**
 * Turns form answers (with photo files) into saved answers (with photo paths),
 * uploading the photos with whatever upload function it is given.
 */

import type { Answers } from './checks.ts';

export interface DraftLike {
  v?: string | string[];
  note?: string;
  files?: File[];
}

export async function finaliseAnswers(
  drafts: Record<string, DraftLike>,
  upload: (files: File[]) => Promise<{ data?: string[]; error?: string }>
): Promise<{ answers?: Answers; error?: string }> {
  const answers: Answers = {};
  for (const [id, d] of Object.entries(drafts)) {
    const out: Answers[string] = {};
    if (d.v !== undefined) out.v = d.v;
    if (d.note?.trim()) out.note = d.note.trim();
    if (d.files?.length) {
      const res = await upload(d.files);
      if (res.error) return { error: res.error };
      out.photos = res.data ?? [];
    }
    answers[id] = out;
  }
  return { answers };
}

/** Plain answers (no files) for working out the result before saving. */
export function plainAnswers(drafts: Record<string, DraftLike>): Answers {
  const out: Answers = {};
  for (const [id, d] of Object.entries(drafts)) {
    out[id] = { v: d.v, note: d.note, photos: d.files?.map(f => f.name) };
  }
  return out;
}
