import type { ClassDef } from "@ai-grain/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { ReviewKernel } from "../api/types";
import { useCan } from "../auth/AuthContext";
import { ClassPicker } from "../components/ClassPicker";
import {
  AuthImage,
  Badge,
  Card,
  ClassBadge,
  ErrorNote,
  Spinner,
} from "../components/ui";
import { useT } from "../i18n";
import { useGrainLabels } from "../i18n/common";
import { m } from "./ReviewPage.i18n";
import { useSample } from "./SamplePage";

export function ReviewPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const can = useCan();
  const sample = useSample(id);
  const [scope, setScope] = useState<"pending" | "flagged">("pending");
  const t = useT(m);
  const list = useQuery({
    queryKey: ["review", id, scope],
    queryFn: () =>
      api.get<ReviewKernel[]>(`/samples/${id}/review?scope=${scope}`),
  });
  const decide = useMutation({
    mutationFn: (d: { kernelId: string; finalClass: string }) =>
      api.post("/kernels/review", { decisions: [d] }),
    onMutate: (d) => {
      // Update the list at once so the operator can move straight to the next kernel.
      qc.setQueryData<ReviewKernel[]>(["review", id, scope], (old) =>
        scope === "pending"
          ? old?.filter((k) => k.id !== d.kernelId)
          : old?.map((k) =>
              k.id === d.kernelId ? { ...k, finalClass: d.finalClass } : k,
            ),
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["review", id] });
      void qc.invalidateQueries({ queryKey: ["sample", id] });
    },
  });
  const editable = can.write && sample.data?.status === "in_progress";

  return (
    <div className="stack">
      <div>
        <Link to={`/app/samples/${id}`} className="muted small">
          {t("backToSample", {
            number: sample.data ? `#${sample.data.number}` : "",
          })}
        </Link>
        <h1>{t("title")}</h1>
        <p className="muted small">{t("intro")}</p>
      </div>
      <div className="segmented">
        <button
          className={scope === "pending" ? "active" : ""}
          onClick={() => setScope("pending")}
        >
          {t("toCheck")}
          {sample.data ? ` (${sample.data.kernels.pendingReview})` : ""}
        </button>
        <button
          className={scope === "flagged" ? "active" : ""}
          onClick={() => setScope("flagged")}
        >
          {t("allFlagged")}
          {sample.data ? ` (${sample.data.kernels.flagged})` : ""}
        </button>
      </div>
      <ErrorNote error={list.error ?? decide.error} />
      {list.isPending && <Spinner />}
      {list.data?.length === 0 && (
        <Card>
          <p>{scope === "pending" ? t("allChecked") : t("noFlagged")}</p>
          <Link className="button primary" to={`/app/samples/${id}`}>
            {t("backToWeighing")}
          </Link>
        </Card>
      )}
      <div className="review-grid">
        {list.data?.map((k) => (
          <ReviewCard
            key={k.id}
            kernel={k}
            classes={sample.data?.cropProfile.classes ?? []}
            editable={editable}
            onPick={(cls) => decide.mutate({ kernelId: k.id, finalClass: cls })}
          />
        ))}
      </div>
    </div>
  );
}

function ReviewCard({
  kernel,
  classes,
  editable,
  onPick,
}: {
  kernel: ReviewKernel;
  classes: readonly ClassDef[];
  editable: boolean;
  onPick: (cls: string) => void;
}) {
  const [correcting, setCorrecting] = useState(false);
  const t = useT(m);
  const { classLabel } = useGrainLabels();
  const saveRef = useMutation({
    mutationFn: () =>
      api.post("/reference-images/from-kernel", { kernelId: kernel.id }),
  });

  return (
    <Card>
      <div className="kernel-detail">
        <AuthImage
          path={`/kernels/${kernel.id}/crop`}
          alt={t("kernelAlt", { number: kernel.number })}
          className="crop"
        />
        <div className="stack-sm">
          <strong>
            {t("cell", { cell: kernel.cell, number: kernel.number })}
          </strong>
          <span className="muted small">
            {t(kernel.side === "crease" ? "creaseSide" : "topSide")}
          </span>
          {kernel.isCluster && <Badge tone="info">{t("touching")}</Badge>}
          <div>
            <ClassBadge cls={kernel.aiClass} classes={classes} />{" "}
            {kernel.aiConfidence && (
              <span className="muted small">
                {t(`confidence_${kernel.aiConfidence}`)}
              </span>
            )}
          </div>
          {kernel.aiReason && (
            <span className="muted small">“{kernel.aiReason}”</span>
          )}
          {kernel.finalClass && (
            <span className="small">
              {t.rich("decided", {
                class: <ClassBadge cls={kernel.finalClass} classes={classes} />,
              })}
            </span>
          )}
        </div>
      </div>
      {editable && !correcting && (
        <div className="row">
          {kernel.aiClass &&
            kernel.aiClass !== "unclear" &&
            !kernel.isCluster && (
              <button
                className="primary"
                onClick={() => onPick(kernel.aiClass!)}
              >
                {t("confirm", {
                  class: classLabel(classes, kernel.aiClass).toLowerCase(),
                })}
              </button>
            )}
          <button onClick={() => setCorrecting(true)}>
            {kernel.aiClass === "unclear" || kernel.isCluster
              ? t("chooseClass")
              : t("correct")}
          </button>
        </div>
      )}
      {editable && correcting && (
        <ClassPicker
          classes={classes}
          value={kernel.finalClass}
          suggested={kernel.aiClass}
          onPick={(cls) => {
            setCorrecting(false);
            onPick(cls);
          }}
        />
      )}
      {editable && kernel.finalClass && kernel.finalClass !== "unclear" && (
        <button
          className="link small"
          disabled={saveRef.isPending || saveRef.isSuccess}
          onClick={() => saveRef.mutate()}
        >
          {saveRef.isSuccess ? t("savedAsReference") : t("useAsReference")}
        </button>
      )}
      <ErrorNote error={saveRef.error} />
    </Card>
  );
}
