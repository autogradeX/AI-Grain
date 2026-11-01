import { useSyncExternalStore } from "react";

/*
 * Work saved on the device while there is no connection, uploaded when it
 * comes back: new samples and board photos. Each item carries a reference
 * the server uses to recognise a retry (`clientRef`), so an upload that
 * reached the server but whose answer was lost isn't stored twice.
 *
 * Only this queue lives on the device; the service worker still never
 * caches /api responses.
 */

export interface QueuedSample {
  kind: "sample";
  ref: string;
  createdAt: string;
  data: { crop: string; source: string | null; standardId: string | null };
  /** Set once the server has it. */
  sampleId?: string;
  sampleNumber?: number;
}

export interface QueuedPhoto {
  kind: "photo";
  ref: string;
  createdAt: string;
  /** A sample already on the server, or one queued here (by its ref). */
  sampleId?: string;
  sampleRef?: string;
  photo: Blob;
  side: "auto" | "front" | "crease";
  /** The last photo of the sample: Autopilot finishes it. */
  finish: boolean;
  /** Why the server refused it; the item stays until removed. */
  error?: string;
}

export type QueueItem = QueuedSample | QueuedPhoto;

export interface QueueStore {
  list(): Promise<QueueItem[]>;
  put(item: QueueItem): Promise<void>;
  remove(ref: string): Promise<void>;
}

/** Talks to the API; injected so tests can fake it. */
export interface SyncClient {
  createSample(
    body: QueuedSample["data"] & { clientRef: string },
  ): Promise<{ id: string; number: number }>;
  uploadPhoto(sampleId: string, form: FormData): Promise<unknown>;
}

/** An error that means the server answered (and refused), not that it was unreachable. */
export interface HttpLikeError {
  status: number;
  message: string;
}
const isRefusal = (err: unknown): err is HttpLikeError =>
  typeof err === "object" &&
  err !== null &&
  typeof (err as { status?: unknown }).status === "number" &&
  (err as { status: number }).status >= 400 &&
  (err as { status: number }).status < 500 &&
  (err as { status: number }).status !== 401 &&
  (err as { status: number }).status !== 408 &&
  (err as { status: number }).status !== 429;

export interface SyncOutcome {
  uploaded: number;
  /** Items the server refused (kept, with the reason). */
  refused: number;
  /** Stopped early: the server couldn't be reached. */
  offline: boolean;
}

/**
 * Uploads what is queued, oldest first: samples before their photos. Stops
 * at the first network failure and leaves the rest for the next try.
 */
export async function syncQueue(
  store: QueueStore,
  client: SyncClient,
  /** Told about each queued sample the server created (to link to it later). */
  onCreated?: (ref: string, sample: { id: string; number: number }) => void,
): Promise<SyncOutcome> {
  const items = (await store.list()).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const outcome: SyncOutcome = { uploaded: 0, refused: 0, offline: false };
  const sampleIds = new Map<string, string>();
  for (const item of items)
    if (item.kind === "sample" && item.sampleId)
      sampleIds.set(item.ref, item.sampleId);

  for (const item of items) {
    try {
      if (item.kind === "sample") {
        if (item.sampleId) continue;
        const created = await client.createSample({
          ...item.data,
          clientRef: item.ref,
        });
        sampleIds.set(item.ref, created.id);
        onCreated?.(item.ref, created);
        // Kept (as created) until its photos are up, so they can find it.
        await store.put({
          ...item,
          sampleId: created.id,
          sampleNumber: created.number,
        });
        outcome.uploaded++;
      } else {
        if (item.error) continue;
        const sampleId =
          item.sampleId ??
          (item.sampleRef ? sampleIds.get(item.sampleRef) : undefined);
        if (!sampleId) continue;
        const form = new FormData();
        form.set("side", item.side);
        form.set("clientRef", item.ref);
        if (item.finish) form.set("finish", "true");
        form.set("photo", item.photo, `${item.ref}.jpg`);
        await client.uploadPhoto(sampleId, form);
        await store.remove(item.ref);
        outcome.uploaded++;
      }
    } catch (err) {
      if (isRefusal(err)) {
        outcome.refused++;
        if (item.kind === "photo")
          await store.put({ ...item, error: err.message });
        continue;
      }
      outcome.offline = true;
      break;
    }
  }

  // Created samples whose photos are all up are done.
  const left = await store.list();
  for (const item of left) {
    if (item.kind !== "sample" || !item.sampleId) continue;
    const waiting = left.some(
      (p) => p.kind === "photo" && p.sampleRef === item.ref,
    );
    if (!waiting) await store.remove(item.ref);
  }
  return outcome;
}

/** A reference unique to this device and item. */
export function newRef(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `dev-${random}`;
}

// --- Storage --------------------------------------------------------------

export function memoryStore(): QueueStore & { items: Map<string, QueueItem> } {
  const items = new Map<string, QueueItem>();
  return {
    items,
    list: () => Promise.resolve([...items.values()]),
    put: (item) => {
      items.set(item.ref, item);
      return Promise.resolve();
    },
    remove: (ref) => {
      items.delete(ref);
      return Promise.resolve();
    },
  };
}

const DB_NAME = "ai-grain-offline";
const STORE = "queue";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "ref" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB failed"));
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        t.onerror = () => {
          db.close();
          reject(t.error ?? new Error("IndexedDB failed"));
        };
      }),
  );
}

/** The device's queue, in IndexedDB (photos are Blobs, too big for localStorage). */
export const deviceStore: QueueStore = {
  list: () => tx("readonly", (s) => s.getAll() as IDBRequest<QueueItem[]>),
  put: (item) => tx("readwrite", (s) => s.put(item)).then(() => undefined),
  remove: (ref) => tx("readwrite", (s) => s.delete(ref)).then(() => undefined),
};

// --- What the screens show ------------------------------------------------

export interface QueueStatus {
  samples: number;
  photos: number;
  refused: number;
  syncing: boolean;
}

let status: QueueStatus = { samples: 0, photos: 0, refused: 0, syncing: false };
const listeners = new Set<() => void>();

function setStatus(next: Partial<QueueStatus>) {
  status = { ...status, ...next };
  for (const l of listeners) l();
}

export async function refreshStatus(store: QueueStore = deviceStore) {
  if (typeof indexedDB === "undefined" && store === deviceStore) return;
  const items = await store.list();
  setStatus({
    samples: items.filter((i) => i.kind === "sample" && !i.sampleId).length,
    photos: items.filter((i) => i.kind === "photo").length,
    refused: items.filter((i) => i.kind === "photo" && i.error).length,
  });
}

export function useQueueStatus(): QueueStatus {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => status,
    () => status,
  );
}

/** Adds to the device queue and updates the counts. */
export async function enqueue(item: QueueItem) {
  await deviceStore.put(item);
  await refreshStatus();
}

const CREATED_KEY = "ai-grain.offline.created";

/** Samples created from the queue, by ref: so a page can link to them after upload. */
export function createdSamples(): Record<
  string,
  { id: string; number: number }
> {
  try {
    return JSON.parse(localStorage.getItem(CREATED_KEY) ?? "{}") as Record<
      string,
      { id: string; number: number }
    >;
  } catch {
    return {};
  }
}

function rememberCreated(ref: string, sample: { id: string; number: number }) {
  try {
    // The last 50 are plenty.
    const all = Object.entries({ ...createdSamples(), [ref]: sample }).slice(
      -50,
    );
    localStorage.setItem(CREATED_KEY, JSON.stringify(Object.fromEntries(all)));
  } catch {
    // Without storage the page just links to the samples list.
  }
}

let running: Promise<SyncOutcome> | null = null;

/** Uploads the device queue now (one run at a time). */
export function syncNow(client: SyncClient): Promise<SyncOutcome> {
  running ??= (async () => {
    setStatus({ syncing: true });
    try {
      return await syncQueue(deviceStore, client, rememberCreated);
    } finally {
      await refreshStatus();
      setStatus({ syncing: false });
      running = null;
    }
  })();
  return running;
}
