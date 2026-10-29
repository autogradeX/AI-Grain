import { useEffect, useRef, useState } from "react";
import type { Corners } from "./CornerEditor";

/** Share of the video height the alignment guide covers. */
const GUIDE_HEIGHT = 0.86;
const GUIDE_ASPECT = 20 / 28;

/**
 * Live camera with a 20 × 28 alignment guide. Line the board's grid up with
 * the guide and the guide becomes the starting corners.
 */
export function LiveCamera({
  onCapture,
  onCancel,
}: {
  onCapture: (
    photo: Blob,
    width: number,
    height: number,
    corners: Corners,
  ) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [aspect, setAspect] = useState<number | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 4032 },
          height: { ideal: 3024 },
        },
        audio: false,
      })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((err: unknown) =>
        setError(
          err instanceof Error
            ? `Camera unavailable: ${err.message}`
            : "Camera unavailable",
        ),
      );
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(video, 0, 0, w, h);
    const gh = h * GUIDE_HEIGHT;
    const gw = Math.min(w * 0.96, gh * GUIDE_ASPECT);
    const left = (w - gw) / 2;
    const top = (h - gh) / 2;
    const corners: Corners = [
      { x: left, y: top },
      { x: left + gw, y: top },
      { x: left + gw, y: top + gh },
      { x: left, y: top + gh },
    ];
    canvas.toBlob(
      (blob) => blob && onCapture(blob, w, h, corners),
      "image/jpeg",
      0.92,
    );
  };

  return (
    <div className="live-camera">
      {error ? (
        <p className="error">{error}</p>
      ) : (
        // The frame takes the video's aspect ratio, so the guide covers the same pixels it captures.
        <div
          className="live-frame"
          style={aspect ? { aspectRatio: String(aspect) } : undefined}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={(e) =>
              setAspect(
                e.currentTarget.videoWidth / e.currentTarget.videoHeight,
              )
            }
          />
          <div
            className="guide"
            style={{
              height: `${GUIDE_HEIGHT * 100}%`,
              aspectRatio: `${GUIDE_ASPECT}`,
            }}
            aria-hidden
          />
        </div>
      )}
      <p className="muted small">
        Hold the phone flat on its stand, 20–25 cm above the board. Line the
        grid edges up with the guide. Even light, no shadows, no direct sun.
      </p>
      <div className="row">
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={!aspect} onClick={capture}>
          Capture
        </button>
      </div>
    </div>
  );
}
