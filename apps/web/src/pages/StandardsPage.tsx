import {
  CLASS_GROUPS,
  GROUP_LABELS,
  type ClassGroup,
  type GradeSpec,
} from "@ai-grain/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useCrops } from "../api/crops";
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
  maxDefectPct: Partial<Record<string, string>>;
  maxGroupPct: Partial<Record<ClassGroup, string>>;
  maxTotalDefectsPct: string;
  maxMoisturePct: string;
  minTestWeightKgPerHl: string;
}

const s = (v: number | undefined) => (v === undefined ? "" : String(v));
const n = (v: string | undefined) =>
  v === undefined || v.trim() === "" ? undefined : Number(v);

function toForm(g: GradeSpec): GradeForm {
  return {
    grade: g.grade,
    maxDefectPct: Object.fromEntries(
      Object.entries(g.maxDefectPct).map(([k, v]) => [k, s(v)]),
    ),
    maxGroupPct: Object.fromEntries(
      Object.entries(g.maxGroupPct ?? {}).map(([k, v]) => [k, s(v)]),
    ),
    maxTotalDefectsPct: s(g.maxTotalDefectsPct),
    maxMoisturePct: s(g.maxMoisturePct),
    minTestWeightKgPerHl: s(g.minTestWeightKgPerHl),
  };
}

/** Keeps only limits for classes of the chosen crop, so switching crop can't send stale ones. */
function fromForm(g: GradeForm, classIds: readonly string[]): GradeSpec {
  const spec: GradeSpec = {
    grade: g.grade.trim(),
    maxDefectPct: Object.fromEntries(
      classIds.flatMap((c) =>
        n(g.maxDefectPct[c]) === undefined ? [] : [[c, n(g.maxDefectPct[c])]],
      ),
    ),
  };
  const groups = Object.fromEntries(
    CLASS_GROUPS.flatMap((grp) =>
      n(g.maxGroupPct[grp]) === undefined ? [] : [[grp, n(g.maxGroupPct[grp])]],
    ),
  );
  if (Object.keys(groups).length) spec.maxGroupPct = groups;
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
  const [allowEstimate, setAllowEstimate] = useState(
    standard?.allowEstimate ?? false,
  );
  const [definitions, setDefinitions] = useState<
    Partial<Record<string, string>>
  >(standard?.definitions ?? {});
  const crops = useCrops();
  const cropProfile = crops.data?.find((c) => c.key === crop);
  const classes = cropProfile?.classes ?? [];
  const classIds = classes.map((c) => c.id);
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
          Object.entries(definitions).filter(
            ([k, v]) => v?.trim() && classIds.includes(k),
          ),
        ),
        grades: grades.map((g) => fromForm(g, classIds)),
        allowEstimate,
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
          <Field
            label="Crop"
            hint={<Link to="/crops">Edit crops and their classes</Link>}
          >
            <select
              required
              disabled={readOnly || !!standard}
              value={crop}
              onChange={(e) => setCrop(e.target.value)}
            >
              {!crops.data?.some((c) => c.key === crop) && (
                <option value={crop}>{crop}</option>
              )}
              {crops.data?.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
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
        <label className="row small">
          <input
            type="checkbox"
            disabled={readOnly}
            checked={allowEstimate}
            onChange={(e) => setAllowEstimate(e.target.checked)}
          />
          Allow completing a sample on the photo estimate when it wasn't weighed
          (faster, but not verified by the scale)
        </label>
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
          meets. Limits apply per class and per group. Leave a box empty for no
          limit. A moisture or test-weight limit fails when that value wasn't
          measured.
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
              {CLASS_GROUPS.map((grp) => {
                const inGroup = classes.filter((c) => c.group === grp);
                if (!inGroup.length) return null;
                return (
                  <Fragment key={grp}>
                    <tr className="group-row">
                      <td>{GROUP_LABELS[grp]} max %</td>
                      {grades.map((g, i) => (
                        <td key={i}>
                          {limitInput(
                            g.maxGroupPct[grp] ?? "",
                            (v) =>
                              setGrade(i, {
                                maxGroupPct: { ...g.maxGroupPct, [grp]: v },
                              }),
                            `${GROUP_LABELS[grp]} grade ${g.grade}`,
                          )}
                        </td>
                      ))}
                    </tr>
                    {inGroup.map((c) => (
                      <tr key={c.id}>
                        <td className="indent">{c.label} max %</td>
                        {grades.map((g, i) => (
                          <td key={i}>
                            {limitInput(
                              g.maxDefectPct[c.id] ?? "",
                              (v) =>
                                setGrade(i, {
                                  maxDefectPct: {
                                    ...g.maxDefectPct,
                                    [c.id]: v,
                                  },
                                }),
                              `${c.label} grade ${g.grade}`,
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
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
          Claude reads these with every request. Leave a box empty to use the
          crop's own description (shown greyed). Paste the standard's wording
          where it differs, plus any local guidance (for example how to tell
          Fusarium from weather bleaching in your region).
        </p>
        <div className="grid-2">
          {classes.map((c) => (
            <Field key={c.id} label={c.label}>
              <textarea
                rows={2}
                disabled={readOnly}
                placeholder={c.description ?? ""}
                value={definitions[c.id] ?? ""}
                onChange={(e) =>
                  setDefinitions({ ...definitions, [c.id]: e.target.value })
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
