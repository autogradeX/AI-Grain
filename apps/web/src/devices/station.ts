/*
 * What Simple mode does by itself at the station: take the tray photos with
 * the cameras set up once (finding them when they changed), check the
 * station before a test, and gather what support needs when something is
 * wrong. No choices for the operator.
 */
import {
  BOTTOM_KEY,
  browserCameras,
  findPair,
  grab,
  looksBlank,
  remember,
  remembered,
  startPair,
  TOP_KEY,
} from "./cameras";
import { serialSupported } from "./serial";

/** A camera's picture couldn't be used; `camera` says which. */
export class CaptureError extends Error {
  constructor(
    readonly camera: "top" | "bottom" | "cameras",
    readonly reason: "blank" | "missing" | "start",
  ) {
    super(`${camera}: ${reason}`);
  }
}

async function showing(stream: MediaStream): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 4000);
    video.onloadeddata = () => {
      clearTimeout(timer);
      resolve();
    };
    void video.play().catch(() => undefined);
  });
  // A moment for exposure and white balance to settle.
  await new Promise((r) => setTimeout(r, 1200));
  return video;
}

async function cameraIds(): Promise<string[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "videoinput").map((d) => d.deviceId);
}

/**
 * Photographs the tray: with two cameras, top and bottom at the same moment;
 * with one, the top. Uses the cameras remembered on this computer, and finds
 * them again when they changed. Throws CaptureError on a blank picture.
 */
export async function captureTray(
  mode: "two" | "one",
): Promise<{ top: Blob; bottom?: Blob }> {
  // Labels and ids appear once camera access is allowed.
  await navigator.mediaDevices
    .getUserMedia({ video: true, audio: false })
    .then((s) => s.getTracks().forEach((t) => t.stop()))
    .catch(() => undefined);
  const ids = await cameraIds();
  if (!ids.length || (mode === "two" && ids.length < 2))
    throw new CaptureError("cameras", "missing");
  if (mode === "one") {
    const id = ids.includes(remembered(TOP_KEY))
      ? remembered(TOP_KEY)
      : ids[0]!;
    let stream: MediaStream;
    try {
      stream = await browserCameras.open(id, { width: 1920, height: 1080 });
    } catch {
      throw new CaptureError("top", "start");
    }
    try {
      const video = await showing(stream);
      if (looksBlank(video)) throw new CaptureError("top", "blank");
      remember(TOP_KEY, id);
      return { top: await grab(video) };
    } finally {
      browserCameras.stop(stream);
    }
  }
  let top = remembered(TOP_KEY);
  let bottom = remembered(BOTTOM_KEY);
  let pair: Awaited<ReturnType<typeof startPair<MediaStream>>>;
  try {
    if (!ids.includes(top) || !ids.includes(bottom) || top === bottom)
      throw new Error("not set up");
    pair = await startPair(browserCameras, top, bottom);
  } catch {
    const found = await findPair(browserCameras, ids);
    if (!found) throw new CaptureError("cameras", "start");
    [top, bottom] = found;
    try {
      pair = await startPair(browserCameras, top, bottom);
    } catch {
      throw new CaptureError("cameras", "start");
    }
  }
  try {
    const [a, b] = await Promise.all([showing(pair.top), showing(pair.bottom)]);
    if (looksBlank(a)) throw new CaptureError("top", "blank");
    if (looksBlank(b)) throw new CaptureError("bottom", "blank");
    remember(TOP_KEY, top);
    remember(BOTTOM_KEY, bottom);
    const [ta, tb] = await Promise.all([grab(a), grab(b)]);
    return { top: ta, bottom: tb };
  } finally {
    browserCameras.stop(pair.top);
    browserCameras.stop(pair.bottom);
  }
}

export type CheckId =
  "server" | "cameras" | "balance" | "meter" | "internet" | "ai";

export interface Check {
  id: CheckId;
  /** "ok"; "warn": tests run, with a note; "stop": fix this first. */
  state: "ok" | "warn" | "stop";
}

export interface StationHealth {
  orchestration: boolean;
  imageModel: boolean;
  photosWaitingForInternet: number;
  photosFailed: number;
  outbox: { waiting: number; failing: number; oldestWaiting: string | null };
}

/** Serial ports this browser was allowed to use (balance, meter). */
async function serialPorts(): Promise<number> {
  if (!serialSupported()) return 0;
  const serial = (
    navigator as unknown as {
      serial: { getPorts(): Promise<unknown[]> };
    }
  ).serial;
  return (await serial.getPorts()).length;
}

/** The station's state before a test, in the order an operator fixes things. */
export async function checkStation(
  setup: { capture: "two" | "one"; weigh: boolean; moisture: boolean },
  health: StationHealth | null,
): Promise<Check[]> {
  const checks: Check[] = [];
  checks.push({ id: "server", state: health ? "ok" : "stop" });
  const cams = await cameraIds()
    .then((ids) => ids.length)
    .catch(() => 0);
  checks.push({
    id: "cameras",
    state: cams >= (setup.capture === "two" ? 2 : 1) ? "ok" : "stop",
  });
  const ports = await serialPorts().catch(() => 0);
  if (setup.weigh) checks.push({ id: "balance", state: ports ? "ok" : "warn" });
  if (setup.moisture)
    checks.push({
      id: "meter",
      state: ports >= (setup.weigh ? 2 : 1) ? "ok" : "warn",
    });
  if (health) {
    checks.push({
      id: "internet",
      state:
        health.photosWaitingForInternet > 0 || health.outbox.failing > 0
          ? "warn"
          : "ok",
    });
    checks.push({
      id: "ai",
      state: health.orchestration || health.imageModel ? "ok" : "warn",
    });
  }
  return checks;
}

/** What support needs to see what happened: devices, connection, recent errors. */
export async function diagnostics(extra: {
  health: StationHealth | null;
  checks: Check[];
  errors: string[];
}): Promise<Record<string, unknown>> {
  let cameras: { label: string }[] = [];
  try {
    cameras = (await navigator.mediaDevices.enumerateDevices())
      .filter((d) => d.kind === "videoinput")
      .map((d) => ({ label: d.label || "(no name)" }));
  } catch {
    // Without camera access the names aren't listed.
  }
  return {
    time: new Date().toISOString(),
    page: location.pathname,
    userAgent: navigator.userAgent,
    screen: `${screen.width}×${screen.height}`,
    online: navigator.onLine,
    cameras,
    serialPorts: await serialPorts().catch(() => 0),
    serialSupported: serialSupported(),
    cameraSetup: {
      top: Boolean(remembered(TOP_KEY)),
      bottom: Boolean(remembered(BOTTOM_KEY)),
    },
    ...extra,
  };
}
