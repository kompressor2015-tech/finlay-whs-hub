import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPreview, guessColumns, matchSite, parseCsv, parseHours, parseMonth } from './payroll.ts';

const sites = [
  { id: 'bur', name: 'Burpengary', code: 'BUR' },
  { id: 'som', name: 'Somerton', code: 'SOM' },
  { id: 'tom', name: 'Tomago', code: 'TOM' },
];

test('csv handles quotes, semicolons and blank lines', () => {
  const p = parseCsv('﻿Site;Date;Hours\r\n"Burp, engary";01/10/2026;"1,200.5"\r\n\r\nSomerton;2026-10-31;80\r\n');
  assert.deepEqual(p.headers, ['Site', 'Date', 'Hours']);
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[0][0], 'Burp, engary');
  assert.equal(parseHours(p.rows[0][2]), 1200.5);
});
test('column guess', () => {
  assert.deepEqual(guessColumns(['Cost Centre', 'Pay Period', 'Total Hrs']), { site: 0, date: 1, hours: 2 });
});
test('month formats', () => {
  assert.equal(parseMonth('2026-10-15'), '2026-10');
  assert.equal(parseMonth('15/10/2026'), '2026-10');
  assert.equal(parseMonth('Oct 2026'), '2026-10');
  assert.equal(parseMonth('October 2026'), '2026-10');
  assert.equal(parseMonth('2026-10'), '2026-10');
  assert.equal(parseMonth('rubbish'), null);
  assert.equal(parseMonth('31/13/2026'), null);
});
test('hours parsing', () => {
  assert.equal(parseHours('1 234.5'), 1234.5);
  assert.equal(parseHours('abc'), null);
  assert.equal(parseHours('-4'), null);
});
test('site matching by code, name and inside text; aliases win', () => {
  assert.equal(matchSite('BUR', sites)?.id, 'bur');
  assert.equal(matchSite('somerton', sites)?.id, 'som');
  assert.equal(matchSite('Tomago Depot NSW', sites)?.id, 'tom');
  assert.equal(matchSite('Head Office', sites), null);
  assert.equal(matchSite('Warehouse 3', sites, { warehouse3: 'bur' })?.id, 'bur');
});
test('preview adds up by site and month, flags problems', () => {
  const parsed = parseCsv('Site,Date,Hours\nBurpengary,01/10/2026,100\nBurpengary,15/10/2026,50\nSomerton,2026-10-01,80\nNowhere,2026-10-01,5\nTomago,bad,5\nSomerton,2026-10-02,x');
  const existing = [
    { site_id: 'bur', month: '2026-10-01', hours: 140 },
    { site_id: 'tom', month: '2026-09-01', hours: 90 },
    { site_id: 'som', month: '2026-07-01', hours: 100 }, { site_id: 'som', month: '2026-08-01', hours: 100 },
    { site_id: 'som', month: '2026-09-01', hours: 100 },
  ];
  const p = buildPreview(parsed, guessColumns(parsed.headers), sites, existing);
  assert.equal(p.lines.length, 2);
  assert.equal(p.lines.find(l => l.site.id === 'bur')!.hours, 150);
  assert.equal(p.replaces.length, 1);
  assert.equal(p.replaces[0].old, 140);
  assert.deepEqual(p.unknownSites, [{ name: 'Nowhere', rows: 1 }]);
  assert.equal(p.badRows.length, 2);
  assert.equal(p.outliers.length, 0); // 80 against a usual 100 is normal
  const big = buildPreview(parseCsv('Site,Date,Hours\nSomerton,2026-10-01,450'), guessColumns(['Site', 'Date', 'Hours']), sites, existing);
  assert.equal(big.outliers.length, 1);
  assert.equal(big.outliers[0].typical, 100);
});
