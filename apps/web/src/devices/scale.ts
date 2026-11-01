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

// Minimal Web Serial types (not in TypeScript's DOM library yet).
interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}
interface SerialLike {
  requestPort(): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}

const serial = (): SerialLike | null =>
  typeof navigator !== "undefined" && "serial" in navigator
    ? (navigator as unknown as { serial: SerialLike }).serial
    : null;

/** This browser can talk to a balance over a serial cable. */
export const scaleSupported = () => serial() !== null;

const BAUD_KEY = "ai-grain.scale.baud";
export function scaleBaud(): number {
  try {
    return Number(localStorage.getItem(BAUD_KEY)) || 9600;
  } catch {
    return 9600;
  }
}
export function setScaleBaud(baud: number) {
  try {
    localStorage.setItem(BAUD_KEY, String(baud));
  } catch {
    // Not remembered; 9600 next time.
  }
}

let port: SerialPortLike | null = null;

async function openPort(): Promise<SerialPortLike> {
  if (port?.readable) return port;
  const s = serial();
  if (!s) throw new Error("This browser can't connect to a scale");
  // A port allowed before is reused without asking again.
  const known = await s.getPorts();
  const p = known[0] ?? (await s.requestPort());
  await p.open({ baudRate: scaleBaud() });
  port = p;
  return p;
}

/**
 * Reads a stable weight from the balance, in grams. Asks the balance to
 * print ("P" / "SI") in case it only sends on request, and waits up to
 * `timeoutMs` for a stable line.
 */
export async function readScale(timeoutMs = 8000): Promise<number> {
  const p = await openPort();
  const writer = p.writable?.getWriter();
  if (writer) {
    try {
      await writer.write(new TextEncoder().encode("SI\r\n"));
    } catch {
      // Balances that stream continuously don't need the request.
    } finally {
      writer.releaseLock();
    }
  }
  const reader = p.readable!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const timer = setTimeout(() => void reader.cancel(), timeoutMs);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n|\r/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const reading = parseScaleLine(line);
        if (reading?.stable) return reading.grams;
      }
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  throw new Error("No stable reading from the scale");
}
