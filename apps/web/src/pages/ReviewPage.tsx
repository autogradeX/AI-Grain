import type { ClassDef } from "@ai-grain/core";
import { CircleCheck } from "lucide-react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Page, ReviewKernel } from "../api/types";
import { useCan } from "../auth/AuthContext";
import { ClassPicker } from "../components/ClassPicker";
import { Pager, usePage } from "../components/Pager";
import {
  AuthImage,
  Badge,
  Card,
  ClassBadge,
  ErrorNote,
  Spinner,
  EmptyState,
} from "../components/ui";
import { useT } from "../i18n";
import { useGrainLabels } from "../i18n/common";
import { FlagReasonBadge } from "../components/FlagReason";
import { m } from "./ReviewPage.i18n";
import { useSample } from "./SamplePage";

/** Kernels per page of the review list. */
const REVIEW_PAGE = 24;

export function ReviewPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const can = useCan();
  const sample = useSample(id);
  const [scope, setScope] = useState<"pending" | "flagged">("pending");
  const [page, setPage] = usePage();
  const t = useT(m);
  const key = ["review", id, scope, page];
  const list = useQuery({
    queryKey: key,
    placeholderData: keepPreviousData,
    queryFn: () =>
      api.get<Page<ReviewKernel> & { harmful: number }>(
        `/samples/${id}/review?scope=${scope}&limit=${REVIEW_PAGE}&offset=${page * REVIEW_PAGE}`,
      ),
  });
  // Past the last page (kernels were checked): go to the last one there is.
  const total = list.data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / REVIEW_PAGE) - 1);
  useEffect(() => {
    if (list.data && page > lastPage) setPage(lastPage);
  }, [list.data, page, lastPage, setPage]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["review", id] });
    void qc.invalidateQueries({ queryKey: ["sample", id] });
  };
  const decide = useMutation({
    mutationFn: (d: { kernelId: string; finalClass: string }) =>
      api.post("/kernels/review", { decisions: [d] }),
    onMutate: (d) => {
      // Update the list at once so the operator can move straight to the next kernel.
      qc.setQueryData<Page<ReviewKernel>>(
        key,
        (old) =>
          old && {
            ...old,
            items:
              scope === "pending"
                ? old.items.filter((k) => k.id !== d.kernelId)
                : old.items.map((k) =>
                    k.id === d.kernelId
                      ? { ...k, finalClass: d.finalClass }
                      : k,
                  ),
          },
      );
    },
    onSettled: refresh,
  });
  const acceptAll = useMutation({
    mutationFn: () =>
      api.post<{ accepted: number; unclear: number; harmfulLeft: number }>(
        `/samples/${id}/review/accept-ai`,
        {},
      ),
    onSuccess: () => setPage(0),
    onSettled: refresh,
  });
  const editable = can.write && sample.data?.status === "in_progress";
  // What "accept all" covers: kernels waiting, less the harmful ones.
  const acceptable =
    scope === "pending" && list.data ? total - list.data.harmful : 0;

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
          onClick={() => {
            setScope("pending");
            setPage(0);
          }}
        >
          {t("toCheck")}
          {sample.data ? ` (${sample.data.kernels.pendingReview})` : ""}
        </button>
        <button
          className={scope === "flagged" ? "active" : ""}
          onClick={() => {
            setScope("flagged");
            setPage(0);
          }}
        >
          {t("allFlagged")}
          {sample.data ? ` (${sample.data.kernels.flagged})` : ""}
        </button>
      </div>
      {editable && acceptable > 0 && (
        <Card>
          <div className="stack-sm">
            <strong>{t("acceptAllTitle")}</strong>
            <span className="muted small">{t("acceptAllHint")}</span>
            <div>
              <button
                className="primary"
                disabled={acceptAll.isPending}
                onClick={() => {
                  if (
                    window.confirm(t("acceptAllConfirm", { count: acceptable }))
                  )
                    acceptAll.mutate();
                }}
              >
                {t("acceptAll", { count: acceptable })}
              </button>
            </div>
          </div>
        </Card>
      )}
      {acceptAll.data && (
        <p className="small">
          {t("acceptedAll", {
            accepted: acceptAll.data.accepted,
            unclear: acceptAll.data.unclear,
          })}{" "}
          {acceptAll.data.harmfulLeft > 0 && (
            <strong className="warn">
              {t.n("harmfulLeft", acceptAll.data.harmfulLeft)}
            </strong>
          )}
        </p>
      )}
      <ErrorNote error={list.error ?? decide.error ?? acceptAll.error} />
      {list.isPending && <Spinner />}
      {list.data?.items.length === 0 && (
        <EmptyState
          icon={CircleCheck}
          title={scope === "pending" ? t("allChecked") : t("noFlagged")}
          action={
            <Link className="button primary" to={`/app/samples/${id}`}>
              {t("backToWeighing")}
            </Link>
          }
        />
      )}
      <div className="review-grid">
        {list.data?.items.map((k) => (
          <ReviewCard
            key={k.id}
            kernel={k}
            classes={sample.data?.cropProfile.classes ?? []}
            editable={editable}
            onPick={(cls) => decide.mutate({ kernelId: k.id, finalClass: cls })}
          />
        ))}
      </div>
      <Pager total={total} limit={REVIEW_PAGE} page={page} onPage={setPage} />
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
        <div className="stack-sm">
          <AuthImage
            path={`/kernels/${kernel.id}/crop`}
            alt={t("kernelAlt", { number: kernel.number })}
            className="crop"
          />
          {kernel.undersideId && (
            <>
              <AuthImage
                path={`/kernels/${kernel.undersideId}/crop`}
                alt={t("undersideAlt", { number: kernel.number })}
                className="crop"
              />
              <span className="muted small">{t("underside")}</span>
            </>
          )}
        </div>
        <div className="stack-sm">
          <strong>
            {t("cell", { cell: kernel.cell, number: kernel.number })}
          </strong>
          <span className="muted small">
            {t(kernel.side === "crease" ? "creaseSide" : "topSide")}
          </span>
          {kernel.flagReason && kernel.flagReason !== "cluster" ? (
            <FlagReasonBadge reason={kernel.flagReason} />
          ) : (
            kernel.isCluster && <Badge tone="info">{t("touching")}</Badge>
          )}
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
          {kernel.otherSideClass && (
            <span className="small">
              {t.rich("undersideSaid", {
                class: (
                  <ClassBadge cls={kernel.otherSideClass} classes={classes} />
                ),
              })}
              {kernel.otherSideReason && (
                <span className="muted"> “{kernel.otherSideReason}”</span>
              )}
            </span>
          )}
          {kernel.flagReason === "disagreement" && kernel.aiClass2 && (
            <span className="small">
              {t.rich("secondOpinion", {
                class: <ClassBadge cls={kernel.aiClass2} classes={classes} />,
              })}
            </span>
          )}
          {kernel.expertClass &&
            kernel.firstClass &&
            kernel.firstClass !== kernel.expertClass && (
              <span className="small">
                {t.rich("firstLook", {
                  class: (
                    <ClassBadge cls={kernel.firstClass} classes={classes} />
                  ),
                })}
              </span>
            )}
          {kernel.expertClass && (
            <span className="muted small">{t("expertChecked")}</span>
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
