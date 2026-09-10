// Shared CSV export for report tables.
//
// Extracted from the movers report once a third page needed it. Every cell is
// quoted and inner quotes are doubled, which is what keeps a product name
// containing a comma — "Tee, Slim Fit" — from silently shifting every column
// after it.

/** Escapes one cell for CSV: wrap in quotes, double any quotes inside. */
function escapeCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

/**
 * Triggers a browser download of `rows` as a CSV file.
 *
 * Excel on a Philippine locale opens UTF-8 as Windows-1252 unless the file
 * starts with a byte-order mark, which turns ₱ into Â₱. The BOM is why the
 * peso sign survives the round trip.
 */
export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const csv = rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Money as a plain decimal — Excel cannot sum "₱1,299.00". */
export function csvAmount(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "";
  return (centavos / 100).toFixed(2);
}

/** Percentage to one decimal, blank when not applicable. */
export function csvPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return value.toFixed(1);
}

/** `sales-report-store-20260101-20260131.csv` */
export function reportFilename(base: string, dateStart: string, dateEnd: string): string {
  return `${base}-${dateStart}-${dateEnd}.csv`;
}
