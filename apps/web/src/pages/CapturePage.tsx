import { useMutation } from "@tanstack/react-query";
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
import { m } from "./CapturePage.i18n";

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
  const [mode, setMode] = useState<"choose" | "live">("choose");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [corners, setCorners] = useState<Corners | null>(null);
  const [side, setSide] = useState<"front" | "crease">("front");
  const [loadError, setLoadError] = useState<unknown>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );

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
    mutationFn: () => {
      const form = new FormData();
      form.set("side", side);
      form.set("corners", JSON.stringify(corners));
      form.set("imageWidth", String(photo!.width));
      form.set("imageHeight", String(photo!.height));
      form.set("photo", photo!.blob, "board.jpg");
      return api.upload<{ id: string }>(`/samples/${id}/batches`, form);
    },
    onSuccess: (batch) =>
      navigate(`/app/batches/${batch.id}`, { replace: true }),
  });

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

      {mode === "choose" && !photo && (
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
            hidden
            onChange={(e) =>
              e.target.files?.[0] && void accept(e.target.files[0])
            }
          />
          <ErrorNote error={loadError} />
        </Card>
      )}

      {mode === "choose" && photo && corners && (
        <Card title={t("markCorners")}>
          <p className="muted small">{t("markCornersHint")}</p>
          <CornerEditor
            src={photo.url}
            width={photo.width}
            height={photo.height}
            corners={corners}
            onChange={setCorners}
          />
          <Field label={t("whichSide")}>
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as "front" | "crease")}
            >
              <option value="front">{t("sideFront")}</option>
              <option value="crease">{t("sideCrease")}</option>
            </select>
          </Field>
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
    </div>
  );
}
