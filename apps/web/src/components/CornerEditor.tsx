import { applyHomography, homography, type Pt } from "@ai-grain/core";
import { useRef, useState } from "react";

export type Corners = [Pt, Pt, Pt, Pt];

const COLS = 20;
const ROWS = 28;
const LABELS = ["A1", "T1", "T28", "A28"];

/** Default corners: the image with a small inset. */
export function insetCorners(
  width: number,
  height: number,
  inset = 0.06,
): Corners {
  const dx = width * inset;
  const dy = height * inset;
  return [
    { x: dx, y: dy },
    { x: width - dx, y: dy },
    { x: width - dx, y: height - dy },
    { x: dx, y: height - dy },
  ];
}

/**
 * Lets the operator drag the four grid corners onto the photo. The projected
 * 20 × 28 grid is drawn on top, so a misplaced corner is easy to see.
 */
export function CornerEditor({
  src,
  width,
  height,
  corners,
  onChange,
}: {
  src: string;
  width: number;
  height: number;
  corners: Corners;
  onChange: (corners: Corners) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [loupe, setLoupe] = useState<{ x: number; y: number } | null>(null);
  const r = Math.max(width, height) / 45;

  let grid: string[] = [];
  try {
    const h = homography(
      [
        { x: 0, y: 0 },
        { x: COLS, y: 0 },
        { x: COLS, y: ROWS },
        { x: 0, y: ROWS },
      ],
      corners,
    );
    const line = (a: Pt, b: Pt) => {
      const p = applyHomography(h, a.x, a.y);
      const q = applyHomography(h, b.x, b.y);
      return `M${p.x},${p.y}L${q.x},${q.y}`;
    };
    for (let c = 0; c <= COLS; c++)
      grid.push(line({ x: c, y: 0 }, { x: c, y: ROWS }));
    for (let row = 0; row <= ROWS; row++)
      grid.push(line({ x: 0, y: row }, { x: COLS, y: row }));
  } catch {
    grid = [];
  }

  const toImage = (clientX: number, clientY: number): Pt => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(
        width,
        Math.max(0, ((clientX - rect.left) / rect.width) * width),
      ),
      y: Math.min(
        height,
        Math.max(0, ((clientY - rect.top) / rect.height) * height),
      ),
    };
  };

  return (
    <div className="corner-editor">
      <img src={src} alt="Board photo" draggable={false} />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onPointerMove={(e) => {
          if (dragging === null) return;
          const p = toImage(e.clientX, e.clientY);
          const next = [...corners] as Corners;
          next[dragging] = p;
          onChange(next);
          setLoupe(p);
        }}
        onPointerUp={() => {
          setDragging(null);
          setLoupe(null);
        }}
        onPointerCancel={() => {
          setDragging(null);
          setLoupe(null);
        }}
      >
        <path
          d={grid.join("")}
          stroke="#00e5ff"
          strokeWidth={r / 6}
          fill="none"
          opacity={0.7}
        />
        <polygon
          points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="#00e5ff"
          strokeWidth={r / 3}
        />
        {corners.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              className="corner-handle"
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture(e.pointerId);
                setDragging(i);
                setLoupe(p);
              }}
            />
            <text
              x={p.x}
              y={p.y - r * 1.4}
              fontSize={r}
              textAnchor="middle"
              fill="#fff"
              stroke="#000"
              strokeWidth={r / 10}
            >
              {LABELS[i]}
            </text>
          </g>
        ))}
      </svg>
      {loupe && (
        <div
          className="loupe"
          style={{
            backgroundImage: `url(${src})`,
            backgroundSize: `${(width / 120) * 140}px ${(height / 120) * 140}px`,
            backgroundPosition: `${-((loupe.x / 120) * 140 - 70)}px ${-((loupe.y / 120) * 140 - 70)}px`,
          }}
          aria-hidden
        />
      )}
    </div>
  );
}
