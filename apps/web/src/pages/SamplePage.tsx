import {
  CLASS_GROUPS,
  massPercentages,
  validateMeasurement,
  type ClassDef,
  type ClassGroup,
  type LimitFailure,
} from "@ai-grain/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, openFile } from "../api/client";
import { type Org, type Sample, type Standard } from "../api/types";
import { useCan } from "../auth/AuthContext";
import {
  Badge,
  Card,
  ErrorNote,
  Field,
  formatDate,
  pct,
  Spinner,
} from "../components/ui";
import { useT, type Translate } from "../i18n";
import { common, useGrainLabels } from "../i18n/common";
import { MODEL_TIERS, useModelLabel } from "../i18n/models";
import { StandardSuggestionNote } from "../components/StandardSuggestion";
import { AutopilotCard } from "./AutopilotCard";
import { KernelSizeCard, OutputButtons, RepeatCard } from "./SampleExtras";
import { ScaleButton } from "../components/ScaleButton";
import { m } from "./SamplePage.i18n";

type T = Translate<keyof typeof m>;

const BUSY = new Set(["detecting", "classifying"]);

export function useSample(id: string) {
  return useQuery({
    queryKey: ["sample", id],
    queryFn: () => api.get<Sample>(`/samples/${id}`),
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return false;
      if (d.batches.some((b) => BUSY.has(b.status))) return 2000;
      // Autopilot is finishing it: result, report and summary arrive shortly.
      return d.autoFinish &&
        d.status === "in_progress" &&
        d.kernels.pendingReview === 0 &&
        d.kernels.total > 0
        ? 2000
        : false;
    },
  });
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));
const str = (v: number | null | undefined) =>
  v === null || v === undefined ? "" : String(v);

export function SamplePage() {
  const { id = "" } = useParams();
  const sample = useSample(id);
  const can = useCan();
  const t = useT(m);
  const { cropLabel } = useGrainLabels();

  if (sample.isPending) return <Spinner />;
  if (sample.error) return <ErrorNote error={sample.error} />;
  const s = sample.data;
  const editable = can.write && s.status === "in_progress";
  const autopilot = s.autopilot.enabled;
  // A standard that doesn't accept the photo estimate needs the scale.
  const weighingRequired = !!s.standard && !s.standard.allowEstimate;
  const hasWeights = Object.keys(s.cupMassG).length > 0;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <Link to="/app" className="muted small">
            {t("backToSamples")}
          </Link>
          <h1>
            {t("heading", {
              number: s.number,
              crop: cropLabel(s.cropProfile.label),
            })}
          </h1>
          <div className="muted small">
            {s.source ?? t("noSource")} ·{" "}
            {t("createdOn", { date: formatDate(s.createdAt) })}
          </div>
        </div>
        {s.status === "completed" ? (
          <Badge tone="good">{t("completed")}</Badge>
        ) : (
          <Badge tone="info">{t("inProgress")}</Badge>
        )}
      </div>

      <DetailsCard sample={s} editable={editable} />
      {autopilot ? (
        <>
          {/* The AI does the steps; people review the few uncertain kernels. */}
          <AutopilotCard sample={s} />
          <PhotosCard sample={s} editable={editable} />
          <EstimateCard sample={s} />
          <KernelSizeCard sample={s} />
          <details
            className="card weigh-verify"
            open={weighingRequired || hasWeights}
          >
            <summary>
              <strong>{t("verifyByWeighing")}</strong>{" "}
              <span className="muted small">
                {weighingRequired
                  ? t("weighingRequired")
                  : t("weighingOptional")}
              </span>
            </summary>
            <div className="stack">
              <MassCard sample={s} editable={editable} />
              <CupsCard
                key={JSON.stringify(s.cupMassG)}
                sample={s}
                editable={editable}
              />
            </div>
          </details>
        </>
      ) : (
        <>
          <MassCard sample={s} editable={editable} />
          <PhotosCard sample={s} editable={editable} />
          <ReviewCard sample={s} />
          <EstimateCard sample={s} />
          <KernelSizeCard sample={s} />
          {/* Keyed by the saved weights, so the form resets when they change on the server. */}
          <CupsCard
            key={JSON.stringify(s.cupMassG)}
            sample={s}
            editable={editable}
          />
        </>
      )}
      <ResultCard sample={s} />
      <RepeatCard sample={s} />
      <ReferenceCard sample={s} />
    </div>
  );
}

function useSampleUpdate(id: string) {
  const qc = useQueryClient();
  return (data: Sample) => {
    qc.setQueryData<Sample>(["sample", id], (old) =>
      old ? { ...old, ...data } : old,
    );
    void qc.invalidateQueries({ queryKey: ["sample", id] });
    void qc.invalidateQueries({ queryKey: ["samples"] });
  };
}

function DetailsCard({
  sample,
  editable,
}: {
  sample: Sample;
  editable: boolean;
}) {
  const standards = useQuery({
    queryKey: ["standards"],
    queryFn: () => api.get<Standard[]>("/standards"),
  });
  const update = useSampleUpdate(sample.id);
  const t = useT(m);
  const modelLabel = useModelLabel();
  const tc = useT(common);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    standardId: sample.standardId ?? "",
    source: sample.source ?? "",
    notes: sample.notes ?? "",
    model: sample.model ?? "",
  });
  const save = useMutation({
    mutationFn: () =>
      api.patch<Sample>(`/samples/${sample.id}`, {
        standardId: form.standardId || null,
        source: form.source || null,
        notes: form.notes || null,
        model: form.model || null,
      }),
    onSuccess: (data) => {
      update(data);
      setEditing(false);
    },
  });

  const applySuggestion = useMutation({
    mutationFn: (standardId: string) =>
      api.patch<Sample>(`/samples/${sample.id}`, { standardId }),
    onSuccess: update,
  });

  if (!editing) {
    return (
      <Card
        title={t("details")}
        actions={
          editable && (
            <button onClick={() => setEditing(true)}>{tc("edit")}</button>
          )
        }
      >
        <dl className="facts">
          <dt>{t("standard")}</dt>
          <dd>
            {sample.standard?.name ?? t("noStandard")}
            {sample.suggestedStandard && (
              <StandardSuggestionNote
                suggestion={sample.suggestedStandard}
                busy={applySuggestion.isPending}
                {...(editable && {
                  onUse: () =>
                    applySuggestion.mutate(
                      sample.suggestedStandard!.standard.id,
                    ),
                })}
              />
            )}
          </dd>
          <dt>{t("aiModel")}</dt>
          <dd>{modelLabel(sample.effectiveModel)}</dd>
          {sample.notes && (
            <>
              <dt>{t("notes")}</dt>
              <dd>{sample.notes}</dd>
            </>
          )}
        </dl>
      </Card>
    );
  }
  return (
    <Card title={t("details")}>
      <form
        className="grid-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("standard")}>
          <select
            value={form.standardId}
            onChange={(e) => setForm({ ...form, standardId: e.target.value })}
          >
            <option value="">{tc("none")}</option>
            {standards.data
              ?.filter((s) => s.crop === sample.crop)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label={t("aiModelForSample")}>
          <select
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          >
            <option value="">{t("orgDefault")}</option>
            {MODEL_TIERS.map((m) => (
              <option key={m} value={m}>
                {modelLabel(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("source")}>
          <input
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
          />
        </Field>
        <Field label={t("notes")}>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
        <ErrorNote error={save.error} />
        <div className="row">
          <button type="button" onClick={() => setEditing(false)}>
            {tc("cancel")}
          </button>
          <button className="primary" disabled={save.isPending}>
            {tc("save")}
          </button>
        </div>
      </form>
    </Card>
  );
}

function MassCard({ sample, editable }: { sample: Sample; editable: boolean }) {
  const update = useSampleUpdate(sample.id);
  const t = useT(m);
  const tc = useT(common);
  const [form, setForm] = useState({
    sampleMassG: str(sample.sampleMassG),
    moisturePct: str(sample.moisturePct),
    testWeightKgPerHl: str(sample.testWeightKgPerHl),
  });
  const save = useMutation({
    mutationFn: () =>
      api.patch<Sample>(`/samples/${sample.id}`, {
        sampleMassG: num(form.sampleMassG),
        moisturePct: num(form.moisturePct),
        testWeightKgPerHl: num(form.testWeightKgPerHl),
      }),
    onSuccess: update,
  });
  const dirty =
    form.sampleMassG !== str(sample.sampleMassG) ||
    form.moisturePct !== str(sample.moisturePct) ||
    form.testWeightKgPerHl !== str(sample.testWeightKgPerHl);

  return (
    <Card title={t("weighTitle")}>
      <p className="muted small">{t("weighHint")}</p>
      <form
        className="grid-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("sampleMass")}>
          <span className="input-with-button">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              disabled={!editable}
              value={form.sampleMassG}
              onChange={(e) =>
                setForm({ ...form, sampleMassG: e.target.value })
              }
            />
            <ScaleButton
              disabled={!editable}
              onWeight={(g) => setForm({ ...form, sampleMassG: String(g) })}
            />
          </span>
        </Field>
        <Field label={t("moisture")} hint={t("moistureHint")}>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            max="100"
            disabled={!editable}
            value={form.moisturePct}
            onChange={(e) => setForm({ ...form, moisturePct: e.target.value })}
          />
        </Field>
        <Field label={t("testWeight")} hint={t("optional")}>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            disabled={!editable}
            value={form.testWeightKgPerHl}
            onChange={(e) =>
              setForm({ ...form, testWeightKgPerHl: e.target.value })
            }
          />
        </Field>
        <ErrorNote error={save.error} />
        {editable && dirty && (
          <button className="primary" disabled={save.isPending}>
            {tc("save")}
          </button>
        )}
      </form>
    </Card>
  );
}

function PhotosCard({
  sample,
  editable,
}: {
  sample: Sample;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const t = useT(m);
  const classify = useMutation({
    mutationFn: async () => {
      for (const b of sample.batches) {
        if (b.status === "detected" || b.status === "failed") {
          await api.post(`/batches/${b.id}/classify`);
        }
      }
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["sample", sample.id] }),
  });
  const ready = sample.batches.filter(
    (b) => b.status === "detected" || (b.status === "failed" && b.kernelCount),
  );
  const totalKernels = sample.batches.reduce(
    (n, b) => n + (b.kernelCount ?? 0),
    0,
  );

  return (
    <Card
      title={t("photosTitle")}
      actions={
        editable && (
          <button
            className="primary"
            onClick={() => navigate(`/app/samples/${sample.id}/capture`)}
          >
            {t("addPhoto")}
          </button>
        )
      }
    >
      <p className="muted small">{t("photosHint")}</p>
      {sample.batches.length === 0 ? (
        <p>{t("noPhotos")}</p>
      ) : (
        <ul className="list">
          {sample.batches.map((b, i) => (
            <li key={b.id}>
              <Link to={`/app/batches/${b.id}`} className="list-item">
                <div>
                  <strong>
                    {t("batchTitle", {
                      number: i + 1,
                      side: t(b.side === "crease" ? "creaseSide" : "topSide"),
                    })}
                  </strong>
                  {b.sideDetected && b.status === "classified" && (
                    <span className="muted small"> · {t("sideDetected")}</span>
                  )}
                  <div className="muted small">
                    {t("kernelsAndDate", {
                      count: b.kernelCount ?? "?",
                      date: formatDate(b.createdAt),
                    })}
                  </div>
                  {b.error && (
                    <div
                      className={
                        b.status === "failed" ? "error small" : "warn small"
                      }
                    >
                      {b.error}
                    </div>
                  )}
                </div>
                <BatchStatusBadge status={b.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {sample.batches.length > 0 && (
        <p className="muted small">
          {t("totalKernels", { count: totalKernels })}
        </p>
      )}
      {editable && ready.length > 0 && (
        <>
          <button
            className="primary"
            disabled={classify.isPending}
            onClick={() => classify.mutate()}
          >
            {t.n("classifyBatches", ready.length)}
          </button>
          <ErrorNote error={classify.error} />
        </>
      )}
    </Card>
  );
}

export function BatchStatusBadge({ status }: { status: string }) {
  const t = useT(m);
  const map: Record<
    string,
    [string, "neutral" | "good" | "warn" | "bad" | "info"]
  > = {
    uploaded: [t("statusUploaded"), "neutral"],
    detecting: [t("statusDetecting"), "info"],
    detected: [t("statusDetected"), "warn"],
    classifying: [t("statusClassifying"), "info"],
    classified: [t("statusClassified"), "good"],
    failed: [t("statusFailed"), "bad"],
  };
  const [label, tone] = map[status] ?? [status, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
}

function ReviewCard({ sample }: { sample: Sample }) {
  const k = sample.kernels;
  const t = useT(m);
  return (
    <Card title={t("reviewTitle")}>
      {k.classified === 0 ? (
        <p className="muted">{t("classifyFirst")}</p>
      ) : (
        <>
          <p>
            {t.rich("flaggedOf", {
              flagged: <strong>{k.flagged}</strong>,
              total: k.total,
              pending: k.pendingReview,
            })}
          </p>
          <p className="muted small">{t("reviewHint")}</p>
          <Link
            className="button primary"
            to={`/app/samples/${sample.id}/review`}
          >
            {k.pendingReview > 0
              ? t.n("reviewKernels", k.pendingReview)
              : t("seeReviewed")}
          </Link>
        </>
      )}
    </Card>
  );
}

function CupsCard({ sample, editable }: { sample: Sample; editable: boolean }) {
  const update = useSampleUpdate(sample.id);
  const t = useT(m);
  const { groupLabel, classLabel } = useGrainLabels();
  const classes = sample.cropProfile.classes;
  const [cups, setCups] = useState<Partial<Record<string, string>>>(() =>
    Object.fromEntries(classes.map((c) => [c.id, str(sample.cupMassG[c.id])])),
  );

  const cupMassG = Object.fromEntries(
    classes.flatMap((c) =>
      cups[c.id]?.trim() ? [[c.id, Number(cups[c.id])]] : [],
    ),
  ) as Partial<Record<string, number>>;
  const measurement = sample.sampleMassG
    ? { sampleMassG: sample.sampleMassG, cupMassG }
    : null;
  const problems = measurement ? validateMeasurement(measurement, classes) : [];
  const live =
    measurement && problems.length === 0
      ? massPercentages(measurement, classes)
      : null;

  const save = useMutation({
    mutationFn: () =>
      api.put<Sample>(`/samples/${sample.id}/weights`, { cupMassG }),
    onSuccess: update,
  });

  return (
    <Card title={t("cupsTitle")}>
      {!sample.sampleMassG ? (
        <p className="muted">{t("massFirst")}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <p className="muted small">
            {t("cupsHint", { mass: sample.sampleMassG })}
          </p>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("class")}</th>
                  <th>{t("kernels")}</th>
                  <th>{t("cupG")}</th>
                  <th>{t("massPct")}</th>
                </tr>
              </thead>
              <tbody>
                {CLASS_GROUPS.map((g) => {
                  const inGroup = classes.filter((c) => c.group === g);
                  if (!inGroup.length) return null;
                  return (
                    <Fragment key={g}>
                      <tr className="group-row">
                        <td colSpan={3}>{groupLabel(g)}</td>
                        <td className="num">
                          {live ? pct(live.byGroup[g]) : "—"}
                        </td>
                      </tr>
                      {inGroup.map((c) => (
                        <tr key={c.id}>
                          <td className="indent">
                            {classLabel(classes, c.id)}
                          </td>
                          <td className="num">
                            {sample.kernels.byClass[c.id] ?? 0}
                          </td>
                          <td>
                            <span className="input-with-button">
                              <input
                                className="input-sm"
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min="0"
                                aria-label={t("cupAria", {
                                  class: classLabel(classes, c.id),
                                })}
                                disabled={!editable}
                                value={cups[c.id] ?? ""}
                                onChange={(e) =>
                                  setCups({ ...cups, [c.id]: e.target.value })
                                }
                              />
                              <ScaleButton
                                disabled={!editable}
                                onWeight={(g) =>
                                  setCups({ ...cups, [c.id]: String(g) })
                                }
                              />
                            </span>
                          </td>
                          <td className="num">
                            {live ? pct(live.byClass[c.id]) : "—"}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
                <tr className="total">
                  <td colSpan={3}>{t("totalDefects")}</td>
                  <td className="num">
                    {live ? pct(live.totalDefectsPct) : "—"}
                  </td>
                </tr>
                <tr className="total">
                  <td colSpan={3}>{t("purity")}</td>
                  <td className="num">{live ? pct(live.purityPct) : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {problems.length > 0 && (
            <p className="error">{problems.join("; ")}</p>
          )}
          <ErrorNote error={save.error} />
          {editable && (
            <button
              className="primary"
              disabled={save.isPending || problems.length > 0}
            >
              {t("saveWeights")}
            </button>
          )}
        </form>
      )}
    </Card>
  );
}

function limitName(
  f: LimitFailure,
  classes: readonly ClassDef[],
  t: T,
  labels: ReturnType<typeof useGrainLabels>,
) {
  if (f.scope === "class") return labels.classLabel(classes, f.limit);
  if (f.scope === "group") return labels.groupLabel(f.limit as ClassGroup);
  if (f.scope === "total") return t("totalDefects");
  if (f.scope === "moisture") return t("limitMoisture");
  return t("limitTestWeight");
}

/** Mass % estimated from kernel areas in the photos, with the weighed result beside it when there is one. */
function EstimateCard({ sample }: { sample: Sample }) {
  const t = useT(m);
  const { groupLabel, classLabel } = useGrainLabels();
  const e = sample.estimate;
  const classes = sample.cropProfile.classes;
  const weighed =
    sample.result && sample.result.source !== "estimate" ? sample.result : null;
  if (!e) return null;
  const pendingNote =
    sample.kernels.pendingReview > 0
      ? t.n("pendingNote", sample.kernels.pendingReview)
      : t("allDecided");
  const top = classes
    .filter((c) => (e.byClass[c.id] ?? 0) > 0)
    .sort((a, b) => (e.byClass[b.id] ?? 0) - (e.byClass[a.id] ?? 0))
    .slice(0, 6);
  return (
    <Card title={t("estimateTitle")}>
      <div className="estimate-head">
        <div>
          <div className="result-grade">{pct(e.purityPct, 1)}</div>
          <div className="muted small">{t("estimatedPurity")}</div>
        </div>
        {sample.standard && (
          <div>
            <div className="result-grade">
              {e.grade.grade
                ? t("grade", { grade: e.grade.grade })
                : t("belowAllGrades")}
            </div>
            <div className="muted small">{t("onEstimate")}</div>
          </div>
        )}
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>{t("group")}</th>
              <th className="num">{t("estimate")}</th>
              {weighed && <th className="num">{t("weighed")}</th>}
            </tr>
          </thead>
          <tbody>
            {CLASS_GROUPS.map((g) => (
              <tr key={g}>
                <td>{groupLabel(g)}</td>
                <td className="num">{pct(e.byGroup[g])}</td>
                {weighed && (
                  <td className="num">{pct(weighed.byGroupPct[g])}</td>
                )}
              </tr>
            ))}
            <tr className="total">
              <td>{t("totalDefects")}</td>
              <td className="num">{pct(e.totalDefectsPct)}</td>
              {weighed && (
                <td className="num">{pct(weighed.totalDefectsPct)}</td>
              )}
            </tr>
          </tbody>
        </table>
      </div>
      {top.length > 0 && (
        <p className="small">
          {t("largestClasses", {
            list: top
              .map((c) =>
                t("topClass", {
                  class: classLabel(classes, c.id),
                  pct: pct(e.byClass[c.id], 2),
                  count: e.countByClass[c.id] ?? 0,
                }),
              )
              .join(" · "),
          })}
        </p>
      )}
      <p className="muted small">
        {t("estimateNote", {
          counted: e.counted,
          objects: e.objects,
          excluded:
            e.unclear + e.unclassified > 0
              ? t("excluded", { count: e.unclear + e.unclassified })
              : "",
          pending: pendingNote,
        })}
      </p>
    </Card>
  );
}

function ResultCard({ sample }: { sample: Sample }) {
  const can = useCan();
  const t = useT(m);
  const labels = useGrainLabels();
  const update = useSampleUpdate(sample.id);
  const complete = useMutation({
    mutationFn: () => api.post<Sample>(`/samples/${sample.id}/complete`),
    onSuccess: update,
  });
  const reopen = useMutation({
    mutationFn: () => api.post<Sample>(`/samples/${sample.id}/reopen`),
    onSuccess: update,
  });
  const summary = useMutation({
    mutationFn: () => api.post<Sample>(`/samples/${sample.id}/summary`),
    onSuccess: update,
  });
  const report = useMutation({
    mutationFn: () => openFile(`/samples/${sample.id}/report.pdf`),
  });
  const r = sample.result;
  const grade = r?.grade.grade ?? null;

  return (
    <Card title={t("resultTitle")}>
      {!r ? (
        <p className="muted">
          {t(
            sample.autopilot.enabled &&
              (sample.standard ? sample.standard.allowEstimate : true)
              ? "autopilotReport"
              : sample.standard?.allowEstimate
                ? "enterCupsOrEstimate"
                : "enterCups",
          )}
        </p>
      ) : (
        <>
          <div className="result">
            <div className="result-grade">
              {sample.standard
                ? grade
                  ? t("grade", { grade })
                  : t("belowAllGrades")
                : t("noStandardShort")}
            </div>
            <div className="muted">
              {t("purityLine", {
                purity: pct(r.purityPct),
                defects: pct(r.totalDefectsPct),
              })}
            </div>
            {r.source === "estimate" ? (
              <Badge tone="warn">{t("estimatedNotWeighed")}</Badge>
            ) : (
              <Badge tone="good">{t("weighed")}</Badge>
            )}
          </div>
          {Object.entries(r.grade.failures).length > 0 && (
            <div className="stack-sm">
              <strong>{t("whyNotMet")}</strong>
              <ul className="small">
                {Object.entries(r.grade.failures).map(([g, list]) => (
                  <li key={g}>
                    {t("gradeFailures", {
                      grade: g,
                      list: list
                        .map((f) =>
                          t("failure", {
                            limit: limitName(
                              f,
                              sample.cropProfile.classes,
                              t,
                              labels,
                            ),
                            value:
                              f.value === null
                                ? t("notMeasured")
                                : f.value.toFixed(2),
                            kind: t(f.kind === "max" ? "kindMax" : "kindMin"),
                            allowed: f.allowed,
                          }),
                        )
                        .join("; "),
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sample.aiSummary && (
            <blockquote className="summary">
              {sample.aiSummary}
              <footer className="muted small">{t("writtenByClaude")}</footer>
            </blockquote>
          )}
          <p className="note small">{t("screeningNote")}</p>
        </>
      )}
      <ErrorNote
        error={complete.error ?? reopen.error ?? summary.error ?? report.error}
      />
      <div className="row wrap">
        <button disabled={report.isPending} onClick={() => report.mutate()}>
          {t("pdfReport")}
        </button>
        <OutputButtons sample={sample} />
        {can.write && r && (
          <button disabled={summary.isPending} onClick={() => summary.mutate()}>
            {summary.isPending
              ? t("claudeWriting")
              : sample.aiSummary
                ? t("rewriteSummary")
                : t("writeSummary")}
          </button>
        )}
        {can.write && sample.status === "in_progress" && (
          <button
            className="primary"
            disabled={complete.isPending}
            onClick={() => complete.mutate()}
          >
            {t("completeSample")}
          </button>
        )}
        {can.write && sample.status === "completed" && (
          <button disabled={reopen.isPending} onClick={() => reopen.mutate()}>
            {t("reopen")}
          </button>
        )}
      </div>
      {sample.completedAt && (
        <p className="muted small">
          {t("completedOn", { date: formatDate(sample.completedAt) })}
        </p>
      )}
      <Certificates sample={sample} />
      <PublishDemo sample={sample} />
    </Card>
  );
}

interface CertificateRow {
  code: string;
  version: number;
  status: "valid" | "withdrawn";
  payloadHash: string;
  issuedAt: string;
  withdrawnAt: string | null;
}

/** The sample's certificates: the current one to share, and earlier withdrawn versions. */
function Certificates({ sample }: { sample: Sample }) {
  const t = useT(m);
  const certs = useQuery({
    queryKey: ["certificates", sample.id, sample.status],
    queryFn: () =>
      api.get<CertificateRow[]>(`/samples/${sample.id}/certificates`),
  });
  if (!certs.data?.length) return null;
  const current = certs.data.find((c) => c.status === "valid");
  return (
    <div className="stack-sm">
      {current ? (
        <p className="small">
          <Badge tone="good">{t("verifiedReport")}</Badge>{" "}
          {t.rich("certificateLine", {
            code: <strong>{current.code}</strong>,
            version: current.version,
            link: (
              <Link to={`/verify/${current.code}`}>/verify/{current.code}</Link>
            ),
          })}
        </p>
      ) : (
        <p className="small muted">{t("certificateWithdrawn")}</p>
      )}
      {certs.data.length > 1 && (
        <details className="small">
          <summary>{t("earlierVersions")}</summary>
          <ul>
            {certs.data
              .filter((c) => c !== current)
              .map((c) => (
                <li key={c.code}>
                  v{c.version} <Link to={`/verify/${c.code}`}>{c.code}</Link>,{" "}
                  {t("issuedOn", { date: formatDate(c.issuedAt) })},{" "}
                  {c.status === "withdrawn"
                    ? t("withdrawnOn", { date: formatDate(c.withdrawnAt) })
                    : t("statusValid")}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Site-owner admins can show a completed sample on the public demo page. */
function PublishDemo({ sample }: { sample: Sample }) {
  const can = useCan();
  const qc = useQueryClient();
  const t = useT(m);
  const { cropLabel } = useGrainLabels();
  const org = useQuery({
    queryKey: ["org"],
    queryFn: () => api.get<Org>("/org"),
    enabled: can.admin,
  });
  const [title, setTitle] = useState<string | null>(null);
  const publish = useMutation({
    mutationFn: (publicDemo: boolean) =>
      api.post(`/samples/${sample.id}/publish`, {
        publicDemo,
        demoTitle: (title ?? sample.demoTitle ?? "") || null,
      }),
    onSuccess: () => {
      setTitle(null);
      void qc.invalidateQueries({ queryKey: ["sample", sample.id] });
    },
  });
  if (!can.admin || !org.data?.isSiteOwner || sample.status !== "completed")
    return null;
  return (
    <details className="small" open={sample.publicDemo}>
      <summary>
        {t("publicDemo")}{" "}
        {sample.publicDemo && <Badge tone="info">{t("onWebsite")}</Badge>}
      </summary>
      <div className="stack-sm">
        <p className="muted">{t("publicDemoHint")}</p>
        <Field label={t("demoTitle")}>
          <input
            maxLength={120}
            placeholder={t("demoTitlePlaceholder", {
              crop: cropLabel(sample.cropProfile.label),
              number: sample.number,
            })}
            value={title ?? sample.demoTitle ?? ""}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <div className="row wrap">
          <button
            className={sample.publicDemo ? "" : "primary"}
            disabled={publish.isPending}
            onClick={() => publish.mutate(true)}
          >
            {sample.publicDemo ? t("saveTitle") : t("publishAsDemo")}
          </button>
          {sample.publicDemo && (
            <>
              <Link to="/demo">{t("viewDemo")}</Link>
              <button
                className="danger"
                disabled={publish.isPending}
                onClick={() => publish.mutate(false)}
              >
                {t("removeFromWebsite")}
              </button>
            </>
          )}
        </div>
        <ErrorNote error={publish.error} />
      </div>
    </details>
  );
}

function ReferenceCard({ sample }: { sample: Sample }) {
  const can = useCan();
  const update = useSampleUpdate(sample.id);
  const t = useT(m);
  const tc = useT(common);
  const { classLabel } = useGrainLabels();
  const [open, setOpen] = useState(false);
  const ref = sample.reference;
  const [form, setForm] = useState(() => ({
    grade: ref?.grade ?? "",
    graderName: ref?.graderName ?? "",
    gradedOn: ref?.gradedOn ?? "",
    pct: Object.fromEntries(
      sample.cropProfile.classes.map((c) => [c.id, str(ref?.byClassPct[c.id])]),
    ),
  }));
  const save = useMutation({
    mutationFn: () =>
      api.put<Sample>(`/samples/${sample.id}/reference`, {
        grade: form.grade || null,
        ...(form.graderName && { graderName: form.graderName }),
        ...(form.gradedOn && { gradedOn: form.gradedOn }),
        byClassPct: Object.fromEntries(
          sample.cropProfile.classes.flatMap(({ id: c }) =>
            form.pct[c]?.trim() ? [[c, Number(form.pct[c])]] : [],
          ),
        ),
      }),
    onSuccess: (data) => {
      update(data);
      setOpen(false);
    },
  });

  return (
    <Card
      title={t("referenceTitle")}
      actions={
        can.write &&
        !open && (
          <button onClick={() => setOpen(true)}>
            {ref ? tc("edit") : t("add")}
          </button>
        )
      }
    >
      {!open && !ref && <p className="muted small">{t("referenceHint")}</p>}
      {!open && ref && (
        <p>
          {t("referenceGrade", { grade: ref.grade ?? t("referenceNone") })}
          {ref.graderName && t("byGrader", { name: ref.graderName })}
          {ref.gradedOn && t("onDate", { date: ref.gradedOn })}.{" "}
          <Link to="/app/validation">{t("seeComparison")}</Link>
        </p>
      )}
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="stack"
        >
          <div className="grid-3">
            <Field label={t("gradeLabel")}>
              <input
                value={form.grade}
                onChange={(e) => setForm({ ...form, grade: e.target.value })}
              />
            </Field>
            <Field label={t("grader")}>
              <input
                value={form.graderName}
                onChange={(e) =>
                  setForm({ ...form, graderName: e.target.value })
                }
              />
            </Field>
            <Field label={t("date")}>
              <input
                type="date"
                value={form.gradedOn}
                onChange={(e) => setForm({ ...form, gradedOn: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid-3">
            {sample.cropProfile.classes.map(({ id: c }) => (
              <Field
                key={c}
                label={t("classPct", {
                  class: classLabel(sample.cropProfile.classes, c),
                })}
              >
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.pct[c] ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      pct: { ...form.pct, [c]: e.target.value },
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <ErrorNote error={save.error} />
          <div className="row">
            <button type="button" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </button>
            <button className="primary" disabled={save.isPending}>
              {tc("save")}
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
