/**
 * What the home screen shows. Each module adds to this as it is built; until then the
 * home screen shows calm empty states rather than made-up numbers.
 */

import type { AttentionItem, Tone } from './attention.ts';

export interface SummaryCard {
  id: string;
  label: string;
  /** null = the module that fills it is not built yet */
  value: number | null;
  sub: string;
  /** Highlight in Finlay red when above zero (e.g. overdue actions) */
  alert?: boolean;
}

export interface LatestReport {
  id: string;
  type: string;
  title: string;
  by: string;
  /** ISO timestamp */
  at: string;
}

export interface PhoneTask {
  id: string;
  title: string;
  unit?: string;
  detail: string;
  pill: string;
  tone: Tone;
}

export interface HomeData {
  summary: SummaryCard[];
  attention: AttentionItem[];
  latest: LatestReport[];
  /** Small counts beside menu items, by module id */
  navCounts: Record<string, number>;
  phoneToday: PhoneTask[];
  phoneToSign: PhoneTask[];
}

export function emptyHomeData(): HomeData {
  return {
    summary: [
      { id: 'incidents', label: 'Open incidents', value: null, sub: 'Arrives with Incidents (step 2)' },
      { id: 'actions', label: 'Overdue actions', value: null, sub: 'Arrives with Actions (step 2)', alert: true },
      { id: 'sds', label: 'SDS to review', value: null, sub: 'Arrives with Chemicals (step 4)' },
      { id: 'plant', label: 'Plant flagged', value: null, sub: 'Arrives with pre-starts (step 3)' },
    ],
    attention: [],
    latest: [],
    navCounts: {},
    phoneToday: [],
    phoneToSign: [],
  };
}

/** How a summary value reads on screen: a dash until its module exists. */
export function summaryValue(card: SummaryCard): string {
  return card.value === null ? '—' : String(card.value);
}
