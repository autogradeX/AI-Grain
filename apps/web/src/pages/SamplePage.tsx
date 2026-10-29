import {
  CLASS_GROUPS,
  GROUP_LABELS,
  classLabel,
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
import {
  MODEL_LABELS,
  type ClaudeModel,
  type Org,
  type Sample,
  type Standard,
} from "../api/types";
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

const BUSY = new Set(["detecting", "classifying"]);

export function useSample(id: string) {
  return useQuery({
    queryKey: ["sample", id],
    queryFn: () => api.get<Sample>(`/samples/${id}`),
    refetchInterval: (q) =>
      q.state.data?.batches.some((b) => BUSY.has(b.status)) ? 2000 : false,
  });
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));
const str = (v: number | null | undefined) =>
  v === null || v === undefined ? "" : String(v);

export function SamplePage() {
  const { id = "" } = useParams();
  const sample = useSample(id);
  const can = useCan();

  if (sample.isPending) return <Spinner />;
  if (sample.error) return <ErrorNote error={sample.error} />;
  const s = sample.data;
  const editable = can.write && s.status === "in_progress";

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <Link to="/app" className="muted small">
            ← Samples
          </Link>
          <h1>
            Sample #{s.number} · {s.crop}
          </h1>
          <div className="muted small">
            {s.source ?? "No source"} · created {formatDate(s.createdAt)}
          </div>
        </div>
        {s.status === "completed" ? (
          <Badge tone="good">Completed</Badge>
        ) : (
          <Badge tone="info">In progress</Badge>
        )}
      </div>

      <DetailsCard sample={s} editable={editable} />
      <MassCard sample={s} editable={editable} />
      <PhotosCard sample={s} editable={editable} />
      <ReviewCard sample={s} />
      <EstimateCard sample={s} />
      {/* Keyed by the saved weights, so the form resets when they change on the server. */}
      <CupsCard
        key={JSON.stringify(s.cupMassG)}
        sample={s}
        editable={editable}
      />
      <ResultCard sample={s} />
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

  if (!editing) {
    return (
      <Card
        title="Details"
        actions={
          editable && <button onClick={() => setEditing(true)}>Edit</button>
        }
      >
        <dl className="facts">
          <dt>Standard</dt>
          <dd>{sample.standard?.name ?? "None (no grade will be assigned)"}</dd>
          <dt>AI model</dt>
          <dd>{MODEL_LABELS[sample.effectiveModel]}</dd>
          {sample.notes && (
            <>
              <dt>Notes</dt>
              <dd>{sample.notes}</dd>
            </>
          )}
        </dl>
      </Card>
    );
  }
  return (
    <Card title="Details">
      <form
        className="grid-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Standard">
          <select
            value={form.standardId}
            onChange={(e) => setForm({ ...form, standardId: e.target.value })}
          >
            <option value="">None</option>
            {standards.data
              ?.filter((s) => s.crop === sample.crop)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="AI model for this sample">
          <select
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          >
            <option value="">Organisation default</option>
            {(Object.keys(MODEL_LABELS) as ClaudeModel[]).map((m) => (
              <option key={m} value={m}>
                {MODEL_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source">
          <input
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
          />
        </Field>
        <Field label="Notes">
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
        <ErrorNote error={save.error} />
        <div className="row">
          <button type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button className="primary" disabled={save.isPending}>
            Save
          </button>
        </div>
      </form>
    </Card>
  );
}

function MassCard({ sample, editable }: { sample: Sample; editable: boolean }) {
  const update = useSampleUpdate(sample.id);
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
    <Card title="1. Weigh the working sample">
      <p className="muted small">
        Use a 0.01 g scale. A kitchen scale with 1 g steps is too coarse: on a
        50 g sample, 1 g is already 2 %.
      </p>
      <form
        className="grid-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Sample mass (g)">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            disabled={!editable}
            value={form.sampleMassG}
            onChange={(e) => setForm({ ...form, sampleMassG: e.target.value })}
          />
        </Field>
        <Field label="Moisture (%)" hint="Optional, from a moisture meter">
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
        <Field label="Test weight (kg/hl)" hint="Optional">
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
            Save
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
      title="2. Photograph the kernels"
      actions={
        editable && (
          <button
            className="primary"
            onClick={() => navigate(`/app/samples/${sample.id}/capture`)}
          >
            Add photo
          </button>
        )
      }
    >
      <p className="muted small">
        Spread 100–150 kernels on the grid board in one layer, not touching.
        Photograph straight down with every grid cell visible. Repeat until the
        whole sample is done. Optionally flip the kernels and add a crease-side
        photo.
      </p>
      {sample.batches.length === 0 ? (
        <p>No photos yet.</p>
      ) : (
        <ul className="list">
          {sample.batches.map((b, i) => (
            <li key={b.id}>
              <Link to={`/app/batches/${b.id}`} className="list-item">
                <div>
                  <strong>
                    Batch {i + 1} ·{" "}
                    {b.side === "crease" ? "crease side" : "top side"}
                  </strong>
                  <div className="muted small">
                    {b.kernelCount ?? "?"} kernels · {formatDate(b.createdAt)}
                  </div>
                  {b.error && <div className="error small">{b.error}</div>}
                </div>
                <BatchStatusBadge status={b.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {sample.batches.length > 0 && (
        <p className="muted small">{totalKernels} kernels detected in total.</p>
      )}
      {editable && ready.length > 0 && (
        <>
          <button
            className="primary"
            disabled={classify.isPending}
            onClick={() => classify.mutate()}
          >
            Classify{" "}
            {ready.length === 1 ? "the batch" : `${ready.length} batches`} with
            Claude
          </button>
          <ErrorNote error={classify.error} />
        </>
      )}
    </Card>
  );
}

export function BatchStatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    [string, "neutral" | "good" | "warn" | "bad" | "info"]
  > = {
    uploaded: ["Uploaded", "neutral"],
    detecting: ["Finding kernels…", "info"],
    detected: ["Ready to classify", "warn"],
    classifying: ["Claude is classifying…", "info"],
    classified: ["Classified", "good"],
    failed: ["Needs attention", "bad"],
  };
  const [label, tone] = map[status] ?? [status, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
}

function ReviewCard({ sample }: { sample: Sample }) {
  const k = sample.kernels;
  return (
    <Card title="3. Check flagged kernels">
      {k.classified === 0 ? (
        <p className="muted">Classify the photos first.</p>
      ) : (
        <>
          <p>
            Claude flagged <strong>{k.flagged}</strong> of {k.total} kernels.{" "}
            {k.pendingReview} still need your check.
          </p>
          <p className="muted small">
            Pick out each flagged kernel with tweezers, check it by eye (you
            make the final call) and drop it into the cup for its class.
          </p>
          <Link
            className="button primary"
            to={`/app/samples/${sample.id}/review`}
          >
            {k.pendingReview > 0
              ? `Review ${k.pendingReview} kernels`
              : "See reviewed kernels"}
          </Link>
        </>
      )}
    </Card>
  );
}

function CupsCard({ sample, editable }: { sample: Sample; editable: boolean }) {
  const update = useSampleUpdate(sample.id);
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
    <Card title="4. Weigh each cup">
      {!sample.sampleMassG ? (
        <p className="muted">Enter the sample mass in step 1 first.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <p className="muted small">
            Mass % per class = cup weight ÷ sample weight ({sample.sampleMassG}{" "}
            g) × 100. Leave classes you found nothing for empty.
          </p>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Kernels</th>
                  <th>Cup (g)</th>
                  <th>Mass %</th>
                </tr>
              </thead>
              <tbody>
                {CLASS_GROUPS.map((g) => {
                  const inGroup = classes.filter((c) => c.group === g);
                  if (!inGroup.length) return null;
                  return (
                    <Fragment key={g}>
                      <tr className="group-row">
                        <td colSpan={3}>{GROUP_LABELS[g]}</td>
                        <td className="num">
                          {live ? pct(live.byGroup[g]) : "—"}
                        </td>
                      </tr>
                      {inGroup.map((c) => (
                        <tr key={c.id}>
                          <td className="indent">{c.label}</td>
                          <td className="num">
                            {sample.kernels.byClass[c.id] ?? 0}
                          </td>
                          <td>
                            <input
                              className="input-sm"
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              aria-label={`${c.label} cup (g)`}
                              disabled={!editable}
                              value={cups[c.id] ?? ""}
                              onChange={(e) =>
                                setCups({ ...cups, [c.id]: e.target.value })
                              }
                            />
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
                  <td colSpan={3}>Total defects</td>
                  <td className="num">
                    {live ? pct(live.totalDefectsPct) : "—"}
                  </td>
                </tr>
                <tr className="total">
                  <td colSpan={3}>Purity (sound grain)</td>
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
              Save weights and grade
            </button>
          )}
        </form>
      )}
    </Card>
  );
}

function limitName(f: LimitFailure, classes: readonly ClassDef[]) {
  if (f.scope === "class") return classLabel(classes, f.limit);
  if (f.scope === "group") return GROUP_LABELS[f.limit as ClassGroup];
  if (f.scope === "total") return "Total defects";
  if (f.scope === "moisture") return "Moisture";
  return "Test weight";
}

/** Mass % estimated from kernel areas in the photos, with the weighed result beside it when there is one. */
function EstimateCard({ sample }: { sample: Sample }) {
  const e = sample.estimate;
  const classes = sample.cropProfile.classes;
  const weighed =
    sample.result && sample.result.source !== "estimate" ? sample.result : null;
  if (!e) return null;
  const pendingNote =
    sample.kernels.pendingReview > 0
      ? `Uses Claude's classes for the ${sample.kernels.pendingReview} flagged kernel(s) not checked yet.`
      : "Uses your decisions for every flagged kernel.";
  const top = classes
    .filter((c) => (e.byClass[c.id] ?? 0) > 0)
    .sort((a, b) => (e.byClass[b.id] ?? 0) - (e.byClass[a.id] ?? 0))
    .slice(0, 6);
  return (
    <Card title="Instant estimate from the photos">
      <div className="estimate-head">
        <div>
          <div className="result-grade">{pct(e.purityPct, 1)}</div>
          <div className="muted small">estimated purity</div>
        </div>
        {sample.standard && (
          <div>
            <div className="result-grade">
              {e.grade.grade ? `Grade ${e.grade.grade}` : "Below all grades"}
            </div>
            <div className="muted small">on the estimate</div>
          </div>
        )}
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Group</th>
              <th className="num">Estimate</th>
              {weighed && <th className="num">Weighed</th>}
            </tr>
          </thead>
          <tbody>
            {CLASS_GROUPS.map((g) => (
              <tr key={g}>
                <td>{GROUP_LABELS[g]}</td>
                <td className="num">{pct(e.byGroup[g])}</td>
                {weighed && (
                  <td className="num">{pct(weighed.byGroupPct[g])}</td>
                )}
              </tr>
            ))}
            <tr className="total">
              <td>Total defects</td>
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
          Largest classes:{" "}
          {top
            .map(
              (c) =>
                `${c.label} ${pct(e.byClass[c.id], 2)} (${e.countByClass[c.id] ?? 0} objects)`,
            )
            .join(" · ")}
        </p>
      )}
      <p className="muted small">
        Weight is estimated from each object's area in the photo and its class's
        mass factor, over {e.counted} of {e.objects} objects
        {e.unclear + e.unclassified > 0 &&
          ` (${e.unclear + e.unclassified} unclear or not yet classified are left out)`}
        . {pendingNote} Weighing the cups gives the verified result.
      </p>
    </Card>
  );
}

function ResultCard({ sample }: { sample: Sample }) {
  const can = useCan();
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
    <Card title="5. Result and report">
      {!r ? (
        <p className="muted">
          Enter the cup weights to see the result
          {sample.standard?.allowEstimate
            ? ", or complete the sample on the photo estimate (this standard allows it)."
            : "."}
        </p>
      ) : (
        <>
          <div className="result">
            <div className="result-grade">
              {sample.standard
                ? grade
                  ? `Grade ${grade}`
                  : "Below all grades"
                : "No standard"}
            </div>
            <div className="muted">
              Purity {pct(r.purityPct)} · total defects {pct(r.totalDefectsPct)}{" "}
              by mass
            </div>
            {r.source === "estimate" ? (
              <Badge tone="warn">Estimated from photos, not weighed</Badge>
            ) : (
              <Badge tone="good">Weighed</Badge>
            )}
          </div>
          {Object.entries(r.grade.failures).length > 0 && (
            <div className="stack-sm">
              <strong>Why stricter grades were not met</strong>
              <ul className="small">
                {Object.entries(r.grade.failures).map(([g, list]) => (
                  <li key={g}>
                    Grade {g}:{" "}
                    {list
                      .map(
                        (f) =>
                          `${limitName(f, sample.cropProfile.classes)} ${f.value === null ? "not measured" : f.value.toFixed(2)} (${f.kind} ${f.allowed})`,
                      )
                      .join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sample.aiSummary && (
            <blockquote className="summary">
              {sample.aiSummary}
              <footer className="muted small">
                Written by Claude from the figures above
              </footer>
            </blockquote>
          )}
          <p className="note small">
            This is a screening and pre-check result. It is not acceptable for
            official trade grading unless the method has been validated and
            approved.
          </p>
        </>
      )}
      <ErrorNote
        error={complete.error ?? reopen.error ?? summary.error ?? report.error}
      />
      <div className="row wrap">
        <button disabled={report.isPending} onClick={() => report.mutate()}>
          PDF report
        </button>
        {can.write && r && (
          <button disabled={summary.isPending} onClick={() => summary.mutate()}>
            {summary.isPending
              ? "Claude is writing…"
              : sample.aiSummary
                ? "Rewrite summary"
                : "Write summary with Claude"}
          </button>
        )}
        {can.write && sample.status === "in_progress" && (
          <button
            className="primary"
            disabled={complete.isPending}
            onClick={() => complete.mutate()}
          >
            Complete sample
          </button>
        )}
        {can.write && sample.status === "completed" && (
          <button disabled={reopen.isPending} onClick={() => reopen.mutate()}>
            Reopen
          </button>
        )}
      </div>
      {sample.completedAt && (
        <p className="muted small">
          Completed {formatDate(sample.completedAt)}.
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
          <Badge tone="good">Verified report</Badge> Code{" "}
          <strong>{current.code}</strong> (version {current.version}). Anyone
          can check it at{" "}
          <Link to={`/verify/${current.code}`}>/verify/{current.code}</Link>;
          the PDF carries the same code as a QR code.
        </p>
      ) : (
        <p className="small muted">
          The sample is reopened: its certificate is withdrawn until it is
          completed again.
        </p>
      )}
      {certs.data.length > 1 && (
        <details className="small">
          <summary>Earlier versions</summary>
          <ul>
            {certs.data
              .filter((c) => c !== current)
              .map((c) => (
                <li key={c.code}>
                  v{c.version} <Link to={`/verify/${c.code}`}>{c.code}</Link>,
                  issued {formatDate(c.issuedAt)},{" "}
                  {c.status === "withdrawn"
                    ? `withdrawn ${formatDate(c.withdrawnAt)}`
                    : c.status}
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
        Public demo{" "}
        {sample.publicDemo && <Badge tone="info">on the website</Badge>}
      </summary>
      <div className="stack-sm">
        <p className="muted">
          Anyone can open this sample on the website's demo page: its photos,
          kernels, Claude's verdicts and the result. Names, notes and the source
          are not shown.
        </p>
        <Field label="Title on the demo page">
          <input
            maxLength={120}
            placeholder={`${sample.cropProfile.label} sample #${sample.number}`}
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
            {sample.publicDemo ? "Save title" : "Publish as demo"}
          </button>
          {sample.publicDemo && (
            <>
              <Link to="/demo">View demo</Link>
              <button
                className="danger"
                disabled={publish.isPending}
                onClick={() => publish.mutate(false)}
              >
                Remove from website
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
      title="Certified grader result (validation)"
      actions={
        can.write &&
        !open && (
          <button onClick={() => setOpen(true)}>{ref ? "Edit" : "Add"}</button>
        )
      }
    >
      {!open && !ref && (
        <p className="muted small">
          To validate this method, have a certified grader grade the same sample
          and enter their result here. Aim for 30–50 samples graded both ways.
        </p>
      )}
      {!open && ref && (
        <p>
          Grade {ref.grade ?? "none"}
          {ref.graderName && ` by ${ref.graderName}`}
          {ref.gradedOn && ` on ${ref.gradedOn}`}.{" "}
          <Link to="/app/validation">See the comparison</Link>
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
            <Field label="Grade">
              <input
                value={form.grade}
                onChange={(e) => setForm({ ...form, grade: e.target.value })}
              />
            </Field>
            <Field label="Grader">
              <input
                value={form.graderName}
                onChange={(e) =>
                  setForm({ ...form, graderName: e.target.value })
                }
              />
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={form.gradedOn}
                onChange={(e) => setForm({ ...form, gradedOn: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid-3">
            {sample.cropProfile.classes.map(({ id: c, label }) => (
              <Field key={c} label={`${label} (%)`}>
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
              Cancel
            </button>
            <button className="primary" disabled={save.isPending}>
              Save
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
