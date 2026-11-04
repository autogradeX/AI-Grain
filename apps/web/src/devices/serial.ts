/*
 * Serial instruments on the station's computer (Chrome and Edge, Web
 * Serial API): the lab balance and the moisture meter. Each device keeps
 * its own port, recognised by its USB identity, so two instruments on one
 * computer don't take each other's port.
 */

// Minimal Web Serial types (not in TypeScript's DOM library yet).
export interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo?(): { usbVendorId?: number; usbProductId?: number };
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}
interface SerialLike {
  requestPort(): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}

export type Device = "scale" | "moisture";

const serial = (): SerialLike | null =>
  typeof navigator !== "undefined" && "serial" in navigator
    ? (navigator as unknown as { serial: SerialLike }).serial
    : null;

/** This browser can talk to instruments over a serial cable. */
export const serialSupported = () => serial() !== null;

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Not remembered: asked again next time.
    }
  },
};

const baudKey = (d: Device) => `ai-grain.${d}.baud`;
const portKey = (d: Device) => `ai-grain.${d}.port`;

export function deviceBaud(d: Device): number {
  return Number(store.get(baudKey(d))) || 9600;
}
export function setDeviceBaud(d: Device, baud: number) {
  store.set(baudKey(d), String(baud));
}

const identity = (p: SerialPortLike) => {
  const info = p.getInfo?.() ?? {};
  return `${info.usbVendorId ?? ""}:${info.usbProductId ?? ""}`;
};

const open = new Map<Device, SerialPortLike>();

/**
 * The device's port, opened. One remembered from before is reused; with
 * none remembered, a single allowed port is used, otherwise the person picks.
 */
export async function devicePort(d: Device): Promise<SerialPortLike> {
  const ready = open.get(d);
  if (ready?.readable) return ready;
  const s = serial();
  if (!s) throw new Error("This browser can't connect to instruments");
  const known = await s.getPorts();
  const taken = new Set(
    [...open.entries()].filter(([k]) => k !== d).map(([, p]) => p),
  );
  const free = known.filter((p) => !taken.has(p));
  const remembered = store.get(portKey(d));
  const p =
    free.find((k) => remembered && identity(k) === remembered) ??
    (!remembered && free.length === 1 && taken.size === 0
      ? free[0]!
      : await s.requestPort());
  await p.open({ baudRate: deviceBaud(d) });
  store.set(portKey(d), identity(p));
  open.set(d, p);
  return p;
}

/**
 * Sends `request` (if any), then reads lines until `accept` returns a value
 * or `timeoutMs` passes.
 */
export async function readUntil<T>(
  d: Device,
  accept: (line: string) => T | null,
  options: { request?: string; timeoutMs?: number } = {},
): Promise<T> {
  const p = await devicePort(d);
  if (options.request) {
    const writer = p.writable?.getWriter();
    if (writer) {
      try {
        await writer.write(new TextEncoder().encode(options.request));
      } catch {
        // Instruments that send on their own don't need the request.
      } finally {
        writer.releaseLock();
      }
    }
  }
  const reader = p.readable!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const timer = setTimeout(
    () => void reader.cancel(),
    options.timeoutMs ?? 8000,
  );
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n|\r/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const got = accept(line);
        if (got !== null) return got;
      }
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  throw new Error("No reading from the instrument");
}
