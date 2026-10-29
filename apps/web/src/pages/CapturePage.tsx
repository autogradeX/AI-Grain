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

interface Photo {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

function loadPhoto(blob: Blob): Promise<Photo> {
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
    img.onerror = () =>
      reject(new Error("That file is not an image the browser can open"));
    img.src = url;
  });
}

export function CapturePage() {
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
      const p = await loadPhoto(blob);
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
          ← Back to sample
        </Link>
        <h1>Add a board photo</h1>
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
            <li>
              Spread about 100–150 kernels on the board in one layer, not
              touching.
            </li>
            <li>Fix the phone flat on the stand, 20–25 cm above the board.</li>
            <li>
              Light evenly from two sides at 45°, or with a ring light. No
              shadows, no direct sun.
            </li>
            <li>Make sure every grid cell, A1 to T28, is in the picture.</li>
          </ol>
          <div className="stack-sm">
            <button
              className="primary"
              onClick={() => cameraInput.current?.click()}
            >
              Take photo
            </button>
            <button onClick={() => setMode("live")}>
              Live camera with alignment guide
            </button>
            <button onClick={() => galleryInput.current?.click()}>
              Choose an existing photo
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
        <Card title="Mark the grid corners">
          <p className="muted small">
            Drag each handle onto the outer corner of the grid: A1 top left, T1
            top right, T28 bottom right, A28 bottom left. The blue lines should
            sit on the printed grid.
          </p>
          <CornerEditor
            src={photo.url}
            width={photo.width}
            height={photo.height}
            corners={corners}
            onChange={setCorners}
          />
          <Field label="Which side of the kernels is up?">
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as "front" | "crease")}
            >
              <option value="front">Top side (first photo)</option>
              <option value="crease">Crease side (kernels flipped)</option>
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
              Retake
            </button>
            <button
              className="primary"
              disabled={upload.isPending}
              onClick={() => upload.mutate()}
            >
              {upload.isPending ? "Uploading…" : "Find kernels"}
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
