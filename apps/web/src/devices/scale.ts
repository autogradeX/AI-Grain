import {
  deviceBaud,
  readUntil,
  serialSupported,
  setDeviceBaud,
} from "./serial";

/*
 * Reading a lab balance over USB/RS-232 with the Web Serial API (Chrome and
 * Edge on desktop). Most balances send a line per reading, e.g.
 * "ST,GS,+  12.345 g" (A&D), "S S     12.345 g" (Mettler SICS) or
 * "+12.345g" (generic). We wait for a stable reading and convert it to grams.
 */

export interface ScaleReading {
  grams: number;
  /** The balance marked the reading stable (or gave no stability flag). */
  stable: boolean;
}

const UNITS: Record<string, number> = {
  g: 1,
  gm: 1,
  kg: 1000,
  mg: 0.001,
  ct: 0.2,
  lb: 453.59237,
  oz: 28.349523125,
};

/** Parses one line from a balance; null when it carries no weight. */
export function parseScaleLine(line: string): ScaleReading | null {
  const text = line.trim();
  if (!text) return null;
  const m = /([-+]?\s*\d+(?:[.,]\d+)?)\s*(kg|mg|gm|g|ct|lb|oz)?\b/i.exec(text);
  if (!m) return null;
  const value = Number(m[1]!.replace(/\s+/g, "").replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const unit = (m[2] ?? "g").toLowerCase();
  const factor = UNITS[unit] ?? 1;
  // Unstable markers: "US" (A&D), "S D" (Mettler dynamic), "?" or "D" flags.
  const unstable = /^(US\b|S\s+D\b|D\b)|\?/i.test(text);
  return {
    grams: Math.round(value * factor * 10000) / 10000,
    stable: !unstable,
  };
}

/** This browser can talk to a balance over a serial cable. */
export const scaleSupported = serialSupported;

export const scaleBaud = () => deviceBaud("scale");
export const setScaleBaud = (baud: number) => setDeviceBaud("scale", baud);

/**
 * Reads a stable weight from the balance, in grams. Asks the balance to
 * print ("SI") in case it only sends on request, and waits up to
 * `timeoutMs` for a stable line.
 */
export function readScale(timeoutMs = 8000): Promise<number> {
  return readUntil(
    "scale",
    (line) => {
      const reading = parseScaleLine(line);
      return reading?.stable ? reading.grams : null;
    },
    { request: "SI\r\n", timeoutMs },
  );
}
