import {
  CLASS_LABELS,
  DEFECT_CLASSES,
  massPercentages,
  validateMeasurement,
  type DefectClass,
  type LimitFailure,
} from "@ai-grain/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, openFile } from "../api/client";
import {
  MODEL_LABELS,
  type ClaudeModel,
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
          <Link to="/" className="muted small">
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
            onClick={() => navigate(`/samples/${sample.id}/capture`)}
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
              <Link to={`/batches/${b.id}`} className="list-item">
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
          <Link className="button primary" to={`/samples/${sample.id}/review`}>
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
  const [cups, setCups] = useState<Partial<Record<DefectClass, string>>>(() =>
    Object.fromEntries(DEFECT_CLASSES.map((c) => [c, str(sample.cupMassG[c])])),
  );

  const cupMassG = Object.fromEntries(
    DEFECT_CLASSES.flatMap((c) =>
      cups[c]?.trim() ? [[c, Number(cups[c])]] : [],
    ),
  ) as Partial<Record<DefectClass, number>>;
  const measurement = sample.sampleMassG
    ? { sampleMassG: sample.sampleMassG, cupMassG }
    : null;
  const problems = measurement ? validateMeasurement(measurement) : [];
  const live =
    measurement && problems.length === 0 ? massPercentages(measurement) : null;

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
            g) × 100.
          </p>
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
              {DEFECT_CLASSES.map((c) => (
                <tr key={c}>
                  <td>{CLASS_LABELS[c]}</td>
                  <td className="num">{sample.kernels.byClass[c] ?? 0}</td>
                  <td>
                    <input
                      className="input-sm"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      disabled={!editable}
                      value={cups[c] ?? ""}
                      onChange={(e) =>
                        setCups({ ...cups, [c]: e.target.value })
                      }
                    />
                  </td>
                  <td className="num">{live ? pct(live.byClass[c]) : "—"}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Total defects</td>
                <td />
                <td />
                <td className="num">
                  {live ? pct(live.totalDefectsPct) : "—"}
                </td>
              </tr>
            </tbody>
          </table>
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

function limitName(f: LimitFailure) {
  if (f.limit === "total") return "Total defects";
  if (f.limit === "moisture") return "Moisture";
  if (f.limit === "testWeight") return "Test weight";
  return CLASS_LABELS[f.limit];
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
        <p className="muted">Enter the cup weights to see the result.</p>
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
              Total defects {pct(r.totalDefectsPct)} by mass
            </div>
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
                          `${limitName(f)} ${f.value === null ? "not measured" : f.value.toFixed(2)} (${f.kind} ${f.allowed})`,
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
    </Card>
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
      DEFECT_CLASSES.map((c) => [c, str(ref?.byClassPct[c])]),
    ) as Record<DefectClass, string>,
  }));
  const save = useMutation({
    mutationFn: () =>
      api.put<Sample>(`/samples/${sample.id}/reference`, {
        grade: form.grade || null,
        ...(form.graderName && { graderName: form.graderName }),
        ...(form.gradedOn && { gradedOn: form.gradedOn }),
        byClassPct: Object.fromEntries(
          DEFECT_CLASSES.flatMap((c) =>
            form.pct[c].trim() ? [[c, Number(form.pct[c])]] : [],
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
          <Link to="/validation">See the comparison</Link>
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
            {DEFECT_CLASSES.map((c) => (
              <Field key={c} label={`${CLASS_LABELS[c]} (%)`}>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.pct[c]}
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
