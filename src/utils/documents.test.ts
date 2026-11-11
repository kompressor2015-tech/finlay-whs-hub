import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, parseDocFile, reviewBy, reviewPill, reviewState, currentVersion, fileKind, type DocVersion } from './documents.ts';

const now = new Date('2026-11-11T04:00:00Z'); // 11/11/2026 in Brisbane

test('months are added keeping the day, and short months clamp', () => {
  assert.equal(addMonths('2026-11-11', 12), '2027-11-11');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2026-11-30', 3), '2027-02-28');
});

test('a document with no review date is flagged, then due soon, then overdue', () => {
  assert.equal(reviewState({ reviewed_on: null, review_months: 12 }, now), 'none');
  assert.equal(reviewBy({ reviewed_on: null, review_months: 12 }), null);
  assert.equal(reviewState({ reviewed_on: '2026-06-01', review_months: 12 }, now), 'ok');
  assert.equal(reviewState({ reviewed_on: '2025-12-20', review_months: 12 }, now), 'due_soon'); // review by 20/12/2026
  assert.equal(reviewState({ reviewed_on: '2025-11-11', review_months: 12 }, now), 'due_soon'); // today is the day
  assert.equal(reviewState({ reviewed_on: '2025-11-10', review_months: 12 }, now), 'overdue');
  assert.equal(reviewPill({ reviewed_on: '2025-01-05', review_months: 12 }, now).label, 'Overdue since 01/2026');
  assert.equal(reviewPill({ reviewed_on: null, review_months: 12 }, now).tone, 'amber');
});

test('file names are read the way the real folders are named', () => {
  assert.deepEqual(parseDocFile('SWI -001 Angle Grinder.pdf'), { type: 'swi', doc_no: 'SWI-001', title: 'Angle Grinder', version: '', machine_model: '' });
  assert.equal(parseDocFile('SWI -032 Cone Change C-1550.pdf').title, 'Cone Change C-1550');
  assert.equal(parseDocFile('SWI -014  Jaw Crusher Swing Liner Change Ov....pdf').doc_no, 'SWI-014');
  const ra = parseDocFile('TC-100 Track stacker Risk Assessment V1.3.pdf');
  assert.deepEqual([ra.type, ra.version, ra.machine_model, ra.title], ['risk_assessment', 'v1.3', 'TC-100 Track stacker', 'TC-100 Track stacker Risk Assessment']);
  assert.equal(parseDocFile('J-1480 Risk Assessment v4.9.pdf').machine_model, 'J-1480');
  assert.equal(parseDocFile('883 Spaleck Risk Assessment v1.8.pdf').machine_model, '883 Spaleck');
  assert.equal(parseDocFile('SWMS_J1480-1083 - Finlay.docx').type, 'swms');
  assert.equal(parseDocFile('SWMS TTS620T SHADFORTH.pdf').title, 'TTS620T SHADFORTH');
  assert.equal(parseDocFile('SWMS_Template_Finlay.docx').type, 'form');
  assert.equal(parseDocFile('SWMS_Register.xlsx').type, 'policy');
  assert.equal(parseDocFile('Finlay SMS January 2026.pdf').type, 'policy');
  assert.equal(parseDocFile('HSMS05 Responsibility and Accountability.docx').doc_no, 'HSMS05');
  const inFolder = parseDocFile('Procedure.docx', 'Finlay/HSMS13 Emergency Response/Procedure.docx');
  assert.deepEqual([inFolder.type, inFolder.doc_no], ['hsms', 'HSMS13']);
});

test('the newest upload is the current version', () => {
  const v = (id: string, at: string) => ({ id, document_id: 'd', version: id, file_path: '', file_name: '', uploaded_at: at, uploaded_by_name: '' }) as DocVersion;
  assert.equal(currentVersion([v('a', '2026-01-01T00:00:00Z'), v('b', '2026-03-01T00:00:00Z')])?.id, 'b');
  assert.equal(currentVersion([]), null);
  assert.equal(fileKind('x.DOCX'), 'DOC');
  assert.equal(fileKind('x.pdf'), 'PDF');
});

test('the home screen gets one line per kind of review warning, and the nav count', async () => {
  const { withDocuments, documentsComing } = await import('./homeDocuments.ts');
  const { emptyHomeData } = await import('./homeData.ts');
  const doc = (id: string, reviewed_on: string | null) => ({ id, doc_no: '', title: `Doc ${id}`, reviewed_on, review_months: 12, active: true }) as never;
  const docs = [doc('a', '2025-01-01'), doc('b', '2025-12-01'), doc('c', null), doc('d', null), doc('e', '2026-10-01')];
  const home = withDocuments(emptyHomeData(), docs, now);
  assert.deepEqual(home.attention.map(a => [a.id, a.urgency]), [['docs-overdue', 'overdue'], ['docs-soon', 'due_soon'], ['docs-none', 'review']]);
  assert.equal(home.attention[2].title, '2 documents are without a review date');
  assert.equal(home.navCounts.documents, 2);
  assert.deepEqual(documentsComing(docs, now).map(c => c.href), ['#/documents/b']);
});
