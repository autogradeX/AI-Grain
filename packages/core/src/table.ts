/*
 * Reading measurement tables exported by instruments and labs (NIR
 * analysers, moisture meters, reference labs): CSV with commas, semicolons
 * or tabs, quoted fields, and decimal commas where the separator allows.
 */

/** The cells of a delimited text table, row by row. */
export function parseTable(text: string): string[][] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const first = lines.find((l) => l.trim()) ?? "";
  const counts = [",", ";", "\t"].map(
    (d) => [d, first.split(d).length] as const,
  );
  const delimiter = counts.sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = lines.join("\n");
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (c === "\n") {
      row.push(cell.trim());
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((v) => v !== "")) rows.push(row);
  return rows;
}

/** A header name reduced to letters and digits: "Protein (%DM)" → "proteindm". */
export const headerKey = (h: string) =>
  h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A number from a cell: "12.5", "12,5", "12.5 %"; null when empty or not a number. */
export function cellNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const v = value.replace(/%/g, "").replace(/\s/g, "").replace(",", ".");
  if (!v || !/^-?\d+(\.\d+)?$/.test(v)) return null;
  return Number(v);
}

/** How each field's column is recognised, from its header (as headerKey gives it). */
const FIELDS = {
  sample: (k: string) => k.startsWith("sample"),
  lot: (k: string) => k.includes("lot"),
  protein: (k: string) => k.includes("protein"),
  oil: (k: string) => k.includes("oil") || k === "fat" || k === "crudefat",
  moisture: (k: string) =>
    k.includes("moisture") || k === "h2o" || k === "water",
} as const;

export type MeasurementField = Exclude<keyof typeof FIELDS, "sample" | "lot">;

export interface MeasurementRow {
  /** 1-based line in the file, counting the header. */
  line: number;
  sampleNumber: number | null;
  lotId: string | null;
  values: Partial<Record<MeasurementField, number>>;
  /** Why this row can't be used, if it can't. */
  error?: string;
}

/**
 * Rows of an instrument's export: which sample (by number, or by e-NAM lot
 * ID) and its protein, oil and moisture. Unknown columns are ignored.
 * Throws when the header names neither a sample nor a lot, or no value.
 */
export function readMeasurements(text: string): {
  rows: MeasurementRow[];
  columns: string[];
} {
  const [header, ...body] = parseTable(text);
  if (!header) throw new Error("The file is empty");
  const keys = header.map(headerKey);
  const find = (is: (key: string) => boolean) => keys.findIndex(is);
  const col = {
    sample: find(FIELDS.sample),
    lot: find(FIELDS.lot),
    protein: find(FIELDS.protein),
    oil: find(FIELDS.oil),
    moisture: find(FIELDS.moisture),
  };
  if (col.sample < 0 && col.lot < 0)
    throw new Error(
      'No column names the sample: add a "Sample" (sample number) or "Lot" (e-NAM lot ID) column',
    );
  const valueFields = (["protein", "oil", "moisture"] as const).filter(
    (f) => col[f] >= 0,
  );
  if (!valueFields.length)
    throw new Error(
      'No measurement column: name them "Protein", "Oil" or "Moisture"',
    );
  const rows = body.map((cells, i): MeasurementRow => {
    const raw = col.sample >= 0 ? cells[col.sample]?.replace(/^#/, "") : "";
    const sampleNumber = raw && /^\d+$/.test(raw) ? Number(raw) : null;
    const lotId = col.lot >= 0 ? cells[col.lot]?.trim() || null : null;
    const values: MeasurementRow["values"] = {};
    for (const f of valueFields) {
      const v = cellNumber(cells[col[f]]);
      if (v !== null) values[f] = v;
    }
    const row: MeasurementRow = { line: i + 2, sampleNumber, lotId, values };
    if (sampleNumber === null && !lotId)
      row.error = "No sample number or lot ID";
    else if (!Object.keys(values).length) row.error = "No values";
    else if (Object.values(values).some((v) => v < 0 || v > 100))
      row.error = "A value outside 0–100 %";
    return row;
  });
  return {
    rows,
    columns: valueFields.map((f) => header[col[f]]!),
  };
}
