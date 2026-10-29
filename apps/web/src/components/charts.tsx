import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import { m } from "./charts.i18n";

/*
 * Small hand-built SVG charts. One series each, in the first categorical slot
 * (validated against this app's light and dark surfaces). Thin marks, solid
 * hairline grid, a hover/focus tooltip on every mark, and a table view, so a
 * value is never only reachable by hovering.
 */

const AXIS_W = 40;
/** Line charts label their axis in percent, which needs more room. */
const LINE_AXIS_W = 52;
const X_BAND = 22;

function useWidth<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  number,
] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setWidth(entry?.contentRect.width ?? 0),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** A clean axis maximum (1, 2, 2.5, 5 × 10^n) at or above `max`, with its ticks. */
export function niceTicks(max: number, count = 4, integer = false): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  let step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  // Counts get whole-number ticks: no "0.5 samples".
  if (integer) step = Math.max(1, Math.round(step));
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step)
    ticks.push(Number(v.toFixed(6)));
  return ticks;
}

function compact(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

interface Tip {
  x: number;
  y: number;
  value: string;
  label: string;
}

/** Keeps the tooltip inside the chart: centred on the mark unless that would cross an edge. */
function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null;
  const half = 80;
  const left =
    width > 2 * half ? Math.min(Math.max(tip.x, half), width - half) : tip.x;
  return (
    <div
      className="chart-tip"
      // Above the point by default; below it when there's no room above.
      style={{
        left,
        top: tip.y,
        ...(tip.y < 56 && { transform: "translate(-50%, 12px)" }),
      }}
      role="status"
    >
      <strong>{tip.value}</strong>
      <span>{tip.label}</span>
    </div>
  );
}

function TableView({
  head,
  rows,
}: {
  head: [string, string];
  rows: [string, string][];
}) {
  const t = useT(m);
  return (
    <details className="chart-table small">
      <summary>{t("showTable")}</summary>
      <table className="table">
        <thead>
          <tr>
            <th>{head[0]}</th>
            <th className="num">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b], i) => (
            <tr key={i}>
              <td>{a}</td>
              <td className="num">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export interface Datum {
  label: string;
  value: number;
  /** Tooltip label; defaults to `label`. */
  detail?: string;
}

/** Vertical columns from one baseline: counts over time. */
export function ColumnChart({
  data,
  height = 160,
  format = compact,
  unitLabel,
}: {
  data: Datum[];
  height?: number;
  format?: (v: number) => string;
  unitLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const ticks = niceTicks(
    Math.max(0, ...data.map((d) => d.value)),
    4,
    data.every((d) => Number.isInteger(d.value)),
  );
  const top = ticks.at(-1)!;
  const plotW = Math.max(0, width - AXIS_W);
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.max(1, Math.min(24, band - 2));
  const y = (v: number) => height - (v / top) * height;
  const labelEvery = Math.max(
    1,
    Math.ceil(data.length / Math.max(1, Math.floor(plotW / 56))),
  );

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height + X_BAND + 8}
          role="img"
          aria-label={unitLabel}
        >
          <g transform={`translate(${AXIS_W},4)`}>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={0}
                  x2={plotW}
                  y1={y(t)}
                  y2={y(t)}
                  className="chart-grid"
                />
                <text
                  x={-6}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="chart-axis"
                >
                  {compact(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = i * band + (band - barW) / 2;
              const h = height - y(d.value);
              const r = Math.min(4, barW / 2, h);
              const show = (e: { currentTarget: Element }) => {
                const box = e.currentTarget.getBoundingClientRect();
                const host = ref.current!.getBoundingClientRect();
                setTip({
                  x: box.left - host.left + box.width / 2,
                  y: Math.max(0, y(d.value) - 8),
                  value: format(d.value),
                  label: d.detail ?? d.label,
                });
              };
              return (
                <g key={d.label}>
                  {/* The hit area is the whole band, taller than the bar. */}
                  <rect
                    x={i * band}
                    y={0}
                    width={band}
                    height={height}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${d.detail ?? d.label}: ${format(d.value)}`}
                    onPointerMove={show}
                    onFocus={show}
                    onPointerLeave={() => setTip(null)}
                    onBlur={() => setTip(null)}
                  />
                  {h > 0 && (
                    <path
                      className="chart-bar"
                      d={`M${x},${height} V${height - h + r} Q${x},${height - h} ${x + r},${height - h} H${x + barW - r} Q${x + barW},${height - h} ${x + barW},${height - h + r} V${height} Z`}
                      pointerEvents="none"
                    />
                  )}
                  {i % labelEvery === 0 && (
                    <text
                      x={i * band + band / 2}
                      y={height + 16}
                      textAnchor="middle"
                      className="chart-axis"
                    >
                      {d.label}
                    </text>
                  )}
                </g>
              );
            })}
            <line
              x1={0}
              x2={plotW}
              y1={height}
              y2={height}
              className="chart-baseline"
            />
          </g>
        </svg>
      )}
      <Tooltip tip={tip} width={width} />
      <TableView
        head={["", unitLabel]}
        rows={data.map((d) => [d.detail ?? d.label, format(d.value)])}
      />
    </div>
  );
}

/** A single-series line with a crosshair that snaps to the nearest point. */
export function LineChart({
  data,
  height = 110,
  format,
  title,
  maxHint,
}: {
  data: Datum[];
  height?: number;
  format: (v: number) => string;
  title: ReactNode;
  /** Minimum axis maximum, so near-zero series don't look dramatic. */
  maxHint?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const t = useT(m);
  const ticks = niceTicks(
    Math.max(maxHint ?? 0, ...data.map((d) => d.value)),
    3,
  );
  const top = ticks.at(-1)!;
  const plotW = Math.max(0, width - LINE_AXIS_W - 8);
  const x = (i: number) =>
    data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW;
  const y = (v: number) => height - (v / top) * height;
  const path = data
    .map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`)
    .join("");
  const last = data.at(-1);
  const h = hover !== null ? data[hover] : null;

  const pick = (clientX: number) => {
    if (!ref.current || !data.length) return;
    const left = ref.current.getBoundingClientRect().left + LINE_AXIS_W;
    const i =
      data.length <= 1
        ? 0
        : Math.round(((clientX - left) / plotW) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  return (
    <div className="chart" ref={ref}>
      <div className="chart-title small">{title}</div>
      {width > 0 && (
        <svg
          width={width}
          height={height + X_BAND + 8}
          tabIndex={0}
          role="img"
          aria-label={typeof title === "string" ? title : undefined}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerLeave={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight")
              setHover((v) => Math.min(data.length - 1, (v ?? -1) + 1));
            if (e.key === "ArrowLeft")
              setHover((v) => Math.max(0, (v ?? data.length) - 1));
          }}
          onBlur={() => setHover(null)}
        >
          <g transform={`translate(${LINE_AXIS_W},4)`}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={0}
                  x2={plotW}
                  y1={y(tick)}
                  y2={y(tick)}
                  className="chart-grid"
                />
                <text
                  x={-6}
                  y={y(tick)}
                  dy="0.32em"
                  textAnchor="end"
                  className="chart-axis"
                >
                  {format(tick)}
                </text>
              </g>
            ))}
            <path d={path} className="chart-line" />
            {data.length === 1 && (
              <circle
                cx={x(0)}
                cy={y(data[0]!.value)}
                r={4}
                className="chart-dot"
              />
            )}
            {last && data.length > 1 && (
              <circle
                cx={x(data.length - 1)}
                cy={y(last.value)}
                r={4}
                className="chart-dot"
              />
            )}
            {data.length > 0 && (
              <>
                <text x={0} y={height + 16} className="chart-axis">
                  {data[0]!.label}
                </text>
                {data.length > 1 && (
                  <text
                    x={plotW}
                    y={height + 16}
                    textAnchor="end"
                    className="chart-axis"
                  >
                    {last!.label}
                  </text>
                )}
              </>
            )}
            {h && hover !== null && (
              <>
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={0}
                  y2={height}
                  className="chart-crosshair"
                />
                <circle
                  cx={x(hover)}
                  cy={y(h.value)}
                  r={4}
                  className="chart-dot"
                />
              </>
            )}
          </g>
        </svg>
      )}
      <Tooltip
        width={width}
        tip={
          h && hover !== null
            ? {
                x: LINE_AXIS_W + x(hover),
                y: Math.max(0, y(h.value) + 16),
                value: format(h.value),
                label: h.detail ?? h.label,
              }
            : null
        }
      />
      <TableView
        head={[t("week"), t("value")]}
        rows={data.map((d) => [d.detail ?? d.label, format(d.value)])}
      />
    </div>
  );
}

/** Horizontal bars with the value at the tip: counts per category. */
export function BarList({
  data,
  format = compact,
}: {
  data: Datum[];
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="barlist">
      {data.map((d) => (
        <li key={d.label} title={`${d.detail ?? d.label}: ${format(d.value)}`}>
          <span className="barlist-label">{d.label}</span>
          <span className="barlist-track">
            <span
              className="barlist-bar"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
            <span className="barlist-value">{format(d.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A 0–1 ratio as a slim bar on a lighter track of the same hue, with the number beside it. */
export function Meter({ value, label }: { value: number; label: string }) {
  return (
    <span className="meter" aria-label={label}>
      <span className="meter-track">
        <span
          className="meter-fill"
          style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        />
      </span>
      <span className="meter-value">{Math.round(value * 100)} %</span>
    </span>
  );
}
