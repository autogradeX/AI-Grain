import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useT } from "../i18n";
import { Card, ErrorNote, Field } from "./ui";
import { m } from "./DualCamera.i18n";

const TOP_KEY = "ai-grain.camera.top";
const BOTTOM_KEY = "ai-grain.camera.bottom";

const remembered = (key: string) => {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};
const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Asked again next time.
  }
};

/**
 * Sizes tried in turn. Two USB cameras on one controller share its
 * bandwidth: asking each for its largest size makes the second fail to start
 * ("Could not start video source"), so start at Full HD at 15 frames a second
 * (a still photo needs no more) and step down when a camera can't start.
 */
const LADDER = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 640, height: 480 },
];

/** Errors that mean "not like this" (busy, bandwidth), worth a smaller size. */
const RETRYABLE = new Set([
  "NotReadableError",
  "OverconstrainedError",
  "AbortError",
  "TrackStartError",
]);

export type CameraState =
  | { status: "idle" | "starting" }
  | { status: "live"; width: number; height: number }
  | { status: "failed"; error: string; name: string };

/**
 * A live camera by device id. Starts only when `enabled` (so two cameras
 * open one after the other) and again on each `attempt`.
 */
function useCamera(deviceId: string, enabled: boolean, attempt: number) {
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>({ status: "idle" });
  useEffect(() => {
    if (!deviceId || !enabled) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    const start = async () => {
      let last: { error: string; name: string } = { error: "", name: "" };
      for (const size of LADDER) {
        try {
          const s = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: deviceId },
              width: { ideal: size.width },
              height: { ideal: size.height },
              frameRate: { ideal: 15, max: 15 },
            },
            audio: false,
          });
          if (cancelled) {
            s.getTracks().forEach((tr) => tr.stop());
            return;
          }
          stream = s;
          const settings = s.getVideoTracks()[0]?.getSettings() ?? {};
          if (ref.current) {
            ref.current.srcObject = s;
            void ref.current.play().catch(() => undefined);
          }
          setState({
            status: "live",
            width: settings.width ?? size.width,
            height: settings.height ?? size.height,
          });
          return;
        } catch (err) {
          const name = err instanceof Error ? err.name : "";
          last = {
            error: err instanceof Error ? err.message : String(err),
            name,
          };
          if (!RETRYABLE.has(name)) break;
        }
      }
      if (!cancelled) setState({ status: "failed", ...last });
    };
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setState({ status: "starting" });
      })
      .then(start);
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [deviceId, enabled, attempt]);
  return { ref, state };
}

/** The current frame of a video at its full size, as a JPEG. */
function grab(video: HTMLVideoElement): Promise<Blob> {
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
 * Two USB cameras, above and below a glass tray: both live, one button takes
 * both frames at the same moment and sends them as a pair (the bottom one
 * mirrored and matched kernel by kernel on the server).
 */
export function DualCamera({
  sampleId,
  autopilot,
  onDone,
  onCancel,
}: {
  sampleId: string;
  autopilot: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useT(m);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [topId, setTopId] = useState(remembered(TOP_KEY));
  const [bottomId, setBottomId] = useState(remembered(BOTTOM_KEY));
  const [last, setLast] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Opened one after the other: some drivers refuse two starts at once.
  const [attempt, setAttempt] = useState(0);
  const top = useCamera(topId, true, attempt);
  const topSettled =
    top.state.status === "live" || top.state.status === "failed";
  const bottom = useCamera(bottomId, topSettled, attempt);

  useEffect(() => {
    // Labels and ids are only listed once camera access is allowed.
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((s) => s.getTracks().forEach((tr) => tr.stop()))
      .catch(() => undefined)
      .then(() => navigator.mediaDevices.enumerateDevices())
      .then((all) => {
        const cams = all.filter((d) => d.kind === "videoinput");
        setDevices(cams);
        const ids = cams.map((c) => c.deviceId);
        if (!ids.includes(topId)) setTopId(ids[0] ?? "");
        if (!ids.includes(bottomId))
          setBottomId(
            ids.find((i) => i !== (ids.includes(topId) ? topId : ids[0])) ?? "",
          );
      })
      .catch((err: unknown) =>
        setListError(err instanceof Error ? err.message : String(err)),
      );
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const capture = async () => {
    setBusy(true);
    setError(null);
    try {
      // Both frames first, so they show the tray at the same moment.
      const [a, b] = await Promise.all([
        grab(top.ref.current!),
        grab(bottom.ref.current!),
      ]);
      const first = new FormData();
      first.set("side", "front");
      first.set("photo", a, "top.jpg");
      const made = await api.upload<{ id: string }>(
        `/samples/${sampleId}/batches`,
        first,
      );
      const second = new FormData();
      second.set("pairWith", made.id);
      if (autopilot && last) second.set("finish", "true");
      second.set("photo", b, "bottom.jpg");
      await api.upload(`/samples/${sampleId}/batches`, second);
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const select = (
    value: string,
    onChange: (v: string) => void,
    key: string,
  ) => (
    <select
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        remember(key, e.target.value);
      }}
    >
      <option value="">{t("pick")}</option>
      {devices.map((d, i) => (
        <option key={d.deviceId} value={d.deviceId}>
          {labelOf(d, i)}
        </option>
      ))}
    </select>
  );
  const same = topId && topId === bottomId;
  // Two cameras of the same model have the same name: number them.
  const labelOf = (d: MediaDeviceInfo, i: number) => {
    const name = d.label || t("cameraN", { n: i + 1 });
    return devices.filter((o) => o.label === d.label).length > 1
      ? `${name} · ${t("cameraN", { n: i + 1 })}`
      : name;
  };
  const failed = [top.state, bottom.state].find(
    (st): st is Extract<CameraState, { status: "failed" }> =>
      st.status === "failed",
  );
  const cameraError = failed?.error ?? listError;
  const live = top.state.status === "live" && bottom.state.status === "live";
  const sizeOf = (st: CameraState) =>
    st.status === "live"
      ? t("liveAt", { size: `${st.width}×${st.height}` })
      : st.status === "starting"
        ? t("starting")
        : st.status === "failed"
          ? t("notStarted")
          : "";

  return (
    <Card title={t("title")}>
      <p className="muted small">{t("hint")}</p>
      {devices.length < 2 && !listError && (
        <p className="warn small">{t("noCameras")}</p>
      )}
      {cameraError && (
        <div className="error small">
          <p>{t("blocked", { reason: cameraError })}</p>
          {failed?.name !== "NotAllowedError" && <p>{t("bandwidth")}</p>}
          <button type="button" onClick={() => setAttempt(attempt + 1)}>
            {t("retry")}
          </button>
        </div>
      )}
      <div className="grid-2">
        <Field label={t("top")}>
          {select(topId, setTopId, TOP_KEY)}
          <video ref={top.ref} className="dual-preview" muted playsInline />
          <span className="muted small">{sizeOf(top.state)}</span>
        </Field>
        <Field label={t("bottom")}>
          {select(bottomId, setBottomId, BOTTOM_KEY)}
          <video ref={bottom.ref} className="dual-preview" muted playsInline />
          <span className="muted small">{sizeOf(bottom.state)}</span>
        </Field>
      </div>
      {devices.length >= 2 && (
        <div>
          <button
            type="button"
            onClick={() => {
              setTopId(bottomId);
              setBottomId(topId);
              remember(TOP_KEY, bottomId);
              remember(BOTTOM_KEY, topId);
            }}
          >
            {t("swap")}
          </button>
        </div>
      )}
      {same && <p className="warn small">{t("same")}</p>}
      {autopilot && (
        <label className="row small">
          <input
            type="checkbox"
            checked={last}
            onChange={(e) => setLast(e.target.checked)}
          />
          {t("lastPhoto")}
        </label>
      )}
      <p className="muted small">{t("needsServer")}</p>
      <ErrorNote error={error} />
      <div className="row wrap">
        <button type="button" onClick={onCancel}>
          {t("cancel")}
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || !live || !!same}
          onClick={() => void capture()}
        >
          {busy ? t("sending") : t("capture")}
        </button>
      </div>
    </Card>
  );
}
