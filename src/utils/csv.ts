/**
 * CSV serialisation for the export buttons.
 *
 * Two defects are fixed here once, instead of (inconsistently) in each
 * exporter:
 *
 *  - every field is quoted and its inner quotes doubled, so a value containing
 *    a comma, quote or newline can no longer shift every later cell;
 *  - a field beginning with `=`, `+`, `-`, `@`, TAB or CR is prefixed with an
 *    apostrophe, so text we do not fully control — an operator-set location
 *    name, or a weather description from a provider — cannot execute as a
 *    formula (or a DDE payload) when the operator opens the file in Excel or
 *    LibreOffice.
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/

function cell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value)
  const safe = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw
  return `"${safe.replace(/"/g, '""')}"`
}

/** Serialises rows to CSV, quoting and neutralising every field. */
export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n')
}
