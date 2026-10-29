export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? value.toString()
        : JSON.stringify(value);
  // Stop spreadsheet apps from treating text as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvRow = (values: readonly unknown[]) =>
  values.map(csvCell).join(",");
