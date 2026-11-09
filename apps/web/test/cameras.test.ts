import { describe, expect, it } from "vitest";
import {
  findPair,
  PairError,
  startPair,
  type CameraApi,
  type Size,
} from "../src/devices/cameras";

/**
 * Simulated cameras on one USB controller: open streams share a budget of
 * pixels per second; `dead` cameras are listed but never give pictures.
 */
function rig(options: { budget: number; dead?: string[]; broken?: string[] }) {
  const open = new Set<{ id: string; px: number }>();
  const used = () => [...open].reduce((n, s) => n + s.px, 0);
  const api: CameraApi<{ id: string; px: number }> = {
    open(id: string, size: Size) {
      const px = size.width * size.height;
      if (options.broken?.includes(id))
        return Promise.reject(new Error("Could not start video source"));
      if ([...open].some((s) => s.id === id))
        return Promise.reject(new Error("Device in use"));
      if (used() + px > options.budget)
        return Promise.reject(new Error("Could not start video source"));
      const s = { id, px };
      open.add(s);
      return Promise.resolve(s);
    },
    delivers: (s) => Promise.resolve(!options.dead?.includes(s.id)),
    stop: (s) => void open.delete(s),
  };
  return { api, open };
}

describe("two cameras on one USB controller", () => {
  it("runs both at Full HD when there is room", async () => {
    const { api } = rig({ budget: 1e7 });
    const pair = await startPair(api, "a", "b");
    expect(pair.size.width).toBe(1920);
  });

  it("steps both down together when the second wouldn't fit", async () => {
    // Room for one Full HD stream, or two at 1280x720.
    const { api, open } = rig({ budget: 2.2e6 });
    const pair = await startPair(api, "a", "b");
    expect(pair.size.width).toBe(1280);
    expect(open.size).toBe(2);
  });

  it("names the camera that won't start at any size", async () => {
    const { api, open } = rig({ budget: 1e7, broken: ["b"] });
    const err = await startPair(api, "a", "b").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PairError);
    expect((err as PairError).which).toBe("bottom");
    // Nothing left running.
    expect(open.size).toBe(0);
  });

  it("finds the two cameras that give pictures together, skipping a dead entry", async () => {
    // Listed: a built-in camera that gives no picture, the top, a duplicate entry.
    const { api, open } = rig({
      budget: 1e7,
      dead: ["builtin"],
      broken: ["dup"],
    });
    expect(await findPair(api, ["builtin", "dup", "c1", "c2"])).toEqual([
      "c1",
      "c2",
    ]);
    expect(open.size).toBe(0);
    expect(await findPair(api, ["builtin", "c1", "dup"])).toBeNull();
  });
});
