// Safe CSV helpers. Any cell that could be read as a spreadsheet formula
// (starts with = + - @ tab or CR) is prefixed with an apostrophe so Excel /
// Sheets treat it as text instead of executing it.

export function csvCell(value) {
  if (value === null || value === undefined) return '""';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
}

/** Numbers are written bare (no quotes) so they stay numeric in spreadsheets. */
export function csvNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : '0';
}

/** paise (integer) -> rupees string with 2 decimals */
export function paiseToRupeesStr(paise) {
  const n = Number(paise);
  return Number.isFinite(n) ? (n / 100).toFixed(2) : '0.00';
}

export function csvRow(cells) {
  return cells.join(',');
}

export function downloadTextFile(content, filename, type = 'text/csv;charset=utf-8;') {
  // BOM so Excel opens UTF-8 (Malayalam item names) correctly
  const blob = new Blob(['﻿', content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
