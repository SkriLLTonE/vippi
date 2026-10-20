const FORMULA_START = /^[=+\-@\t\r]/;

/** RFC 4180 quoting plus formula-injection guard (FR-064, ADR-019). */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (typeof value === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvLine(cells: ReadonlyArray<string | number | boolean | null | undefined>): string {
  return `${cells.map(csvCell).join(',')}\r\n`;
}
