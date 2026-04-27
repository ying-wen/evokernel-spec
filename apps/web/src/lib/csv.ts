// Tiny CSV builder + download helper for client-side use.
// Quotes any field containing comma / quote / newline; escapes embedded quotes.

export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const s = typeof val === 'string' ? val : JSON.stringify(val);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [columns.map(escape).join(',')];
  for (const r of rows) lines.push(columns.map((c) => escape(r[c])).join(','));
  return lines.join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
