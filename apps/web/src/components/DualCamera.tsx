import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import {
  BOTTOM_KEY,
  browserCameras,
  findPair,
  grab,
  looksBlank,
  PairError,
  remember,
  remembered,
  startPair,
  TOP_KEY,
  type Size,
} from "../devices/cameras";
import { useT } from "../i18n";
import { Card, ErrorNote, Field } from "./ui";
import { m } from "./DualCamera.i18n";

type Phase =
  | { at: "listing" | "starting" | "finding" }
  | { at: "live"; size: Size }
  | { at: "failed"; which: "top" | "bottom" | "both"; reason: string };

/**
 * Two USB cameras, above and below a glass tray, running at the same time:
 * one button takes both frames at once and sends them as a pair. The
 * cameras are started together at the largest size both can run at; when
 * the remembered pair won't run, the computer's cameras are tried until two
 * give pictures together, so nobody has to know which entry is which.
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
  const [pair, setPair] = useState<[string, string]>([
    remembered(TOP_KEY),
    remembered(BOTTOM_KEY),
  ]);
  const [phase, setPhase] = useState<Phase>({ at: "listing" });
  const [attempt, setAttempt] = useState(0);
  // "find": look for two working cameras before starting (the button).
  const [finding, setFinding] = useState(false);
  // Searching for a working pair happens once per attempt.
  const searched = useRef(-1);
  const [last, setLast] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const topVideo = useRef<HTMLVideoElement>(null);
  const bottomVideo = useRef<HTMLVideoElement>(null);
  const [topId, bottomId] = pair;

  useEffect(() => {
    // Labels and ids are only listed once camera access is allowed.
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((s) => s.getTracks().forEach((tr) => tr.stop()))
      .catch(() => undefined)
      .then(() => navigator.mediaDevices.enumerateDevices())
      .then((all) => {
        if (cancelled) return;
        const cams = all.filter((d) => d.kind === "videoinput");
        setDevices(cams);
        const ids = cams.map((c) => c.deviceId);
        setPair(([a, b]) => {
          const top = ids.includes(a) ? a : (ids[0] ?? "");
          const bottom =
            ids.includes(b) && b !== top
              ? b
              : (ids.find((i) => i !== top) ?? "");
          return [top, bottom];
        });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setPhase({
            at: "failed",
            which: "both",
            reason: err instanceof Error ? err.message : String(err),
          });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!devices.length) return;
    let cancelled = false;
    const running: MediaStream[] = [];
    const run = async () => {
      if (devices.length < 2 || !topId || !bottomId || topId === bottomId) {
        setPhase({
          at: "failed",
          which: "both",
          reason: t(devices.length < 2 ? "noCameras" : "same"),
        });
        return;
      }
      if (finding) {
        // The cameras of the last try are released by now.
        setPhase({ at: "finding" });
        const found = await findPair(
          browserCameras,
          devices.map((d) => d.deviceId),
        );
        if (cancelled) return;
        setFinding(false);
        searched.current = attempt;
        if (found && (found[0] !== topId || found[1] !== bottomId)) {
          setPair(found);
          return;
        }
        if (!found) {
          setPhase({ at: "failed", which: "both", reason: t("noPair") });
          return;
        }
      }
      setPhase({ at: "starting" });
      try {
        const started = await startPair(browserCameras, topId, bottomId);
        running.push(started.top, started.bottom);
        if (cancelled) return;
        if (topVideo.current) topVideo.current.srcObject = started.top;
        if (bottomVideo.current) bottomVideo.current.srcObject = started.bottom;
        void topVideo.current?.play().catch(() => undefined);
        void bottomVideo.current?.play().catch(() => undefined);
        remember(TOP_KEY, topId);
        remember(BOTTOM_KEY, bottomId);
        setPhase({ at: "live", size: started.size });
      } catch (err) {
        if (cancelled) return;
        // The chosen pair won't run: find two cameras that do, once.
        if (searched.current !== attempt) {
          searched.current = attempt;
          setPhase({ at: "finding" });
          const found = await findPair(
            browserCameras,
            devices.map((d) => d.deviceId),
          );
          if (cancelled) return;
          if (found && (found[0] !== topId || found[1] !== bottomId)) {
            setPair(found);
            return;
          }
        }
        setPhase({
          at: "failed",
          which: err instanceof PairError ? err.which : "both",
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    };
    void Promise.resolve().then(run);
    return () => {
      cancelled = true;
      running.forEach((s) => browserCameras.stop(s));
    };
    // `t` changes with the language only; restarting cameras for it isn't needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices, topId, bottomId, attempt, finding]);

  const capture = async () => {
    setBusy(true);
    setError(null);
    try {
      // A camera that sees nothing (covered, out of focus, washed out).
      const blank = [
        looksBlank(topVideo.current!) && t("topBlank"),
        looksBlank(bottomVideo.current!) && t("bottomBlank"),
      ].filter(Boolean);
      if (blank.length) throw new Error(blank.join(" "));
      // Both frames first, so they show the tray at the same moment.
      const [a, b] = await Promise.all([
        grab(topVideo.current!),
        grab(bottomVideo.current!),
      ]);
      const first = new FormData();
      first.set("side", "front");
      // A glass tray, no grid board: the whole picture, never a dark area
      // mistaken for the board.
      first.set("board", "none");
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

  // Two cameras of the same model have the same name: number them.
  const labelOf = (d: MediaDeviceInfo, i: number) => {
    const name = d.label || t("cameraN", { n: i + 1 });
    return devices.filter((o) => o.label === d.label).length > 1
      ? `${name} · ${t("cameraN", { n: i + 1 })}`
      : name;
  };
  const select = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("pick")}</option>
      {devices.map((d, i) => (
        <option key={d.deviceId} value={d.deviceId}>
          {labelOf(d, i)}
        </option>
      ))}
    </select>
  );
  const status =
    phase.at === "live"
      ? t("liveAt", { size: `${phase.size.width}×${phase.size.height}` })
      : phase.at === "finding"
        ? t("finding")
        : phase.at === "failed"
          ? t("notStarted")
          : t("starting");

  return (
    <Card title={t("title")}>
      <p className="muted small">{t("hint")}</p>
      {phase.at === "finding" && <p className="small">{t("findingHint")}</p>}
      {phase.at === "failed" && (
        <div className="error small" role="alert">
          <p>
            {t(
              phase.which === "top"
                ? "topFailed"
                : phase.which === "bottom"
                  ? "bottomFailed"
                  : "bothFailed",
              { reason: phase.reason },
            )}
          </p>
          <p>{t("bandwidth")}</p>
          <button type="button" onClick={() => setAttempt(attempt + 1)}>
            {t("retry")}
          </button>
        </div>
      )}
      <div className="grid-2">
        <Field label={t("top")}>
          {select(topId, (v) => setPair([v, bottomId]))}
          <video ref={topVideo} className="dual-preview" muted playsInline />
          <span className="muted small">{status}</span>
        </Field>
        <Field label={t("bottom")}>
          {select(bottomId, (v) => setPair([topId, v]))}
          <video ref={bottomVideo} className="dual-preview" muted playsInline />
          <span className="muted small">{status}</span>
        </Field>
      </div>
      {devices.length >= 2 && (
        <div className="row wrap">
          <button type="button" onClick={() => setPair([bottomId, topId])}>
            {t("swap")}
          </button>
          <button
            type="button"
            disabled={phase.at === "finding" || phase.at === "starting"}
            onClick={() => setFinding(true)}
          >
            {t("findCameras")}
          </button>
        </div>
      )}
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
          disabled={busy || phase.at !== "live"}
          onClick={() => void capture()}
        >
          {busy ? t("sending") : t("capture")}
        </button>
      </div>
    </Card>
  );
}
