import { describe, expect, it } from "vitest";
import {
  memoryStore,
  syncQueue,
  type QueueItem,
  type SyncClient,
} from "../src/offline/queue";

const blob = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])]);
const at = (n: number) => new Date(2026, 10, 1, 10, n).toISOString();

function fakeClient(options: { failAfter?: number; refuse?: string[] } = {}) {
  const calls: string[] = [];
  let n = 0;
  const step = () => {
    if (options.failAfter !== undefined && n >= options.failAfter)
      throw new TypeError("Failed to fetch");
    n++;
  };
  const client: SyncClient = {
    createSample(body) {
      step();
      calls.push(`sample ${body.clientRef}`);
      return Promise.resolve({ id: `srv-${body.clientRef}`, number: 7 });
    },
    uploadPhoto(sampleId, form) {
      step();
      const ref = form.get("clientRef") as string;
      if (options.refuse?.includes(ref))
        return Promise.reject(
          Object.assign(new Error("Not an image"), { status: 400 }),
        );
      calls.push(
        `photo ${ref} -> ${sampleId}${form.get("finish") ? " finish" : ""}`,
      );
      return Promise.resolve({});
    },
  };
  return { client, calls };
}

const sample = (ref: string, n: number): QueueItem => ({
  kind: "sample",
  ref,
  createdAt: at(n),
  data: { crop: "paddy", source: "Lot 1", standardId: null },
});
const photo = (
  ref: string,
  n: number,
  owner: { sampleRef?: string; sampleId?: string },
  finish = false,
): QueueItem => ({
  kind: "photo",
  ref,
  createdAt: at(n),
  ...owner,
  photo: blob(),
  side: "auto",
  finish,
});

describe("offline queue", () => {
  it("creates queued samples, then uploads their photos, and empties the queue", async () => {
    const store = memoryStore();
    await store.put(photo("p2", 3, { sampleRef: "s1" }, true));
    await store.put(sample("s1", 1));
    await store.put(photo("p1", 2, { sampleRef: "s1" }));
    await store.put(photo("p3", 4, { sampleId: "existing" }));
    const { client, calls } = fakeClient();
    const outcome = await syncQueue(store, client);
    expect(calls).toEqual([
      "sample s1",
      "photo p1 -> srv-s1",
      "photo p2 -> srv-s1 finish",
      "photo p3 -> existing",
    ]);
    expect(outcome).toEqual({ uploaded: 4, refused: 0, offline: false });
    expect(store.items.size).toBe(0);
  });

  it("stops when the connection drops and carries on later without repeats", async () => {
    const store = memoryStore();
    await store.put(sample("s1", 1));
    await store.put(photo("p1", 2, { sampleRef: "s1" }));
    await store.put(photo("p2", 3, { sampleRef: "s1" }));
    const first = fakeClient({ failAfter: 2 });
    expect((await syncQueue(store, first.client)).offline).toBe(true);
    expect(first.calls).toEqual(["sample s1", "photo p1 -> srv-s1"]);
    // The sample is remembered as created; only p2 is left to send.
    const second = fakeClient();
    await syncQueue(store, second.client);
    expect(second.calls).toEqual(["photo p2 -> srv-s1"]);
    expect(store.items.size).toBe(0);
  });

  it("keeps a photo the server refuses, with the reason, and goes on", async () => {
    const store = memoryStore();
    await store.put(photo("bad", 1, { sampleId: "x" }));
    await store.put(photo("good", 2, { sampleId: "x" }));
    const { client, calls } = fakeClient({ refuse: ["bad"] });
    const outcome = await syncQueue(store, client);
    expect(outcome).toEqual({ uploaded: 1, refused: 1, offline: false });
    expect(calls).toEqual(["photo good -> x"]);
    const left = [...store.items.values()];
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ ref: "bad", error: "Not an image" });
  });
});
