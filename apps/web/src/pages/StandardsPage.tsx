import {
  CLASS_LABELS,
  DEFECT_CLASSES,
  type DefectClass,
  type GradeSpec,
} from "@ai-grain/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Standard } from "../api/types";
import { useCan } from "../auth/AuthContext";
import {
  Badge,
  Card,
  ErrorNote,
  Field,
  formatDate,
  Spinner,
} from "../components/ui";

export function StandardsPage() {
  const can = useCan();
  const [showArchived, setShowArchived] = useState(false);
  const standards = useQuery({
    queryKey: ["standards", showArchived],
    queryFn: () =>
      api.get<Standard[]>(`/standards?includeArchived=${showArchived}`),
  });
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Grading standards</h1>
        {can.admin && (
          <Link className="button primary" to="/standards/new">
            New standard
          </Link>
        )}
      </div>
      <p className="muted small">
        A standard holds the grade limits (maximum mass % per defect class) and
        the defect definitions Claude is given. Copy the limits from the
        official standard you grade against; the app ships with none built in.
      </p>
      <label className="row small">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />{" "}
        Show archived
      </label>
      {standards.isPending && <Spinner />}
      <ErrorNote error={standards.error} />
      {standards.data?.length === 0 && (
        <Card>
          <p>
            No standards yet.
            {can.admin
              ? " Create one to grade samples."
              : " Ask an admin to create one."}
          </p>
        </Card>
      )}
      <ul className="list">
        {standards.data?.map((s) => (
          <li key={s.id}>
            <Link to={`/standards/${s.id}`} className="list-item">
              <div>
                <strong>{s.name}</strong>{" "}
                <span className="muted">· {s.crop}</span>
                <div className="muted small">
                  Grades {s.grades.map((g) => g.grade).join(", ")} · updated{" "}
                  {formatDate(s.updatedAt)}
                </div>
              </div>
              {s.archived && <Badge>Archived</Badge>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface GradeForm {
  grade: string;
  maxDefectPct: Partial<Record<DefectClass, string>>;
  maxTotalDefectsPct: string;
  maxMoisturePct: string;
  minTestWeightKgPerHl: string;
}

const s = (v: number | undefined) => (v === undefined ? "" : String(v));
const n = (v: string) => (v.trim() === "" ? undefined : Number(v));

function toForm(g: GradeSpec): GradeForm {
  return {
    grade: g.grade,
    maxDefectPct: Object.fromEntries(
      DEFECT_CLASSES.map((c) => [c, s(g.maxDefectPct[c])]),
    ),
    maxTotalDefectsPct: s(g.maxTotalDefectsPct),
    maxMoisturePct: s(g.maxMoisturePct),
    minTestWeightKgPerHl: s(g.minTestWeightKgPerHl),
  };
}

function fromForm(g: GradeForm): GradeSpec {
  const spec: GradeSpec = {
    grade: g.grade.trim(),
    maxDefectPct: Object.fromEntries(
      DEFECT_CLASSES.flatMap((c) =>
        n(g.maxDefectPct[c] ?? "") === undefined
          ? []
          : [[c, n(g.maxDefectPct[c] ?? "")]],
      ),
    ),
  };
  const total = n(g.maxTotalDefectsPct);
  const moisture = n(g.maxMoisturePct);
  const tw = n(g.minTestWeightKgPerHl);
  if (total !== undefined) spec.maxTotalDefectsPct = total;
  if (moisture !== undefined) spec.maxMoisturePct = moisture;
  if (tw !== undefined) spec.minTestWeightKgPerHl = tw;
  return spec;
}

const emptyGrade = (name: string): GradeForm =>
  toForm({ grade: name, maxDefectPct: {} });

export function StandardEditPage() {
  const { id = "new" } = useParams();
  const isNew = id === "new";
  const standard = useQuery({
    queryKey: ["standard", id],
    queryFn: () => api.get<Standard>(`/standards/${id}`),
    enabled: !isNew,
  });
  if (!isNew && standard.isPending) return <Spinner />;
  if (standard.error) return <ErrorNote error={standard.error} />;
  return <StandardForm key={id} standard={isNew ? null : standard.data!} />;
}

function StandardForm({ standard }: { standard: Standard | null }) {
  const can = useCan();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const readOnly = !can.admin;
  const [name, setName] = useState(standard?.name ?? "");
  const [crop, setCrop] = useState(standard?.crop ?? "wheat");
  const [description, setDescription] = useState(standard?.description ?? "");
  const [definitions, setDefinitions] = useState<
    Partial<Record<DefectClass, string>>
  >(standard?.definitions ?? {});
  const [grades, setGrades] = useState<GradeForm[]>(
    standard?.grades.map(toForm) ?? [emptyGrade("1"), emptyGrade("2")],
  );

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        crop,
        description: description || null,
        definitions: Object.fromEntries(
          Object.entries(definitions).filter(([, v]) => v?.trim()),
        ),
        grades: grades.map(fromForm),
      };
      return standard
        ? api.put<Standard>(`/standards/${standard.id}`, body)
        : api.post<Standard>("/standards", body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["standards"] });
      void navigate("/standards");
    },
  });
  const archive = useMutation({
    mutationFn: () =>
      api.post(`/standards/${standard!.id}/archive`, {
        archived: !standard!.archived,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["standards"] });
      void navigate("/standards");
    },
  });

  const setGrade = (i: number, patch: Partial<GradeForm>) =>
    setGrades(grades.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const limitInput = (
    value: string,
    onChange: (v: string) => void,
    label: string,
  ) => (
    <input
      className="input-sm"
      type="number"
      inputMode="decimal"
      step="0.01"
      min="0"
      aria-label={label}
      disabled={readOnly}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div>
        <Link to="/standards" className="muted small">
          ← Standards
        </Link>
        <h1>{standard ? standard.name : "New standard"}</h1>
      </div>
      <Card title="Standard">
        <div className="grid-2">
          <Field
            label="Name"
            hint="For example the standard's official name and year"
          >
            <input
              required
              disabled={readOnly}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Crop">
            <input
              required
              disabled={readOnly}
              value={crop}
              onChange={(e) => setCrop(e.target.value.toLowerCase())}
            />
          </Field>
        </div>
        <Field label="Description">
          <textarea
            rows={2}
            disabled={readOnly}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </Card>

      <Card
        title="Grade limits"
        actions={
          !readOnly && (
            <button
              type="button"
              onClick={() =>
                setGrades([...grades, emptyGrade(String(grades.length + 1))])
              }
            >
              Add grade
            </button>
          )
        }
      >
        <p className="muted small">
          Strictest grade first. A sample gets the first grade whose limits it
          meets. Leave a box empty for no limit. A moisture or test-weight limit
          fails when that value wasn't measured.
        </p>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Limit</th>
                {grades.map((g, i) => (
                  <th key={i}>
                    <input
                      className="input-sm"
                      aria-label="Grade name"
                      required
                      disabled={readOnly}
                      value={g.grade}
                      onChange={(e) => setGrade(i, { grade: e.target.value })}
                    />
                    {!readOnly && grades.length > 1 && (
                      <button
                        type="button"
                        className="link small"
                        onClick={() =>
                          setGrades(grades.filter((_, j) => j !== i))
                        }
                      >
                        remove
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEFECT_CLASSES.map((c) => (
                <tr key={c}>
                  <td>{CLASS_LABELS[c]} max %</td>
                  {grades.map((g, i) => (
                    <td key={i}>
                      {limitInput(
                        g.maxDefectPct[c] ?? "",
                        (v) =>
                          setGrade(i, {
                            maxDefectPct: { ...g.maxDefectPct, [c]: v },
                          }),
                        `${CLASS_LABELS[c]} grade ${g.grade}`,
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="total">
                <td>Total defects max %</td>
                {grades.map((g, i) => (
                  <td key={i}>
                    {limitInput(
                      g.maxTotalDefectsPct,
                      (v) => setGrade(i, { maxTotalDefectsPct: v }),
                      `Total grade ${g.grade}`,
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <td>Moisture max %</td>
                {grades.map((g, i) => (
                  <td key={i}>
                    {limitInput(
                      g.maxMoisturePct,
                      (v) => setGrade(i, { maxMoisturePct: v }),
                      `Moisture grade ${g.grade}`,
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <td>Test weight min kg/hl</td>
                {grades.map((g, i) => (
                  <td key={i}>
                    {limitInput(
                      g.minTestWeightKgPerHl,
                      (v) => setGrade(i, { minTestWeightKgPerHl: v }),
                      `Test weight grade ${g.grade}`,
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Defect definitions for Claude">
        <p className="muted small">
          Claude reads these with every request. Paste the standard's own
          wording, plus any local guidance (for example how to tell Fusarium
          from weather bleaching in your region).
        </p>
        <div className="grid-2">
          {DEFECT_CLASSES.map((c) => (
            <Field key={c} label={CLASS_LABELS[c]}>
              <textarea
                rows={2}
                disabled={readOnly}
                value={definitions[c] ?? ""}
                onChange={(e) =>
                  setDefinitions({ ...definitions, [c]: e.target.value })
                }
              />
            </Field>
          ))}
        </div>
      </Card>

      <ErrorNote error={save.error ?? archive.error} />
      {!readOnly && (
        <div className="row">
          {standard && (
            <button type="button" onClick={() => archive.mutate()}>
              {standard.archived ? "Restore" : "Archive"}
            </button>
          )}
          <button className="primary" disabled={save.isPending}>
            Save standard
          </button>
        </div>
      )}
    </form>
  );
}
