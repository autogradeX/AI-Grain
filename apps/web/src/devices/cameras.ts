/*
 * Running two USB cameras at once (top and bottom of a glass tray), and
 * finding which of the computer's cameras those are, without the operator
 * knowing anything about USB. Two cameras on one USB controller share its
 * bandwidth: the pair is started together, one after the other, and both
 * step down in size until both run. Everything the browser does is passed
 * in, so the logic is tested with simulated cameras.
 */

export interface Size {
  width: number;
  height: number;
}

/** Sizes tried, together, for both cameras: still photos need no more than Full HD at 15 frames a second. */
export const PAIR_SIZES: Size[] = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 640, height: 480 },
];

export interface CameraApi<S> {
  /** Opens a camera at about this size; rejects when it can't start. */
  open(deviceId: string, size: Size): Promise<S>;
  /** Whether pictures really arrive (not a black, frozen stream). */
  delivers(stream: S): Promise<boolean>;
  stop(stream: S): void;
}

export class PairError extends Error {
  constructor(
    /** The camera that wouldn't start ("top" or "bottom"). */
    readonly which: "top" | "bottom",
    message: string,
  ) {
    super(message);
  }
}

const reason = (err: unknown) =>
  err instanceof Error && err.message ? err.message : "the camera didn't start";

/** Opens a camera and checks that pictures arrive; stops it when they don't. */
async function openWorking<S>(api: CameraApi<S>, id: string, size: Size) {
  const s = await api.open(id, size);
  if (await api.delivers(s)) return s;
  api.stop(s);
  throw new Error("no picture from the camera");
}

/**
 * Starts both cameras, top first, at the largest size both can run at
 * together. Throws PairError naming the camera that won't start at any size.
 */
export async function startPair<S>(
  api: CameraApi<S>,
  topId: string,
  bottomId: string,
): Promise<{ top: S; bottom: S; size: Size }> {
  let failure: PairError | null = null;
  for (const size of PAIR_SIZES) {
    let top: S;
    try {
      top = await openWorking(api, topId, size);
    } catch (err) {
      failure = new PairError("top", reason(err));
      continue;
    }
    try {
      const bottom = await openWorking(api, bottomId, size);
      return { top, bottom, size };
    } catch (err) {
      // Not both at this size: free the bandwidth, try both smaller.
      api.stop(top);
      failure = new PairError("bottom", reason(err));
    }
  }
  throw failure ?? new PairError("top", "the camera didn't start");
}

/**
 * Finds two cameras that give pictures at the same time, trying every pair
 * of the computer's cameras at the smallest size (some cameras are listed
 * twice, or are built-in ones). Null when no two work together.
 */
export async function findPair<S>(
  api: CameraApi<S>,
  deviceIds: string[],
): Promise<[string, string] | null> {
  const small = PAIR_SIZES[PAIR_SIZES.length - 1]!;
  for (let i = 0; i < deviceIds.length; i++) {
    let first: S;
    try {
      first = await openWorking(api, deviceIds[i]!, small);
    } catch {
      continue;
    }
    for (let j = 0; j < deviceIds.length; j++) {
      if (j === i) continue;
      try {
        const second = await openWorking(api, deviceIds[j]!, small);
        api.stop(second);
        api.stop(first);
        return [deviceIds[i]!, deviceIds[j]!];
      } catch {
        // Not this one with the first: try the next.
      }
    }
    api.stop(first);
  }
  return null;
}

/** The browser's cameras, as CameraApi works with them. */
export const browserCameras: CameraApi<MediaStream> = {
  open: (deviceId, size) =>
    navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: size.width },
        height: { ideal: size.height },
        frameRate: { ideal: 15, max: 15 },
      },
      audio: false,
    }),
  delivers: (stream) =>
    new Promise((resolve) => {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      const done = (ok: boolean) => {
        clearTimeout(timer);
        video.srcObject = null;
        resolve(ok);
      };
      const timer = setTimeout(() => done(false), 4000);
      video.onloadeddata = () => done(video.videoWidth > 0);
      void video.play().catch(() => undefined);
    }),
  stop: (stream) => stream.getTracks().forEach((t) => t.stop()),
};

// --- Shared by the two-camera screen and Simple mode ---------------------

export const TOP_KEY = "ai-grain.camera.top";
export const BOTTOM_KEY = "ai-grain.camera.bottom";

export const remembered = (key: string) => {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};
export const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Found again next time.
  }
};

/** The current frame of a video at its full size, as a JPEG. */
export function grab(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No frame from the camera"))),
      "image/jpeg",
      0.92,
    ),
  );
}

/**
 * Whether a frame shows something: a covered, unfocused or washed-out camera
 * gives an almost even picture. Checked on a small copy: the spread of its
 * brightness, and how much neighbouring pixels differ (edges of grains).
 */
export function looksBlank(video: HTMLVideoElement): boolean {
  const w = 160;
  const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * w));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(video, 0, 0, w, h);
  const { data } = g.getImageData(0, 0, w, h);
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++)
    lum[i] =
      0.299 * data[i * 4]! +
      0.587 * data[i * 4 + 1]! +
      0.114 * data[i * 4 + 2]!;
  let mean = 0;
  for (const v of lum) mean += v / lum.length;
  let spread = 0;
  let edges = 0;
  for (let i = 0; i < lum.length; i++) {
    spread += (lum[i]! - mean) ** 2 / lum.length;
    if (i % w < w - 1) edges += Math.abs(lum[i]! - lum[i + 1]!) / lum.length;
  }
  return Math.sqrt(spread) < 10 || edges < 1.5;
}
