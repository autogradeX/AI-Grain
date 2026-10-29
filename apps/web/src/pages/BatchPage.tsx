import type { ClassDef } from "@ai-grain/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Batch, Kernel, Sample } from "../api/types";
import { useCan } from "../auth/AuthContext";
import { ClassPicker } from "../components/ClassPicker";
import {
  CornerEditor,
  insetCorners,
  type Corners,
} from "../components/CornerEditor";
import {
  AuthImage,
  Card,
  CLASS_COLORS,
  ClassBadge,
  ErrorNote,
  Spinner,
} from "../components/ui";
import { useT } from "../i18n";
import { common, useGrainLabels } from "../i18n/common";
import { m } from "./BatchPage.i18n";
import { BatchStatusBadge } from "./SamplePage";

const BUSY = new Set(["detecting", "classifying"]);

export function kernelColor(
  k: Pick<Kernel, "isCluster" | "aiClass" | "finalClass">,
): string {
  const cls = k.finalClass ?? k.aiClass;
  if (k.isCluster && !k.finalClass) return CLASS_COLORS.cluster!;
  if (!cls) return CLASS_COLORS.pending!;
  if (cls === "sound") return CLASS_COLORS.sound!;
  if (cls === "unclear") return CLASS_COLORS.unclear!;
  return CLASS_COLORS.defect!;
}

export function BatchPage() {
  const t = useT(m);
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const can = useCan();
  const [selected, setSelected] = useState<number | null>(null);
  const [recornering, setRecornering] = useState(false);

  const batch = useQuery({
    queryKey: ["batch", id],
    queryFn: () => api.get<Batch>(`/batches/${id}`),
    refetchInterval: (q) =>
      q.state.data && BUSY.has(q.state.data.status) ? 1500 : false,
  });
  const sampleId = batch.data?.sampleId;
  const sample = useQuery({
    queryKey: ["sample", sampleId],
    queryFn: () => api.get<Sample>(`/samples/${sampleId}`),
    enabled: !!sampleId,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["batch", id] });
    void qc.invalidateQueries({ queryKey: ["sample", sampleId] });
  };

  const classify = useMutation({
    mutationFn: (reclassifyAll: boolean) =>
      api.post(`/batches/${id}/classify`, { reclassifyAll }),
    onSuccess: refresh,
  });
  const review = useMutation({
    mutationFn: (d: { kernelId: string; finalClass: string | null }) =>
      api.post("/kernels/review", { decisions: [d] }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/batches/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sample", sampleId] });
      void navigate(`/app/samples/${sampleId}`, { replace: true });
    },
  });

  if (batch.isPending) return <Spinner />;
  if (batch.error) return <ErrorNote error={batch.error} />;
  const b = batch.data;
  const classes = sample.data?.cropProfile.classes ?? [];
  const editable = can.write && sample.data?.status === "in_progress";
  const busy = BUSY.has(b.status);
  const kernel = b.kernels.find((k) => k.number === selected) ?? null;
  const detected =
    b.status !== "uploaded" &&
    b.status !== "detecting" &&
    b.kernelCount !== null;

  if (recornering) {
    return (
      <Recorner
        batch={b}
        onDone={() => {
          setRecornering(false);
          refresh();
        }}
      />
    );
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <Link to={`/app/samples/${b.sampleId}`} className="muted small">
            {t("backToSample", {
              number: sample.data ? `#${sample.data.number}` : "",
            })}
          </Link>
          <h1>
            {t("title", {
              side: b.side === "crease" ? t("sideCrease") : t("sideTop"),
            })}
          </h1>
          <div className="muted small">
            {t("counts", {
              kernels: b.kernelCount ?? "…",
              flagged: b.summary.flagged,
              pending: b.summary.pendingReview,
            })}
          </div>
        </div>
        <BatchStatusBadge status={b.status} />
      </div>
      {b.error && <p className="error">{b.error}</p>}
      {busy && (
        <Spinner
          label={
            b.status === "detecting" ? t("findingKernels") : t("classifying")
          }
        />
      )}

      {detected && (
        <div className="batch-layout">
          <div className="board">
            <AuthImage
              path={`/batches/${id}/image?variant=preview&v=${b.kernelCount ?? 0}`}
              alt={t("straightenedBoard")}
            />
            <svg
              viewBox={`0 0 ${b.board.width} ${b.board.height}`}
              preserveAspectRatio="none"
            >
              {b.kernels.map((k) => (
                <g
                  key={k.id}
                  onClick={() => setSelected(k.number)}
                  className="kernel-mark"
                >
                  <circle
                    cx={k.x + k.w / 2}
                    cy={k.y + k.h / 2}
                    r={Math.max(k.w, k.h) / 2 + 12}
                    fill="transparent"
                    stroke={kernelColor(k)}
                    strokeWidth={
                      selected === k.number ? 12 : k.needsReview ? 8 : 4
                    }
                    opacity={k.needsReview || selected === k.number ? 1 : 0.55}
                  />
                </g>
              ))}
            </svg>
          </div>
          <div className="stack">
            <Legend />
            {kernel ? (
              <KernelPanel
                kernel={kernel}
                classes={classes}
                editable={editable}
                busy={review.isPending}
                onPick={(cls) =>
                  review.mutate({ kernelId: kernel.id, finalClass: cls })
                }
                onClear={() =>
                  review.mutate({ kernelId: kernel.id, finalClass: null })
                }
              />
            ) : (
              <Card>
                <p className="muted">{t("tapKernel")}</p>
              </Card>
            )}
            <ErrorNote error={review.error ?? classify.error ?? remove.error} />
            {editable && (
              <div className="stack-sm">
                {b.summary.classified < b.summary.total && (
                  <button
                    className="primary"
                    disabled={busy || classify.isPending}
                    onClick={() => classify.mutate(false)}
                  >
                    {b.summary.classified
                      ? t("classifyRemaining")
                      : t("classifyWithClaude")}
                  </button>
                )}
                {b.summary.pendingReview > 0 && (
                  <Link
                    className="button primary"
                    to={`/app/samples/${b.sampleId}/review`}
                  >
                    {t("reviewFlagged")}
                  </Link>
                )}
                {b.summary.classified > 0 && (
                  <button
                    disabled={busy || classify.isPending}
                    onClick={() =>
                      confirm(t("confirmReclassify")) && classify.mutate(true)
                    }
                  >
                    {t("reclassifyAll")}
                  </button>
                )}
                <button disabled={busy} onClick={() => setRecornering(true)}>
                  {t("remarkCorners")}
                </button>
                <button
                  className="danger"
                  disabled={busy || remove.isPending}
                  onClick={() => confirm(t("confirmDelete")) && remove.mutate()}
                >
                  {t("deleteBatch")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {!detected && b.status === "failed" && editable && (
        <div className="row">
          <button onClick={() => setRecornering(true)}>
            {t("remarkRetry")}
          </button>
          <button className="danger" onClick={() => remove.mutate()}>
            {t("deleteBatch")}
          </button>
        </div>
      )}
    </div>
  );
}

function Legend() {
  const t = useT(m);
  const items: [string, string][] = [
    [CLASS_COLORS.defect!, t("legendDefect")],
    [CLASS_COLORS.unclear!, t("legendUnclear")],
    [CLASS_COLORS.cluster!, t("legendCluster")],
    [CLASS_COLORS.sound!, t("legendSound")],
    [CLASS_COLORS.pending!, t("legendPending")],
  ];
  return (
    <div className="legend">
      {items.map(([color, label]) => (
        <span key={label}>
          <i style={{ borderColor: color }} /> {label}
        </span>
      ))}
    </div>
  );
}

function KernelPanel({
  kernel,
  classes,
  editable,
  busy,
  onPick,
  onClear,
}: {
  kernel: Kernel;
  classes: readonly ClassDef[];
  editable: boolean;
  busy: boolean;
  onPick: (cls: string) => void;
  onClear: () => void;
}) {
  const t = useT(m);
  const { classLabel } = useGrainLabels();
  return (
    <Card
      title={t("kernelTitle", { number: kernel.number, cell: kernel.cell })}
    >
      <div className="kernel-detail">
        <AuthImage
          path={`/kernels/${kernel.id}/crop`}
          alt={t("kernelAlt", { number: kernel.number })}
          className="crop"
        />
        <div className="stack-sm">
          {kernel.isCluster && (
            <p className="warn small">{t("clusterWarning")}</p>
          )}
          <div>
            {t("claude")} <ClassBadge cls={kernel.aiClass} classes={classes} />{" "}
            {kernel.aiConfidence && (
              <span className="muted small">
                {t("confidence", {
                  level: t(`confidence_${kernel.aiConfidence}`),
                })}
              </span>
            )}
          </div>
          {kernel.aiReason && (
            <div className="muted small">“{kernel.aiReason}”</div>
          )}
          <div>
            {t("yourDecision")}{" "}
            {kernel.finalClass ? (
              <ClassBadge cls={kernel.finalClass} classes={classes} />
            ) : (
              <span className="muted">{t("notChecked")}</span>
            )}
          </div>
        </div>
      </div>
      {editable && (
        <>
          <ClassPicker
            classes={classes}
            value={kernel.finalClass}
            suggested={kernel.aiClass}
            disabled={busy}
            onPick={onPick}
          />
          {kernel.finalClass && (
            <button className="link small" onClick={onClear}>
              {t("clearDecision")}
            </button>
          )}
        </>
      )}
      {kernel.finalClass && kernel.finalClass !== "sound" && (
        <p className="muted small">
          {t("putInCup", { cls: classLabel(classes, kernel.finalClass) })}
        </p>
      )}
    </Card>
  );
}

function Recorner({ batch, onDone }: { batch: Batch; onDone: () => void }) {
  const t = useT(m);
  const tc = useT(common);
  const [src, setSrc] = useState<string | null>(null);
  const [corners, setCorners] = useState<Corners>(
    () =>
      (batch.corners as Corners | null) ??
      insetCorners(batch.originalWidth, batch.originalHeight),
  );
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let url: string | null = null;
    api
      .blob(`/batches/${batch.id}/image?variant=original`)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(setError);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [batch.id]);
  const save = useMutation({
    mutationFn: () => api.put(`/batches/${batch.id}/corners`, { corners }),
    onSuccess: onDone,
  });
  return (
    <Card title={t("remarkTitle")}>
      <p className="muted small">{t("remarkHint")}</p>
      <ErrorNote error={error ?? save.error} />
      {src && (
        <CornerEditor
          src={src}
          width={batch.originalWidth}
          height={batch.originalHeight}
          corners={corners}
          onChange={setCorners}
        />
      )}
      <div className="row">
        <button onClick={onDone}>{tc("cancel")}</button>
        <button
          className="primary"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {t("findAgain")}
        </button>
      </div>
    </Card>
  );
}
