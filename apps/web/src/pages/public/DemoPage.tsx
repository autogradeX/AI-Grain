import {
  CLASS_GROUPS,
  GROUP_LABELS,
  SOUND,
  UNCLEAR,
  classLabel,
  groupOf,
  type ClassDef,
  type ClassGroup,
} from "@ai-grain/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Badge, ErrorNote, pct, Spinner } from "../../components/ui";
import { CategorySection } from "./HomePage";

interface DemoListItem {
  id: string;
  number: number;
  crop: string;
  cropLabel: string;
  title: string | null;
  kernels: number;
  sampleMassG: number | null;
}

interface DemoKernel {
  id: string;
  number: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cell: string;
  cls: string | null;
  aiClass: string | null;
  aiConfidence: string | null;
  aiReason: string | null;
  reviewed: boolean;
}

interface Demo {
  id: string;
  number: number;
  title: string | null;
  crop: { key: string; label: string; classes: ClassDef[] };
  sampleMassG: number | null;
  board: { width: number; height: number };
  batches: { id: string; side: string; kernels: DemoKernel[] }[];
  estimate: {
    byGroup: Record<ClassGroup, number>;
    purityPct: number;
    counted: number;
    countByClass: Record<string, number>;
  };
  result: {
    source?: string;
    purityPct?: number;
    byGroupPct?: Record<ClassGroup, number>;
    grade: { grade: string | null };
  } | null;
  certificate: string | null;
}

/*
 * Ring colours on the photo: sound, defect, unclear. Only three, because
 * scattered marks can't keep more colours apart (validated all-pairs on the
 * dark board). The group of each defect is in the legend counts, the kernel
 * detail and the results table; sound rings are also thinner.
 */
const RING = { sound: "#199e70", defect: "#d95926", unclear: "#3987e5" };

function colorOf(cls: string | null): string {
  if (!cls || cls === UNCLEAR) return RING.unclear;
  return cls === SOUND ? RING.sound : RING.defect;
}

type Step = "select" | "capture" | "analyze";

const SETUP: [string, string][] = [
  [
    "Grid board",
    "A matte dark board with a printed 1 cm grid. Its corners let the app straighten the photo and measure each kernel.",
  ],
  [
    "Phone on a stand",
    "Photographs the board from 20–25 cm with even light. Kernels are found by classic image processing, not AI.",
  ],
  [
    "Claude",
    "Classifies a close-up of each kernel against the crop's class definitions and reference images, with a confidence and a reason.",
  ],
  [
    "Operator and scale",
    "The operator checks every flagged kernel, sorts the defects into cups and weighs them on a 0.01 g scale.",
  ],
];

const DEMO_FAQ: [string, string][] = [
  [
    "What is AI grain impurity analysis?",
    "Finding and classifying the objects in a grain sample that are not sound kernels: broken and damaged kernels, other cereals, weed seeds, debris and harmful material such as ergot. Here, Claude does the first pass on a photo and a person confirms it.",
  ],
  [
    "Is the demo a real sample?",
    "Yes. It is a sample analysed in the app and published by our team, with the kernel images, Claude's verdicts and the operator's decisions as they were recorded.",
  ],
  [
    "Why do the result and the photo estimate differ?",
    "The estimate weighs each kernel by its area in the photo. The verified result comes from weighing the sorted cups on a scale. Where both exist, the scale wins.",
  ],
  [
    "Does it replace EN 15587 or manual grading?",
    "No. It follows the same categories, but it is a screening and pre-check tool, not an official grading method unless validated and approved for that use.",
  ],
  [
    "How reliable is it?",
    "Measure it on your own grain: grade 30–50 samples both ways and compare them class by class on the Validation page. Subtle defects agree least, which is why a person checks every flagged kernel.",
  ],
];

/** Public interactive demo: a real, reviewed sample the site owner published. */
export function DemoPage() {
  const list = useQuery({
    queryKey: ["demos"],
    queryFn: () => api.get<DemoListItem[]>("/public/demos"),
  });
  const [picked, setSelected] = useState<string | null>(null);
  // The first demo is open until the visitor picks another.
  const selected = picked ?? list.data?.[0]?.id ?? null;
  const [step, setStep] = useState<Step>("select");
  const [batchIdx, setBatchIdx] = useState(0);
  const [kernelId, setKernelId] = useState<string | null>(null);
  const demo = useQuery({
    queryKey: ["demo", selected],
    queryFn: () => api.get<Demo>(`/public/demos/${selected}`),
    enabled: !!selected,
  });

  const d = demo.data;
  const batch = d?.batches[batchIdx];
  const kernel = batch?.kernels.find((k) => k.id === kernelId) ?? null;
  const classes = d?.crop.classes ?? [];

  return (
    <div className="site-page">
      <section className="hero compact">
        <span className="eyebrow">Interactive demo</span>
        <h1>AI grain impurity analysis</h1>
        <p className="hero-lead">
          A real sample, photographed, classified by Claude and checked by an
          operator. Open it and explore every kernel the system found.
        </p>
      </section>

      {list.isPending && <Spinner />}
      <ErrorNote error={list.error} />
      {list.data?.length === 0 && (
        <section className="site-section narrow">
          <div className="card">
            <p>No demo sample has been published yet.</p>
            <Link to="/contact" className="button primary">
              Ask for a live walkthrough
            </Link>
          </div>
        </section>
      )}

      {list.data && list.data.length > 0 && (
        <section className="site-section">
          <div className="demo">
            <div className="demo-side">
              <ol className="demo-steps" aria-label="Steps">
                {(["select", "capture", "analyze"] as const).map((s, i) => (
                  <li key={s} className={step === s ? "active" : ""}>
                    <span>{i + 1}</span>{" "}
                    {s === "select"
                      ? "Select"
                      : s === "capture"
                        ? "Capture"
                        : "Analyze"}
                  </li>
                ))}
              </ol>
              <div
                className="demo-samples"
                role="radiogroup"
                aria-label="Sample"
              >
                {list.data.map((s) => (
                  <button
                    key={s.id}
                    role="radio"
                    aria-checked={selected === s.id}
                    className={`demo-sample ${selected === s.id ? "selected" : ""}`}
                    onClick={() => {
                      setSelected(s.id);
                      setStep("select");
                      setBatchIdx(0);
                      setKernelId(null);
                    }}
                  >
                    <strong>{s.cropLabel}</strong>
                    <span className="small">
                      {s.title ?? `Sample #${s.number}`}
                    </span>
                    <span className="small muted">
                      {s.kernels} kernels
                      {s.sampleMassG ? ` · ${s.sampleMassG} g` : ""}
                    </span>
                  </button>
                ))}
              </div>
              {step === "select" && (
                <button
                  className="primary"
                  disabled={!d}
                  onClick={() => setStep("capture")}
                >
                  Capture image
                </button>
              )}
              {step === "capture" && (
                <button className="primary" onClick={() => setStep("analyze")}>
                  Analyze
                </button>
              )}
              {step === "analyze" && d && (
                <Legend classes={classes} counts={d.estimate.countByClass} />
              )}
            </div>

            <div className="demo-stage">
              {!d && <Spinner label="Loading sample…" />}
              {d && step === "select" && (
                <div className="demo-placeholder">
                  <strong>Imaging station ready</strong>
                  <span className="muted small">
                    {d.crop.label} sample loaded on the board. Press{" "}
                    <em>Capture image</em>.
                  </span>
                </div>
              )}
              {d && batch && step !== "select" && (
                <div
                  className="board"
                  // Fit the whole board on screen: its height is its width times the board's aspect ratio.
                  style={{
                    maxWidth: `calc(80vh * ${d.board.width} / ${d.board.height})`,
                  }}
                >
                  <img
                    src={`/api/public/demos/${d.id}/batches/${batch.id}/image`}
                    alt={`${d.crop.label} sample on the grid board`}
                  />
                  {step === "analyze" && (
                    <svg
                      viewBox={`0 0 ${d.board.width} ${d.board.height}`}
                      preserveAspectRatio="none"
                      className="demo-overlay"
                    >
                      {batch.kernels.map((k, i) => (
                        <circle
                          key={k.id}
                          cx={k.x + k.w / 2}
                          cy={k.y + k.h / 2}
                          r={Math.max(k.w, k.h) / 2 + 12}
                          fill="transparent"
                          stroke={colorOf(k.cls)}
                          strokeWidth={
                            kernelId === k.id ? 14 : k.cls === SOUND ? 5 : 9
                          }
                          style={{
                            animationDelay: `${Math.min(i * 12, 1500)}ms`,
                          }}
                          className="demo-mark"
                          tabIndex={0}
                          role="button"
                          aria-label={`Kernel ${k.number}, ${classLabel(classes, k.cls)}`}
                          onClick={() => setKernelId(k.id)}
                          onKeyDown={(e) =>
                            e.key === "Enter" && setKernelId(k.id)
                          }
                        />
                      ))}
                    </svg>
                  )}
                </div>
              )}
              {d && d.batches.length > 1 && step !== "select" && (
                <div className="row wrap small demo-batches">
                  {d.batches.map((b, i) => (
                    <button
                      key={b.id}
                      className={
                        i === batchIdx ? "chip selected chip-good" : "chip"
                      }
                      onClick={() => setBatchIdx(i)}
                    >
                      Photo {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {d && step === "analyze" && (
            <div className="demo-results">
              <KernelDetail demoId={d.id} kernel={kernel} classes={classes} />
              <Results d={d} />
            </div>
          )}
        </section>
      )}

      <CategorySection />

      <section className="site-section">
        <h2>What produces the result</h2>
        <p className="muted">
          No dedicated machine: the demo sample was imaged with this setup.
        </p>
        <ol className="steps-grid">
          {SETUP.map(([title, text], i) => (
            <li key={title} className="card">
              <span className="step-number">{i + 1}</span>
              <strong>{title}</strong>
              <p className="muted small">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="site-section narrow">
        <h2>Grain impurity analysis, answered</h2>
        <div className="faq">
          {DEMO_FAQ.map(([q, a]) => (
            <details key={q} className="card">
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="site-band">
        <h2>Want to see it on your grain?</h2>
        <p>Book a short walkthrough with our grain analysis team.</p>
        <Link to="/contact" className="button">
          Book a live walkthrough
        </Link>
      </section>
    </div>
  );
}

function Legend({
  classes,
  counts,
}: {
  classes: readonly ClassDef[];
  counts: Record<string, number>;
}) {
  const groupCount = (g: ClassGroup) =>
    classes
      .filter((c) => c.group === g)
      .reduce((n, c) => n + (counts[c.id] ?? 0), 0);
  const defects = CLASS_GROUPS.reduce((n, g) => n + groupCount(g), 0);
  return (
    <ul className="demo-legend small">
      <li>
        <i style={{ borderColor: RING.sound }} /> Sound{" "}
        <span className="muted">{counts.sound ?? 0}</span>
      </li>
      <li>
        <i style={{ borderColor: RING.defect }} /> Defect or impurity{" "}
        <span className="muted">{defects}</span>
        <ul>
          {CLASS_GROUPS.map((g) => (
            <li key={g}>
              {GROUP_LABELS[g]} <span className="muted">{groupCount(g)}</span>
            </li>
          ))}
        </ul>
      </li>
      <li>
        <i style={{ borderColor: RING.unclear }} /> Unclear{" "}
        <span className="muted">{counts.unclear ?? 0}</span>
      </li>
    </ul>
  );
}

function KernelDetail({
  demoId,
  kernel,
  classes,
}: {
  demoId: string;
  kernel: DemoKernel | null;
  classes: readonly ClassDef[];
}) {
  if (!kernel) {
    return (
      <div className="card">
        <p className="muted">
          Tap any kernel on the photo to see what Claude saw and what the
          operator decided.
        </p>
      </div>
    );
  }
  return (
    <div className="card kernel-detail">
      <img
        className="crop"
        src={`/api/public/demos/${demoId}/kernels/${kernel.id}/crop`}
        alt={`Kernel ${kernel.number}`}
      />
      <div className="stack-sm">
        <strong>
          Kernel #{kernel.number} · cell {kernel.cell}
        </strong>
        <div>
          <Badge
            tone={
              kernel.cls === SOUND
                ? "good"
                : kernel.cls === UNCLEAR
                  ? "warn"
                  : "bad"
            }
          >
            {classLabel(classes, kernel.cls)}
          </Badge>{" "}
          {kernel.cls !== SOUND && groupOf(classes, kernel.cls ?? "") && (
            <span className="muted small">
              {GROUP_LABELS[groupOf(classes, kernel.cls ?? "")!]}
            </span>
          )}
        </div>
        <div className="small">
          Claude: {classLabel(classes, kernel.aiClass)}
          {kernel.aiConfidence && ` (${kernel.aiConfidence} confidence)`}
        </div>
        {kernel.aiReason && (
          <div className="small muted">“{kernel.aiReason}”</div>
        )}
        <div className="small">
          {kernel.reviewed
            ? "Checked by the operator"
            : "Not flagged for checking"}
        </div>
      </div>
    </div>
  );
}

function Results({ d }: { d: Demo }) {
  const weighed = d.result && d.result.source !== "estimate" ? d.result : null;
  return (
    <div className="card">
      <strong>
        {d.crop.label} sample #{d.number}
        {d.result?.grade.grade && ` · grade ${d.result.grade.grade}`}
      </strong>
      <table className="table">
        <thead>
          <tr>
            <th>Category</th>
            <th className="num">Photo estimate</th>
            {weighed && <th className="num">Weighed</th>}
          </tr>
        </thead>
        <tbody>
          <tr className="total">
            <td>Purity (sound grain)</td>
            <td className="num">{pct(d.estimate.purityPct)}</td>
            {weighed && <td className="num">{pct(weighed.purityPct)}</td>}
          </tr>
          {CLASS_GROUPS.map((g) => (
            <tr key={g}>
              <td>{GROUP_LABELS[g]}</td>
              <td className="num">{pct(d.estimate.byGroup[g])}</td>
              {weighed && (
                <td className="num">{pct(weighed.byGroupPct?.[g])}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {d.certificate && (
        <p className="small">
          <Link to={`/verify/${d.certificate}`}>
            See this sample&apos;s verified report ({d.certificate})
          </Link>
        </p>
      )}
      <p className="muted small">
        The estimate comes from kernel areas in the photos; the weighed column
        from the operator&apos;s scale.
      </p>
    </div>
  );
}
