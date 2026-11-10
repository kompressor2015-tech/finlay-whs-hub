/** CSV export that opens cleanly in Excel (UTF-8 mark, quoted cells, formula-safe). */

function cell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  // Stop Excel treating a cell as a formula
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvFor(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return '﻿' + [headers, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
