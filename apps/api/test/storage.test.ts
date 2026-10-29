import { describe, expect, it } from "vitest";
import { GcsStorage, type BucketLike } from "../src/lib/storage.js";

/** An in-memory stand-in for a Cloud Storage bucket. */
function fakeBucket() {
  const objects = new Map<string, { data: Buffer; contentType: string }>();
  const bucket: BucketLike = {
    file: (name) => ({
      save: (data, options) => {
        objects.set(name, { data, contentType: options.contentType });
        return Promise.resolve();
      },
      download: () => {
        const o = objects.get(name);
        return o
          ? Promise.resolve([o.data])
          : Promise.reject(new Error("No such object"));
      },
      delete: () => {
        objects.delete(name);
        return Promise.resolve();
      },
    }),
    deleteFiles: ({ prefix }) => {
      for (const key of [...objects.keys()])
        if (key.startsWith(prefix)) objects.delete(key);
      return Promise.resolve();
    },
  };
  return { bucket, objects };
}

describe("GcsStorage", () => {
  it("stores, reads and removes objects under a prefix", async () => {
    const { bucket, objects } = fakeBucket();
    const storage = new GcsStorage(bucket, "prod/");
    await storage.put(
      "orgs/1/samples/2/batches/3/original.jpg",
      Buffer.from("a"),
    );
    await storage.put(
      "orgs/1/samples/2/batches/3/kernels/1.jpg",
      Buffer.from("b"),
    );
    await storage.put(
      "orgs/1/samples/22/batches/9/original.jpg",
      Buffer.from("c"),
    );

    expect(
      objects.get("prod/orgs/1/samples/2/batches/3/original.jpg")?.contentType,
    ).toBe("image/jpeg");
    expect(
      (
        await storage.get("orgs/1/samples/2/batches/3/kernels/1.jpg")
      ).toString(),
    ).toBe("b");

    // Removing sample 2 must not touch sample 22, whose id shares the prefix.
    await storage.remove("orgs/1/samples/2");
    expect([...objects.keys()]).toEqual([
      "prod/orgs/1/samples/22/batches/9/original.jpg",
    ]);
  });

  it("rejects keys that try to leave the prefix", async () => {
    const storage = new GcsStorage(fakeBucket().bucket, "prod");
    await expect(
      storage.put("../other/x.jpg", Buffer.from("")),
    ).rejects.toThrow(/Invalid storage key/);
  });
});
