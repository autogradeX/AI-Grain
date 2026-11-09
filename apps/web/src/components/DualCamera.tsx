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

/** A live camera by device id, at the highest resolution it offers. */
function useCamera(deviceId: string) {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!deviceId) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 4096 },
          height: { ideal: 3072 },
        },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stream = s;
        setError(null);
        if (ref.current) {
          ref.current.srcObject = s;
          void ref.current.play().catch(() => undefined);
        }
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [deviceId]);
  return { ref, error };
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
  const top = useCamera(topId);
  const bottom = useCamera(bottomId);

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
          {d.label || `Camera ${i + 1}`}
        </option>
      ))}
    </select>
  );
  const same = topId && topId === bottomId;
  const cameraError = top.error ?? bottom.error ?? listError;

  return (
    <Card title={t("title")}>
      <p className="muted small">{t("hint")}</p>
      {devices.length < 2 && !listError && (
        <p className="warn small">{t("noCameras")}</p>
      )}
      {cameraError && (
        <p className="error small">{t("blocked", { reason: cameraError })}</p>
      )}
      <div className="grid-2">
        <Field label={t("top")}>
          {select(topId, setTopId, TOP_KEY)}
          <video ref={top.ref} className="dual-preview" muted playsInline />
        </Field>
        <Field label={t("bottom")}>
          {select(bottomId, setBottomId, BOTTOM_KEY)}
          <video ref={bottom.ref} className="dual-preview" muted playsInline />
        </Field>
      </div>
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
          disabled={busy || !topId || !bottomId || !!same || !!cameraError}
          onClick={() => void capture()}
        >
          {busy ? t("sending") : t("capture")}
        </button>
      </div>
    </Card>
  );
}
