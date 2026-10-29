import {
  CLASS_GROUPS,
  SOUND,
  UNCLEAR,
  groupOf,
  type ClassDef,
  type ClassGroup,
} from "@ai-grain/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Badge, ErrorNote, pct, Spinner } from "../../components/ui";
import { useT } from "../../i18n";
import { useGrainLabels } from "../../i18n/common";
import { m } from "./DemoPage.i18n";
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

const SETUP = [
  ["setup1Title", "setup1Text"],
  ["setup2Title", "setup2Text"],
  ["setup3Title", "setup3Text"],
  ["setup4Title", "setup4Text"],
] as const;

const DEMO_FAQ = [
  ["faq1Q", "faq1A"],
  ["faq2Q", "faq2A"],
  ["faq3Q", "faq3A"],
  ["faq4Q", "faq4A"],
  ["faq5Q", "faq5A"],
] as const;

const STEP_LABELS = {
  select: "stepSelect",
  capture: "stepCapture",
  analyze: "stepAnalyze",
} as const;

const CONFIDENCE: Partial<Record<string, keyof typeof m>> = {
  high: "confidenceHigh",
  medium: "confidenceMedium",
  low: "confidenceLow",
};

/** Public interactive demo: a real, reviewed sample the site owner published. */
export function DemoPage() {
  const t = useT(m);
  const { classLabel, cropLabel } = useGrainLabels();
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
        <span className="eyebrow">{t("eyebrow")}</span>
        <h1>{t("title")}</h1>
        <p className="hero-lead">{t("lead")}</p>
      </section>

      {list.isPending && <Spinner />}
      <ErrorNote error={list.error} />
      {list.data?.length === 0 && (
        <section className="site-section narrow">
          <div className="card">
            <p>{t("noDemo")}</p>
            <Link to="/contact" className="button primary">
              {t("askWalkthrough")}
            </Link>
          </div>
        </section>
      )}

      {list.data && list.data.length > 0 && (
        <section className="site-section">
          <div className="demo">
            <div className="demo-side">
              <ol className="demo-steps" aria-label={t("steps")}>
                {(["select", "capture", "analyze"] as const).map((s, i) => (
                  <li key={s} className={step === s ? "active" : ""}>
                    <span>{i + 1}</span> {t(STEP_LABELS[s])}
                  </li>
                ))}
              </ol>
              <div
                className="demo-samples"
                role="radiogroup"
                aria-label={t("sample")}
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
                    <strong>{cropLabel(s.cropLabel)}</strong>
                    <span className="small">
                      {s.title ?? t("sampleNumber", { number: s.number })}
                    </span>
                    <span className="small muted">
                      {t.n("kernelCount", s.kernels)}
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
                  {t("captureImage")}
                </button>
              )}
              {step === "capture" && (
                <button className="primary" onClick={() => setStep("analyze")}>
                  {t("analyze")}
                </button>
              )}
              {step === "analyze" && d && (
                <Legend classes={classes} counts={d.estimate.countByClass} />
              )}
            </div>

            <div className="demo-stage">
              {!d && <Spinner label={t("loadingSample")} />}
              {d && step === "select" && (
                <div className="demo-placeholder">
                  <strong>{t("stationReady")}</strong>
                  <span className="muted small">
                    {t.rich("sampleLoaded", {
                      crop: cropLabel(d.crop.label),
                      button: <em>{t("captureImage")}</em>,
                    })}
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
                    alt={t("boardAlt", { crop: cropLabel(d.crop.label) })}
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
                          aria-label={t("kernelAria", {
                            number: k.number,
                            cls: classLabel(classes, k.cls),
                          })}
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
                      {t("photo", { number: i + 1 })}
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
        <h2>{t("setupTitle")}</h2>
        <p className="muted">{t("setupLead")}</p>
        <ol className="steps-grid">
          {SETUP.map(([title, text], i) => (
            <li key={title} className="card">
              <span className="step-number">{i + 1}</span>
              <strong>{t(title)}</strong>
              <p className="muted small">{t(text)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="site-section narrow">
        <h2>{t("faqTitle")}</h2>
        <div className="faq">
          {DEMO_FAQ.map(([q, a]) => (
            <details key={q} className="card">
              <summary>{t(q)}</summary>
              <p>{t(a)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="site-band">
        <h2>{t("bandTitle")}</h2>
        <p>{t("bandText")}</p>
        <Link to="/contact" className="button">
          {t("bookWalkthrough")}
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
  const t = useT(m);
  const { groupLabel } = useGrainLabels();
  return (
    <ul className="demo-legend small">
      <li>
        <i style={{ borderColor: RING.sound }} /> {t("sound")}{" "}
        <span className="muted">{counts.sound ?? 0}</span>
      </li>
      <li>
        <i style={{ borderColor: RING.defect }} /> {t("defectOrImpurity")}{" "}
        <span className="muted">{defects}</span>
        <ul>
          {CLASS_GROUPS.map((g) => (
            <li key={g}>
              {groupLabel(g)} <span className="muted">{groupCount(g)}</span>
            </li>
          ))}
        </ul>
      </li>
      <li>
        <i style={{ borderColor: RING.unclear }} /> {t("unclear")}{" "}
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
  const t = useT(m);
  const { classLabel, groupLabel } = useGrainLabels();
  if (!kernel) {
    return (
      <div className="card">
        <p className="muted">{t("tapKernel")}</p>
      </div>
    );
  }
  return (
    <div className="card kernel-detail">
      <img
        className="crop"
        src={`/api/public/demos/${demoId}/kernels/${kernel.id}/crop`}
        alt={t("kernelAlt", { number: kernel.number })}
      />
      <div className="stack-sm">
        <strong>
          {t("kernelTitle", { number: kernel.number, cell: kernel.cell })}
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
              {groupLabel(groupOf(classes, kernel.cls ?? "")!)}
            </span>
          )}
        </div>
        <div className="small">
          {kernel.aiConfidence
            ? t("claudeSaidConfidence", {
                cls: classLabel(classes, kernel.aiClass),
                confidence: CONFIDENCE[kernel.aiConfidence]
                  ? t(CONFIDENCE[kernel.aiConfidence]!)
                  : kernel.aiConfidence,
              })
            : t("claudeSaid", { cls: classLabel(classes, kernel.aiClass) })}
        </div>
        {kernel.aiReason && (
          <div className="small muted">“{kernel.aiReason}”</div>
        )}
        <div className="small">
          {kernel.reviewed ? t("checked") : t("notFlagged")}
        </div>
      </div>
    </div>
  );
}

function Results({ d }: { d: Demo }) {
  const weighed = d.result && d.result.source !== "estimate" ? d.result : null;
  const t = useT(m);
  const { cropLabel, groupLabel } = useGrainLabels();
  return (
    <div className="card">
      <strong>
        {t("resultsTitle", { crop: cropLabel(d.crop.label), number: d.number })}
        {d.result?.grade.grade && t("grade", { grade: d.result.grade.grade })}
      </strong>
      <table className="table">
        <thead>
          <tr>
            <th>{t("category")}</th>
            <th className="num">{t("photoEstimate")}</th>
            {weighed && <th className="num">{t("weighed")}</th>}
          </tr>
        </thead>
        <tbody>
          <tr className="total">
            <td>{t("purity")}</td>
            <td className="num">{pct(d.estimate.purityPct)}</td>
            {weighed && <td className="num">{pct(weighed.purityPct)}</td>}
          </tr>
          {CLASS_GROUPS.map((g) => (
            <tr key={g}>
              <td>{groupLabel(g)}</td>
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
            {t("seeReport", { code: d.certificate })}
          </Link>
        </p>
      )}
      <p className="muted small">{t("resultsNote")}</p>
    </div>
  );
}
