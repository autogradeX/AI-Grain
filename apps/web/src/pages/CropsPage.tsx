import {
  CLASS_GROUPS,
  CROP_PRESETS,
  slugifyClassId,
  validateClasses,
  type ClassDef,
  type ClassGroup,
} from "@ai-grain/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useCrops } from "../api/crops";
import type { Crop } from "../api/types";
import { useCan } from "../auth/AuthContext";
import { Badge, Card, ErrorNote, Field, Spinner } from "../components/ui";
import { useT } from "../i18n";
import { useGrainLabels } from "../i18n/common";
import { m } from "./CropsPage.i18n";

export function CropsPage() {
  const t = useT(m);
  const { groupLabel, cropLabel } = useGrainLabels();
  const can = useCan();
  const crops = useCrops(true);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const add = useMutation({
    mutationFn: () =>
      api.post<Crop>("/crops", { key: name, label: name.trim() }),
    onSuccess: (crop) => {
      void qc.invalidateQueries({ queryKey: ["crops"] });
      void navigate(`/app/crops/${crop.key}`);
    },
  });

  return (
    <div className="stack">
      <h1>{t("title")}</h1>
      <p className="muted small">{t("intro")}</p>
      {crops.isPending && <Spinner />}
      <ErrorNote error={crops.error} />
      <ul className="list">
        {crops.data?.map((c) => (
          <li key={c.key}>
            <Link to={`/app/crops/${c.key}`} className="list-item">
              <div>
                <strong>{cropLabel(c.label)}</strong>{" "}
                {c.archived && <Badge>{t("archived")}</Badge>}
                <div className="muted small">
                  {CLASS_GROUPS.map((g) =>
                    t("groupCount", {
                      count: c.classes.filter((x) => x.group === g).length,
                      group: groupLabel(g).toLowerCase(),
                    }),
                  ).join(" · ")}
                </div>
              </div>
              <span className="muted small">
                {t.n("classes", c.classes.length)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {can.admin && (
        <Card title={t("addCropTitle")}>
          <form
            className="row wrap"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <input
              required
              placeholder={t("addCropPlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ maxWidth: 320 }}
            />
            <button
              className="primary"
              disabled={add.isPending || !name.trim()}
            >
              {t("addCrop")}
            </button>
          </form>
          <p className="muted small">
            {t("addCropHint", {
              presets: Object.values(CROP_PRESETS)
                .map((p) => cropLabel(p.label))
                .join(", "),
            })}
          </p>
          <ErrorNote error={add.error} />
        </Card>
      )}
    </div>
  );
}

interface Row extends ClassDef {
  /** True for classes added in this session, whose id can still change. */
  isNew?: boolean;
}

export function CropEditPage() {
  const t = useT(m);
  const { key = "" } = useParams();
  const crops = useCrops(true);
  const crop = crops.data?.find((c) => c.key === key);
  if (crops.isPending) return <Spinner />;
  if (!crop)
    return <ErrorNote error={crops.error ?? new Error(t("notFound"))} />;
  return <CropForm key={crop.key + crop.classes.length} crop={crop} />;
}

function CropForm({ crop }: { crop: Crop }) {
  const t = useT(m);
  const { groupLabel, cropLabel } = useGrainLabels();
  const can = useCan();
  const qc = useQueryClient();
  const readOnly = !can.admin;
  const [label, setLabel] = useState(crop.label);
  const [rows, setRows] = useState<Row[]>(crop.classes);
  const [saved, setSaved] = useState(false);

  const classes: ClassDef[] = rows.map(({ isNew: _isNew, ...c }) => ({
    ...c,
    description: c.description?.trim() || undefined,
  }));
  const problems = validateClasses(classes);

  const save = useMutation({
    mutationFn: () => api.put<Crop>(`/crops/${crop.key}`, { label, classes }),
    onSuccess: () => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ["crops"] });
    },
  });
  const archive = useMutation({
    mutationFn: () =>
      api.post(`/crops/${crop.key}/archive`, { archived: !crop.archived }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["crops"] }),
  });

  const update = (i: number, patch: Partial<Row>) => {
    setSaved(false);
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setRows(next);
  };
  const addRow = (group: ClassGroup) => {
    setSaved(false);
    setRows([...rows, { id: "", label: "", group, isNew: true }]);
  };

  return (
    <div className="stack">
      <div>
        <Link to="/app/crops" className="muted small">
          {t("backToCrops")}
        </Link>
        <h1>{cropLabel(crop.label)}</h1>
        <div className="muted small">{t("key", { key: crop.key })}</div>
      </div>
      <Card title={t("crop")}>
        <Field label={t("name")}>
          <input
            disabled={readOnly}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
      </Card>
      {CLASS_GROUPS.map((g) => (
        <Card
          key={g}
          title={groupLabel(g)}
          actions={
            !readOnly && (
              <button type="button" onClick={() => addRow(g)}>
                {t("addClass")}
              </button>
            )
          }
        >
          {rows.every((r) => r.group !== g) && (
            <p className="muted small">{t("noClasses")}</p>
          )}
          {rows.map((r, i) =>
            r.group !== g ? null : (
              <div key={i} className="class-row">
                <div className="grid-3">
                  <Field label={t("name")}>
                    <input
                      required
                      disabled={readOnly}
                      value={r.label}
                      onChange={(e) =>
                        update(i, {
                          label: e.target.value,
                          ...(r.isNew && {
                            id: slugifyClassId(e.target.value),
                          }),
                        })
                      }
                    />
                  </Field>
                  <Field label={t("group")}>
                    <select
                      disabled={readOnly}
                      value={r.group}
                      onChange={(e) =>
                        update(i, { group: e.target.value as ClassGroup })
                      }
                    >
                      {CLASS_GROUPS.map((x) => (
                        <option key={x} value={x}>
                          {groupLabel(x)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("massFactor")} hint={t("massFactorHint")}>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="20"
                      disabled={readOnly}
                      value={r.massFactor ?? ""}
                      onChange={(e) =>
                        update(i, {
                          massFactor:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                </div>
                <Field label={t("description")} hint={t("descriptionHint")}>
                  <textarea
                    rows={2}
                    disabled={readOnly}
                    value={r.description ?? ""}
                    onChange={(e) => update(i, { description: e.target.value })}
                  />
                </Field>
                <div className="row wrap small">
                  <span className="muted">{t("id", { id: r.id || "—" })}</span>
                  {!readOnly && (
                    <>
                      <button
                        type="button"
                        className="link"
                        onClick={() => move(i, -1)}
                      >
                        {t("moveUp")}
                      </button>
                      <button
                        type="button"
                        className="link"
                        onClick={() => move(i, 1)}
                      >
                        {t("moveDown")}
                      </button>
                      <button
                        type="button"
                        className="link"
                        onClick={() => {
                          setSaved(false);
                          setRows(rows.filter((_, j) => j !== i));
                        }}
                      >
                        {t("remove")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ),
          )}
        </Card>
      ))}
      {problems.length > 0 && <p className="error">{problems.join("; ")}</p>}
      <ErrorNote error={save.error ?? archive.error} />
      {saved && <p className="good">{t("saved")}</p>}
      {!readOnly && (
        <div className="row">
          <button type="button" onClick={() => archive.mutate()}>
            {crop.archived ? t("restore") : t("archive")}
          </button>
          <button
            className="primary"
            disabled={save.isPending || problems.length > 0}
            onClick={() => save.mutate()}
          >
            {t("saveClasses")}
          </button>
        </div>
      )}
    </div>
  );
}
