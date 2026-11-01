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
import { Sparkles, Trash2 } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useCrops } from "../api/crops";
import type { Crop } from "../api/types";

/** What Model Orchestration suggests for a crop: nothing is saved until used. */
interface CropSuggestion {
  key: string;
  label: string;
  classes: ClassDef[];
}
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
  const created = (crop: Crop, suggested: boolean) => {
    void qc.invalidateQueries({ queryKey: ["crops"] });
    void navigate(`/app/crops/${crop.key}`, { state: { suggested } });
  };
  // Model Orchestration fills in the name and classes; the editor opens to review them.
  const add = useMutation({
    mutationFn: async () => {
      const s = await api.post<CropSuggestion>("/crops/suggest", {
        name: name.trim(),
      });
      return api.post<Crop>("/crops", s);
    },
    onSuccess: (crop) => created(crop, true),
  });
  const remove = useMutation({
    mutationFn: (key: string) => api.delete(`/crops/${key}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["crops"] }),
  });
  const addPlain = useMutation({
    mutationFn: () =>
      api.post<Crop>("/crops", { key: name, label: name.trim() }),
    onSuccess: (crop) => created(crop, false),
  });

  return (
    <div className="stack">
      <h1>{t("title")}</h1>
      <p className="muted small">{t("intro")}</p>
      {crops.isPending && <Spinner />}
      <ErrorNote error={crops.error} />
      <ErrorNote error={remove.error} />
      <ul className="list">
        {crops.data?.map((c) => (
          <li key={c.key} className="crop-row">
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
            {can.admin && (
              <button
                type="button"
                className="icon-button danger"
                aria-label={t("deleteCrop", { name: cropLabel(c.label) })}
                title={t("deleteCrop", { name: cropLabel(c.label) })}
                disabled={remove.isPending}
                onClick={() =>
                  confirm(t("confirmDelete", { name: cropLabel(c.label) })) &&
                  remove.mutate(c.key)
                }
              >
                <Trash2 size={18} aria-hidden />
              </button>
            )}
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
              disabled={add.isPending || addPlain.isPending || !name.trim()}
            >
              <Sparkles size={16} aria-hidden />{" "}
              {add.isPending ? t("suggesting") : t("addCrop")}
            </button>
          </form>
          <p className="muted small">{t("addCropAiHint")}</p>
          <ErrorNote error={add.error ?? addPlain.error} />
          {add.isError && (
            <p className="small">
              <button
                type="button"
                className="link"
                disabled={addPlain.isPending}
                onClick={() => addPlain.mutate()}
              >
                {t("addPlain")}
              </button>{" "}
              <span className="muted">
                {t("addCropHint", {
                  presets: Object.values(CROP_PRESETS)
                    .map((p) => cropLabel(p.label))
                    .join(", "),
                })}
              </span>
            </p>
          )}
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
  const justSuggested =
    (useLocation().state as { suggested?: boolean } | null)?.suggested ?? false;
  const suggest = useMutation({
    mutationFn: () =>
      api.post<CropSuggestion>("/crops/suggest", { name: label || crop.key }),
  });
  const offer = suggest.data;
  const missing =
    offer?.classes.filter((c) => !rows.some((r) => r.id === c.id)) ?? [];
  const applyOffer = (mode: "replace" | "add") => {
    if (!offer) return;
    setSaved(false);
    if (mode === "replace") {
      setLabel(offer.label);
      setRows(offer.classes);
    } else setRows([...rows, ...missing]);
    suggest.reset();
  };

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
  const navigate = useNavigate();
  const remove = useMutation({
    mutationFn: () => api.delete(`/crops/${crop.key}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["crops"] });
      void navigate("/app/crops", { replace: true });
    },
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
      {justSuggested && (
        <p className="suggestion small">
          <Sparkles size={16} aria-hidden /> {t("suggestedNote")}
        </p>
      )}
      <Card
        title={t("crop")}
        actions={
          !readOnly && (
            <button
              type="button"
              disabled={suggest.isPending}
              onClick={() => suggest.mutate()}
            >
              <Sparkles size={16} aria-hidden />{" "}
              {suggest.isPending ? t("suggesting") : t("suggestClasses")}
            </button>
          )
        }
      >
        <Field label={t("name")}>
          <input
            disabled={readOnly}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        <ErrorNote error={suggest.error} />
        {offer && (
          <div className="stack-sm">
            <p className="small">
              {t("offer", { label: offer.label, count: offer.classes.length })}
            </p>
            <ul className="small offer-list">
              {offer.classes.map((c) => (
                <li key={c.id}>
                  <strong>{c.label}</strong>{" "}
                  <span className="muted">· {groupLabel(c.group)}</span>
                  {c.description && (
                    <div className="muted">{c.description}</div>
                  )}
                </li>
              ))}
            </ul>
            <div className="row wrap">
              <button className="primary" onClick={() => applyOffer("replace")}>
                {t("replaceList")}
              </button>
              {missing.length > 0 && (
                <button onClick={() => applyOffer("add")}>
                  {t.n("addMissing", missing.length)}
                </button>
              )}
              <button className="link" onClick={() => suggest.reset()}>
                {t("discard")}
              </button>
            </div>
            <p className="muted small">{t("offerHint")}</p>
          </div>
        )}
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
      <ErrorNote error={save.error ?? archive.error ?? remove.error} />
      {saved && <p className="good">{t("saved")}</p>}
      {!readOnly && (
        <div className="row">
          <button
            type="button"
            className="danger"
            disabled={remove.isPending}
            onClick={() =>
              confirm(t("confirmDelete", { name: cropLabel(crop.label) })) &&
              remove.mutate()
            }
          >
            <Trash2 size={16} aria-hidden /> {t("delete")}
          </button>
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
