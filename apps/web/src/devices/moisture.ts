/*
 * Reading a grain moisture meter over USB/RS-232 (see serial.ts). Meters
 * print a line per test, in many layouts: "MOISTURE: 13.4 %",
 * "13.4%  T=27.1C", "Wheat,13.4,27.1", "M 13.4". We take the number named
 * moisture, else the one marked %, else a lone plausible number, and skip
 * temperature and test-weight fields.
 */
import { readUntil, serialSupported } from "./serial";

/** Moisture % from one line of a meter; null when the line carries none. */
export function parseMoistureLine(line: string): number | null {
  const text = line.trim();
  if (!text) return null;
  const num = (s: string) => Number(s.replace(",", "."));
  const plausible = (v: number) => Number.isFinite(v) && v > 0 && v < 60;
  // "Moisture: 13.4", "MOIST 13,4 %", "M=13.4", "H2O 13.4"
  const named =
    /(?:moist(?:ure)?|h2o|\bm)\s*[:=]?\s*(\d{1,2}(?:[.,]\d+)?)/i.exec(text);
  if (named && plausible(num(named[1]!))) return num(named[1]!);
  // "13.4 %" (temperatures are in °C or C, test weight in kg/hl or lb/bu)
  const percent = /(\d{1,2}(?:[.,]\d+)?)\s*%/.exec(text);
  if (percent && plausible(num(percent[1]!))) return num(percent[1]!);
  // A line of fields: the first decimal number that isn't a temperature.
  const fields = text
    .split(/[,;\t]|\s{2,}/)
    .map((f) => f.trim())
    .filter((f) => !/(°|\bc\b|temp|kg|lb|hl|bu)/i.test(f));
  for (const f of fields) {
    const m = /^(\d{1,2}[.,]\d+)$/.exec(f);
    if (m && plausible(num(m[1]!))) return num(m[1]!);
  }
  return null;
}

export const moistureSupported = serialSupported;

/** Waits for the meter's next result (press its print or test key), in %. */
export function readMoisture(timeoutMs = 20000): Promise<number> {
  return readUntil("moisture", parseMoistureLine, { timeoutMs });
}
