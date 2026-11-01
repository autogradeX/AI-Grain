import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Check,
  FileCheck,
  Loader2,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { FlagReason, Sample } from "../api/types";
import { useCan } from "../auth/AuthContext";
import { FlagReasonBadge } from "../components/FlagReason";
import { Badge, Card, ErrorNote } from "../components/ui";
import { useT } from "../i18n";
import { m } from "./AutopilotCard.i18n";

const BUSY = new Set(["uploaded", "detecting", "classifying"]);

type StepState = "done" | "active" | "attention" | "todo";

function Step({
  icon: Icon,
  state,
  title,
  detail,
}: {
  icon: LucideIcon;
  state: StepState;
  title: string;
  detail: string;
}) {
  const Mark = state === "done" ? Check : state === "active" ? Loader2 : Icon;
  return (
    <li className={`pipeline-step is-${state}`}>
      <span className="pipeline-icon" aria-hidden>
        <Mark size={16} strokeWidth={2.2} />
      </span>
      <span className="pipeline-text">
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
    </li>
  );
}

/**
 * What Autopilot has done on a sample and the one thing it needs next:
 * photos, a review of the few uncertain kernels, or nothing at all.
 */
export function AutopilotCard({ sample }: { sample: Sample }) {
  const t = useT(m);
  const can = useCan();
  const qc = useQueryClient();
  const [waitingFor, setWaitingFor] = useState<string[]>([]);
  const finish = useMutation({
    mutationFn: () =>
      api.post<{ waitingFor: string[] }>(`/samples/${sample.id}/finish`),
    onSuccess: (r) => {
      setWaitingFor(r.waitingFor);
      void qc.invalidateQueries({ queryKey: ["sample", sample.id] });
    },
  });

  const k = sample.kernels;
  const photos = sample.batches.length;
  const busy = sample.batches.some((b) => BUSY.has(b.status));
  const failed = sample.batches.some((b) => b.status === "failed");
  const classified = k.total > 0 && k.classified === k.total && !busy;
  const pending = k.pendingReview;
  const completed = sample.status === "completed";
  const flaggedTotal = Object.values(sample.autopilot.flaggedByReason).reduce(
    (a, b) => a + (b ?? 0),
    0,
  );
  const share =
    k.total > 0
      ? Math.round((sample.autopilot.acceptedByAi / k.total) * 100)
      : 0;
  const editable = can.write && !completed;

  const state = completed
    ? { tone: "good" as const, label: t("done") }
    : busy
      ? { tone: "info" as const, label: t("working") }
      : pending > 0 || failed
        ? { tone: "warn" as const, label: t("needsYou") }
        : photos === 0
          ? { tone: "neutral" as const, label: t("waitingPhotos") }
          : { tone: "info" as const, label: t("working") };

  return (
    <Card
      className="autopilot"
      title={
        <span className="autopilot-title">
          <Sparkles size={18} aria-hidden /> {t("title")}
        </span>
      }
      actions={<Badge tone={state.tone}>{state.label}</Badge>}
    >
      <ol className="pipeline">
        <Step
          icon={Camera}
          state={photos > 0 ? "done" : "todo"}
          title={t("stepPhotos")}
          detail={photos ? t.n("photos", photos) : t("noPhotosYet")}
        />
        <Step
          icon={ScanSearch}
          state={classified ? "done" : busy ? "active" : "todo"}
          title={t("stepAi")}
          detail={k.total ? t.n("kernels", k.total) : "—"}
        />
        <Step
          icon={ShieldCheck}
          state={classified ? "done" : busy ? "active" : "todo"}
          title={t("stepCheck")}
          detail={t("checkDetail")}
        />
        <Step
          icon={UserCheck}
          state={!classified ? "todo" : pending > 0 ? "attention" : "done"}
          title={t("stepReview")}
          detail={pending > 0 ? t.n("reviewWaiting", pending) : t("reviewDone")}
        />
        <Step
          icon={FileCheck}
          state={completed ? "done" : sample.autoFinish ? "active" : "todo"}
          title={t("stepReport")}
          detail={
            completed
              ? t("reportReady")
              : sample.autoFinish
                ? t("reportAuto")
                : t("reportWaiting")
          }
        />
      </ol>

      {k.total > 0 && (
        <div className="ai-share">
          <div className="ai-share-bar" aria-hidden>
            <span style={{ width: `${share}%` }} />
          </div>
          <strong>{t("share", { pct: share })}</strong>
          {flaggedTotal > 0 && (
            <div className="row wrap small">
              <span className="muted">{t.n("forYou", flaggedTotal)}</span>
              {(
                Object.entries(sample.autopilot.flaggedByReason) as [
                  FlagReason,
                  number,
                ][]
              ).map(([reason, n]) => (
                <span key={reason} className="row">
                  <FlagReasonBadge reason={reason} />
                  <span className="muted">×{n}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {failed && !completed && <p className="warn small">{t("failedPhoto")}</p>}
      {completed && !sample.completedBy && (
        <p className="muted small">
          {sample.result?.source === "estimate"
            ? t("completedByAutopilot")
            : t("completedByAutopilotWeighed")}
        </p>
      )}
      {!completed && sample.autoFinish && (
        <p className="muted small">
          {pending === 0 && classified ? t("finishingNow") : t("finishing")}
        </p>
      )}
      {waitingFor.length > 0 && !completed && (
        <p className="small">
          {t("waitingFor", { list: waitingFor.join("; ") })}
        </p>
      )}
      <ErrorNote error={finish.error} />

      {editable && (
        <div className="row wrap">
          {pending > 0 && (
            <Link
              to={`/app/samples/${sample.id}/review`}
              className="button primary"
            >
              {t.n("review", pending)}
            </Link>
          )}
          <Link
            to={`/app/samples/${sample.id}/capture`}
            className={pending > 0 || photos > 0 ? "button" : "button primary"}
          >
            <Camera size={16} aria-hidden /> {t("addPhoto")}
          </Link>
          {photos > 0 && !sample.autoFinish && (
            <button disabled={finish.isPending} onClick={() => finish.mutate()}>
              {t("allPhotos")}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
