/**
 * Sample data for reviewing the home screen before the modules exist.
 * Only shown when someone switches "Sample data" on; never saved anywhere.
 */

import type { HomeData } from '../utils/homeData.ts';

function hoursAgo(now: Date, h: number): string {
  return new Date(now.getTime() - h * 3_600_000).toISOString();
}

function dayOffset(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export function sampleHomeData(now: Date = new Date()): HomeData {
  return {
    summary: [
      { id: 'incidents', label: 'Open incidents', value: 3, sub: '1 under investigation' },
      { id: 'actions', label: 'Overdue actions', value: 4, sub: 'of 9 open', alert: true },
      { id: 'sds', label: 'SDS to review', value: 3, sub: 'over 5 years old' },
      { id: 'plant', label: 'Plant flagged', value: 2, sub: 'failed pre-start' },
    ],
    attention: [
      { id: 's1', urgency: 'overdue', title: 'Failed pre-start: hydraulic leak', unit: '2417', detail: 'Flagged, do not use · Pinkenba yard · Workshop to clear', due: dayOffset(now, -3), moduleId: 'inspections' },
      { id: 's2', urgency: 'overdue', title: 'Corrective action: replace guard on bench grinder', detail: 'From workshop inspection · owner [Name]', due: dayOffset(now, -5), moduleId: 'actions' },
      { id: 's3', urgency: 'due_soon', title: 'Investigation due: hand injury, Narangba', detail: 'Incident INC-0042 · lead [Name]', due: dayOffset(now, 3), moduleId: 'incidents' },
      { id: 's4', urgency: 'not_signed', title: 'Read and sign: wash bay safe work procedure', detail: '4 of 11 staff still to sign · version 3', due: dayOffset(now, 7), moduleId: 'documents' },
      { id: 's5', urgency: 'due_soon', title: 'Annual crane inspection due', unit: '3102', detail: 'On hire to [Client] · book with inspector', due: dayOffset(now, 6), moduleId: 'plant' },
      { id: 's6', urgency: 'review', title: 'New SWMS submitted: tilt-up panel lift', detail: 'Contractor [Company] · needs approval', moduleId: 'risk' },
      { id: 's7', urgency: 'review', title: 'SDS older than 5 years: hydraulic oil', detail: 'Chemical register · Pinkenba store', moduleId: 'chemicals' },
      { id: 's8', urgency: 'review', title: 'Policy review due: WHS policy', detail: 'Documents · owner [Name]', due: dayOffset(now, 20), moduleId: 'documents' },
    ],
    latest: [
      { id: 'l1', type: 'Hazard', title: 'Trip hazard at wash bay drain', by: 'Reported by [Name] · phone', at: hoursAgo(now, 2.7) },
      { id: 'l2', type: 'Pre-start', title: 'Unit 2417 failed: hydraulic leak', by: 'Reported by [Name] · phone', at: hoursAgo(now, 4.1) },
      { id: 'l3', type: 'Near miss', title: 'Load swung near walkway during lift', by: 'Reported by [Name]', at: hoursAgo(now, 26) },
      { id: 'l4', type: 'Inspection', title: 'Workshop monthly: 2 items failed', by: 'Completed by [Name]', at: hoursAgo(now, 29) },
    ],
    navCounts: { incidents: 3, hazards: 5, actions: 9 },
    phoneToday: [
      { id: 'p1', title: 'Pre-start: unit', unit: '2417', detail: 'Failed 06:45 · do not use', pill: 'Flagged', tone: 'red' },
      { id: 'p2', title: 'Pre-start: unit', unit: '1988', detail: 'Not done yet', pill: 'To do', tone: 'amber' },
    ],
    phoneToSign: [
      { id: 'd1', title: 'Wash bay safe work procedure', detail: 'Version 3', pill: 'Sign', tone: 'amber' },
      { id: 'd2', title: 'Pre-start procedure', detail: 'Version 2 · signed', pill: 'Signed', tone: 'green' },
    ],
  };
}
