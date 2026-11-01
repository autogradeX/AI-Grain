import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import {
  CornerEditor,
  insetCorners,
  type Corners,
} from "../components/CornerEditor";
import { LiveCamera } from "../components/LiveCamera";
import { Card, ErrorNote, Field } from "../components/ui";
import { useT } from "../i18n";
import { useSample } from "./SamplePage";
import { m } from "./CapturePage.i18n";
import { enqueue, newRef } from "../offline/queue";
import { isNetworkError } from "../offline/sync";

type Side = "auto" | "front" | "crease";

interface Photo {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

function loadPhoto(blob: Blob, notAnImage: string): Promise<Photo> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        blob,
        url,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    img.onerror = () => reject(new Error(notAnImage));
    img.src = url;
  });
}

export function CapturePage() {
  const t = useT(m);
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"choose" | "live">("choose");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [corners, setCorners] = useState<Corners | null>(null);
  const [side, setSide] = useState<Side>("auto");
  // Several photos chosen at once: each becomes its own batch.
  const [many, setMany] = useState<Photo[]>([]);
  const [progress, setProgress] = useState(0);
  // Corners: found by the server unless the operator marks them.
  const [manualCorners, setManualCorners] = useState(false);
  const [lastPhoto, setLastPhoto] = useState(false);
  const sample = useSample(id);
  // Offline the sample can't load: Autopilot is on by default, so offer finishing.
  const autopilot = sample.data?.autopilot.enabled ?? sample.isError;
  const [loadError, setLoadError] = useState<unknown>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );
  useEffect(
    () => () => {
      for (const p of many) URL.revokeObjectURL(p.url);
    },
    [many],
  );

  const chooseMany = async (files: FileList) => {
    try {
      setLoadError(null);
      const list = await Promise.all(
        [...files].map((f) => loadPhoto(f, t("notAnImage"))),
      );
      if (list.length === 1) {
        setPhoto(list[0]!);
        setCorners(insetCorners(list[0]!.width, list[0]!.height));
      } else setMany(list);
    } catch (err) {
      setLoadError(err);
    }
  };

  // Photos that couldn't be sent: kept on the device and uploaded later
  // (the grid corners are then found by the server).
  const [queued, setQueued] = useState(0);
  const queuePhotos = async (list: { blob: Blob; finish: boolean }[]) => {
    for (const p of list) {
      await enqueue({
        kind: "photo",
        ref: newRef(),
        createdAt: new Date().toISOString(),
        sampleId: id,
        photo: p.blob,
        side,
        finish: p.finish,
      });
    }
    setQueued(list.length);
  };

  const uploadMany = useMutation({
    mutationFn: async () => {
      // One at a time, in the order chosen; corners and side found by the server.
      for (const [i, p] of many.entries()) {
        const finish = autopilot && lastPhoto && i === many.length - 1;
        if (!navigator.onLine) {
          await queuePhotos(
            many.slice(i).map((q, j) => ({
              blob: q.blob,
              finish: autopilot && lastPhoto && i + j === many.length - 1,
            })),
          );
          return "queued";
        }
        setProgress(i + 1);
        const form = new FormData();
        form.set("side", side);
        if (finish) form.set("finish", "true");
        form.set("photo", p.blob, `board-${i + 1}.jpg`);
        try {
          await api.upload<{ id: string }>(`/samples/${id}/batches`, form);
        } catch (err) {
          if (!isNetworkError(err)) throw err;
          await queuePhotos(
            many.slice(i).map((q, j) => ({
              blob: q.blob,
              finish: autopilot && lastPhoto && i + j === many.length - 1,
            })),
          );
          return "queued";
        }
      }
      return "sent";
    },
    onSuccess: async (result) => {
      if (result === "queued") return;
      await qc.invalidateQueries({ queryKey: ["sample", id] });
      void qc.invalidateQueries({ queryKey: ["samples"] });
      void navigate(`/app/samples/${id}`, { replace: true });
    },
    // Photos already sent stay in the sample: show it, with the error.
    onError: () => void qc.invalidateQueries({ queryKey: ["sample", id] }),
    // Runs offline too: the photos are saved on the device.
    networkMode: "always",
  });

  const accept = async (blob: Blob, preset?: Corners) => {
    try {
      setLoadError(null);
      const p = await loadPhoto(blob, t("notAnImage"));
      setPhoto(p);
      setCorners(preset ?? insetCorners(p.width, p.height));
      setMode("choose");
    } catch (err) {
      setLoadError(err);
    }
  };

  const upload = useMutation({
    mutationFn: async () => {
      const finish = autopilot && lastPhoto;
      if (!navigator.onLine) {
        await queuePhotos([{ blob: photo!.blob, finish }]);
        return null;
      }
      const form = new FormData();
      form.set("side", side);
      if (manualCorners) {
        form.set("corners", JSON.stringify(corners));
        form.set("imageWidth", String(photo!.width));
        form.set("imageHeight", String(photo!.height));
      }
      if (autopilot && lastPhoto) form.set("finish", "true");
      form.set("photo", photo!.blob, "board.jpg");
      try {
        return await api.upload<{ id: string }>(`/samples/${id}/batches`, form);
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        await queuePhotos([{ blob: photo!.blob, finish }]);
        return null;
      }
    },
    // With Autopilot the sample page shows the progress; otherwise the photo.
    onSuccess: async (batch) => {
      if (!batch) return;
      await qc.invalidateQueries({ queryKey: ["sample", id] });
      void qc.invalidateQueries({ queryKey: ["samples"] });
      void navigate(
        autopilot ? `/app/samples/${id}` : `/app/batches/${batch.id}`,
        {
          replace: true,
        },
      );
    },
    networkMode: "always",
  });

  if (queued > 0) {
    return (
      <div className="stack">
        <h1>{t("title")}</h1>
        <Card title={t.n("savedOnDevice", queued)}>
          <p>{t("savedOnDeviceHint")}</p>
          <div className="row wrap">
            <button
              className="primary"
              onClick={() => {
                setQueued(0);
                setPhoto(null);
                setCorners(null);
                setMany([]);
              }}
            >
              {t("anotherPhoto")}
            </button>
            <Link to="/app" className="button">
              {t("toSamples")}
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="stack">
      <div>
        <Link to={`/app/samples/${id}`} className="muted small">
          {t("backToSample")}
        </Link>
        <h1>{t("title")}</h1>
      </div>

      {mode === "live" && (
        <LiveCamera
          onCancel={() => setMode("choose")}
          onCapture={(b, _w, _h, c) => void accept(b, c)}
        />
      )}

      {mode === "choose" && !photo && many.length === 0 && (
        <Card>
          <ol className="small steps">
            <li>{t("stepSpread")}</li>
            <li>{t("stepStand")}</li>
            <li>{t("stepLight")}</li>
            <li>{t("stepCells")}</li>
          </ol>
          <div className="stack-sm">
            <button
              className="primary"
              onClick={() => cameraInput.current?.click()}
            >
              {t("takePhoto")}
            </button>
            <button onClick={() => setMode("live")}>{t("liveCamera")}</button>
            <button onClick={() => galleryInput.current?.click()}>
              {t("choosePhoto")}
            </button>
          </div>
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) =>
              e.target.files?.[0] && void accept(e.target.files[0])
            }
          />
          <input
            ref={galleryInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) =>
              e.target.files?.length && void chooseMany(e.target.files)
            }
          />
          <p className="muted small">{t("manyHint")}</p>
          <ErrorNote error={loadError} />
        </Card>
      )}

      {mode === "choose" && photo && corners && (
        <Card title={manualCorners ? t("markCorners") : t("checkPhoto")}>
          {manualCorners ? (
            <>
              <p className="muted small">{t("markCornersHint")}</p>
              <CornerEditor
                src={photo.url}
                width={photo.width}
                height={photo.height}
                corners={corners}
                onChange={setCorners}
              />
            </>
          ) : (
            <>
              <img
                src={photo.url}
                alt={t("photoPreview")}
                className="capture-preview"
              />
              <p className="muted small">{t("autoCornersHint")}</p>
            </>
          )}
          <label className="row small">
            <input
              type="checkbox"
              checked={manualCorners}
              onChange={(e) => setManualCorners(e.target.checked)}
            />
            {t("markMyself")}
          </label>
          <Field label={t("whichSide")}>
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as Side)}
            >
              <option value="auto">{t("sideAuto")}</option>
              <option value="front">{t("sideFront")}</option>
              <option value="crease">{t("sideCrease")}</option>
            </select>
          </Field>
          {autopilot && (
            <label className="row small">
              <input
                type="checkbox"
                checked={lastPhoto}
                onChange={(e) => setLastPhoto(e.target.checked)}
              />
              {t("lastPhoto")}
            </label>
          )}
          <ErrorNote error={upload.error} />
          <div className="row">
            <button
              onClick={() => {
                setPhoto(null);
                setCorners(null);
              }}
            >
              {t("retake")}
            </button>
            <button
              className="primary"
              disabled={upload.isPending}
              onClick={() => upload.mutate()}
            >
              {upload.isPending ? t("uploading") : t("findKernels")}
            </button>
          </div>
        </Card>
      )}

      {mode === "choose" && many.length > 0 && (
        <Card title={t.n("manyTitle", many.length)}>
          <ul className="capture-many">
            {many.map((p, i) => (
              <li key={p.url}>
                <img src={p.url} alt={t("photoN", { n: i + 1 })} />
                <span className="muted small">{t("batchN", { n: i + 1 })}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">{t("manyAutoHint")}</p>
          <Field label={t("whichSide")}>
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as Side)}
            >
              <option value="auto">{t("sideAuto")}</option>
              <option value="front">{t("sideFront")}</option>
              <option value="crease">{t("sideCrease")}</option>
            </select>
          </Field>
          {autopilot && (
            <label className="row small">
              <input
                type="checkbox"
                checked={lastPhoto}
                onChange={(e) => setLastPhoto(e.target.checked)}
              />
              {t("lastPhotos")}
            </label>
          )}
          <ErrorNote error={uploadMany.error} />
          <div className="row">
            <button disabled={uploadMany.isPending} onClick={() => setMany([])}>
              {t("retake")}
            </button>
            <button
              className="primary"
              disabled={uploadMany.isPending}
              onClick={() => uploadMany.mutate()}
            >
              {uploadMany.isPending
                ? t("uploadingN", { n: progress, total: many.length })
                : t.n("findKernelsMany", many.length)}
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
