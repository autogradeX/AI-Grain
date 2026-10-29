import { CLASS_GROUPS, type ClassGroup, type GradeSpec } from "@ai-grain/core";
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
import { useT } from "../i18n";
import { useGrainLabels } from "../i18n/common";
import { m } from "./StandardsPage.i18n";

export function StandardsPage() {
  const can = useCan();
  const t = useT(m);
  const { cropLabel } = useGrainLabels();
  const crops = useCrops(true);
  const [showArchived, setShowArchived] = useState(false);
  const standards = useQuery({
    queryKey: ["standards", showArchived],
    queryFn: () =>
      api.get<Standard[]>(`/standards?includeArchived=${showArchived}`),
  });
  return (
    <div className="stack">
      <div className="page-head">
        <h1>{t("title")}</h1>
        {can.admin && (
          <Link className="button primary" to="/app/standards/new">
            {t("newStandard")}
          </Link>
        )}
      </div>
      <p className="muted small">{t("intro")}</p>
      <label className="row small">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />{" "}
        {t("showArchived")}
      </label>
      {standards.isPending && <Spinner />}
      <ErrorNote error={standards.error} />
      {standards.data?.length === 0 && (
        <Card>
          <p>
            {t("noStandards")}
            {can.admin ? t("createOne") : t("askAdmin")}
          </p>
        </Card>
      )}
      <ul className="list">
        {standards.data?.map((s) => (
          <li key={s.id}>
            <Link to={`/app/standards/${s.id}`} className="list-item">
              <div>
                <strong>{s.name}</strong>{" "}
                <span className="muted">
                  ·{" "}
                  {cropLabel(
                    crops.data?.find((c) => c.key === s.crop)?.label ?? s.crop,
                  )}
                </span>
                <div className="muted small">
                  {t("gradesUpdated", {
                    grades: s.grades.map((g) => g.grade).join(", "),
                    date: formatDate(s.updatedAt),
                  })}
                </div>
              </div>
              {s.archived && <Badge>{t("archived")}</Badge>}
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
  const t = useT(m);
  const { groupLabel, classLabel, cropLabel } = useGrainLabels();
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
      void navigate("/app/standards");
    },
  });
  const archive = useMutation({
    mutationFn: () =>
      api.post(`/standards/${standard!.id}/archive`, {
        archived: !standard!.archived,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["standards"] });
      void navigate("/app/standards");
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
        <Link to="/app/standards" className="muted small">
          {t("backToStandards")}
        </Link>
        <h1>{standard ? standard.name : t("newStandard")}</h1>
      </div>
      <Card title={t("standard")}>
        <div className="grid-2">
          <Field label={t("name")} hint={t("nameHint")}>
            <input
              required
              disabled={readOnly}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            label={t("crop")}
            hint={<Link to="/app/crops">{t("editCrops")}</Link>}
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
                  {cropLabel(c.label)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t("description")}>
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
          {t("allowEstimate")}
        </label>
      </Card>

      <Card
        title={t("gradeLimits")}
        actions={
          !readOnly && (
            <button
              type="button"
              onClick={() =>
                setGrades([...grades, emptyGrade(String(grades.length + 1))])
              }
            >
              {t("addGrade")}
            </button>
          )
        }
      >
        <p className="muted small">{t("limitsHint")}</p>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t("limit")}</th>
                {grades.map((g, i) => (
                  <th key={i}>
                    <input
                      className="input-sm"
                      aria-label={t("gradeName")}
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
                        {t("removeGrade")}
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
                      <td>{t("maxPct", { label: groupLabel(grp) })}</td>
                      {grades.map((g, i) => (
                        <td key={i}>
                          {limitInput(
                            g.maxGroupPct[grp] ?? "",
                            (v) =>
                              setGrade(i, {
                                maxGroupPct: { ...g.maxGroupPct, [grp]: v },
                              }),
                            t("limitAria", {
                              label: groupLabel(grp),
                              grade: g.grade,
                            }),
                          )}
                        </td>
                      ))}
                    </tr>
                    {inGroup.map((c) => (
                      <tr key={c.id}>
                        <td className="indent">
                          {t("maxPct", { label: classLabel(classes, c.id) })}
                        </td>
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
                              t("limitAria", {
                                label: classLabel(classes, c.id),
                                grade: g.grade,
                              }),
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              <tr className="total">
                <td>{t("totalDefects")}</td>
                {grades.map((g, i) => (
                  <td key={i}>
                    {limitInput(
                      g.maxTotalDefectsPct,
                      (v) => setGrade(i, { maxTotalDefectsPct: v }),
                      t("totalAria", { grade: g.grade }),
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <td>{t("moisture")}</td>
                {grades.map((g, i) => (
                  <td key={i}>
                    {limitInput(
                      g.maxMoisturePct,
                      (v) => setGrade(i, { maxMoisturePct: v }),
                      t("moistureAria", { grade: g.grade }),
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <td>{t("testWeight")}</td>
                {grades.map((g, i) => (
                  <td key={i}>
                    {limitInput(
                      g.minTestWeightKgPerHl,
                      (v) => setGrade(i, { minTestWeightKgPerHl: v }),
                      t("testWeightAria", { grade: g.grade }),
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t("definitionsTitle")}>
        <p className="muted small">{t("definitionsHint")}</p>
        <div className="grid-2">
          {classes.map((c) => (
            <Field key={c.id} label={classLabel(classes, c.id)}>
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
              {standard.archived ? t("restore") : t("archive")}
            </button>
          )}
          <button className="primary" disabled={save.isPending}>
            {t("saveStandard")}
          </button>
        </div>
      )}
    </form>
  );
}
