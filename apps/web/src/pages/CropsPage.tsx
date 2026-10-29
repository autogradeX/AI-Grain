import {
  CLASS_GROUPS,
  CROP_PRESETS,
  GROUP_LABELS,
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

export function CropsPage() {
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
      <h1>Crops and classes</h1>
      <p className="muted small">
        Each crop has its own defect classes in four groups: grain admixtures,
        broken & defective, impurities & foreign material, and harmful &
        disease. Claude sorts every kernel into one of them, and standards set
        limits per class and per group. Wheat, barley, oats, rapeseed and hemp
        start from presets you can change.
      </p>
      {crops.isPending && <Spinner />}
      <ErrorNote error={crops.error} />
      <ul className="list">
        {crops.data?.map((c) => (
          <li key={c.key}>
            <Link to={`/app/crops/${c.key}`} className="list-item">
              <div>
                <strong>{c.label}</strong>{" "}
                {c.archived && <Badge>Archived</Badge>}
                <div className="muted small">
                  {CLASS_GROUPS.map(
                    (g) =>
                      `${c.classes.filter((x) => x.group === g).length} ${GROUP_LABELS[g].toLowerCase()}`,
                  ).join(" · ")}
                </div>
              </div>
              <span className="muted small">{c.classes.length} classes</span>
            </Link>
          </li>
        ))}
      </ul>
      {can.admin && (
        <Card title="Add a crop">
          <form
            className="row wrap"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <input
              required
              placeholder="e.g. triticale, sunflower"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ maxWidth: 320 }}
            />
            <button
              className="primary"
              disabled={add.isPending || !name.trim()}
            >
              Add crop
            </button>
          </form>
          <p className="muted small">
            It starts with the general cereal class list (
            {Object.keys(CROP_PRESETS).join(", ")} have their own); edit it to
            fit.
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
  const { key = "" } = useParams();
  const crops = useCrops(true);
  const crop = crops.data?.find((c) => c.key === key);
  if (crops.isPending) return <Spinner />;
  if (!crop)
    return <ErrorNote error={crops.error ?? new Error("Crop not found")} />;
  return <CropForm key={crop.key + crop.classes.length} crop={crop} />;
}

function CropForm({ crop }: { crop: Crop }) {
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
          ← Crops
        </Link>
        <h1>{crop.label}</h1>
        <div className="muted small">Key: {crop.key}</div>
      </div>
      <Card title="Crop">
        <Field label="Name">
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
          title={GROUP_LABELS[g]}
          actions={
            !readOnly && (
              <button type="button" onClick={() => addRow(g)}>
                Add class
              </button>
            )
          }
        >
          {rows.every((r) => r.group !== g) && (
            <p className="muted small">No classes in this group.</p>
          )}
          {rows.map((r, i) =>
            r.group !== g ? null : (
              <div key={i} className="class-row">
                <div className="grid-3">
                  <Field label="Name">
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
                  <Field label="Group">
                    <select
                      disabled={readOnly}
                      value={r.group}
                      onChange={(e) =>
                        update(i, { group: e.target.value as ClassGroup })
                      }
                    >
                      {CLASS_GROUPS.map((x) => (
                        <option key={x} value={x}>
                          {GROUP_LABELS[x]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Mass factor"
                    hint="For the photo estimate: weight relative to a sound kernel of the same size. Empty = 1."
                  >
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
                <Field label="Description for Claude">
                  <textarea
                    rows={2}
                    disabled={readOnly}
                    value={r.description ?? ""}
                    onChange={(e) => update(i, { description: e.target.value })}
                  />
                </Field>
                <div className="row wrap small">
                  <span className="muted">id: {r.id || "—"}</span>
                  {!readOnly && (
                    <>
                      <button
                        type="button"
                        className="link"
                        onClick={() => move(i, -1)}
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        className="link"
                        onClick={() => move(i, 1)}
                      >
                        Move down
                      </button>
                      <button
                        type="button"
                        className="link"
                        onClick={() => {
                          setSaved(false);
                          setRows(rows.filter((_, j) => j !== i));
                        }}
                      >
                        Remove
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
      {saved && <p className="good">Saved.</p>}
      {!readOnly && (
        <div className="row">
          <button type="button" onClick={() => archive.mutate()}>
            {crop.archived ? "Restore crop" : "Archive crop"}
          </button>
          <button
            className="primary"
            disabled={save.isPending || problems.length > 0}
            onClick={() => save.mutate()}
          >
            Save classes
          </button>
        </div>
      )}
    </div>
  );
}
