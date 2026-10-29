import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, download } from "../api/client";
import { useCrops } from "../api/crops";
import { CropSelect } from "../components/CropSelect";
import type { SampleListItem, Standard } from "../api/types";
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
import { useT } from "../i18n";
import { common, useGrainLabels } from "../i18n/common";
import { m } from "./SamplesPage.i18n";

const PAGE = 25;

export function SamplesPage() {
  const t = useT(m);
  const can = useCan();
  const crops = useCrops();
  const { cropLabel } = useGrainLabels();
  const [status, setStatus] = useState<"" | "in_progress" | "completed">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);

  const query = new URLSearchParams({
    limit: String(PAGE),
    offset: String(page * PAGE),
  });
  if (status) query.set("status", status);
  if (search.trim()) query.set("search", search.trim());
  const samples = useQuery({
    queryKey: ["samples", status, search, page],
    queryFn: () =>
      api.get<{ items: SampleListItem[]; total: number }>(
        `/samples?${query.toString()}`,
      ),
  });

  return (
    <div className="stack">
      <div className="page-head">
        <h1>{t("title")}</h1>
        <div className="row">
          <button
            onClick={() => void download("/samples/export.csv", "samples.csv")}
          >
            {t("exportCsv")}
          </button>
          {can.write && (
            <button className="primary" onClick={() => setCreating(true)}>
              {t("newSample")}
            </button>
          )}
        </div>
      </div>

      {creating && <NewSampleForm onCancel={() => setCreating(false)} />}

      <div className="row wrap">
        <div className="segmented">
          {(
            [
              ["", t("all")],
              ["in_progress", t("inProgress")],
              ["completed", t("completed")],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={status === value ? "active" : ""}
              onClick={() => {
                setStatus(value);
                setPage(0);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder={t("search")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </div>

      {samples.isPending && <Spinner />}
      <ErrorNote error={samples.error} />
      {samples.data && samples.data.items.length === 0 && (
        <Card>
          <p>{t("noSamples")}</p>
          {can.write && <p className="muted">{t("noSamplesHint")}</p>}
        </Card>
      )}
      <ul className="list">
        {samples.data?.items.map((s) => (
          <li key={s.id}>
            <Link to={`/app/samples/${s.id}`} className="list-item">
              <div>
                <strong>
                  #{s.number} ·{" "}
                  {cropLabel(
                    crops.data?.find((c) => c.key === s.crop)?.label ?? s.crop,
                  )}
                </strong>
                {s.source && <span className="muted"> · {s.source}</span>}
                <div className="muted small">
                  {s.standardName ?? t("noStandard")} ·{" "}
                  {formatDate(s.createdAt)}
                  {s.createdByName && ` · ${s.createdByName}`}
                </div>
              </div>
              <div className="list-item-end">
                {s.status === "completed" ? (
                  <Badge tone={s.grade ? "good" : "warn"}>
                    {s.grade ? t("grade", { grade: s.grade }) : t("noGrade")}
                  </Badge>
                ) : (
                  <Badge tone="info">{t("inProgress")}</Badge>
                )}
                {s.totalDefectsPct !== null && (
                  <span className="muted small">
                    {t("defects", { pct: pct(s.totalDefectsPct) })}
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {samples.data && samples.data.total > PAGE && (
        <div className="row center">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>
            {t("previous")}
          </button>
          <span className="muted">
            {t("range", {
              from: page * PAGE + 1,
              to: Math.min(samples.data.total, (page + 1) * PAGE),
              total: samples.data.total,
            })}
          </span>
          <button
            disabled={(page + 1) * PAGE >= samples.data.total}
            onClick={() => setPage(page + 1)}
          >
            {t("next")}
          </button>
        </div>
      )}
    </div>
  );
}

function NewSampleForm({ onCancel }: { onCancel: () => void }) {
  const t = useT(m);
  const tc = useT(common);
  const navigate = useNavigate();
  const standards = useQuery({
    queryKey: ["standards"],
    queryFn: () => api.get<Standard[]>("/standards"),
  });
  const [crop, setCrop] = useState("wheat");
  const [standardId, setStandardId] = useState("");
  const [source, setSource] = useState("");
  const [mass, setMass] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/samples", {
        crop,
        standardId: standardId || null,
        source: source || null,
        sampleMassG: mass ? Number(mass) : null,
      }),
    onSuccess: (s) => navigate(`/app/samples/${s.id}`),
  });
  const matching = standards.data?.filter((s) => s.crop === crop) ?? [];

  return (
    <Card title={t("newSample")}>
      <form
        className="grid-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label={t("crop")}>
          <CropSelect
            value={crop}
            onChange={(c) => {
              setCrop(c);
              setStandardId("");
            }}
          />
        </Field>
        <Field
          label={t("standard")}
          hint={matching.length ? undefined : t("noStandardHint")}
        >
          <select
            value={standardId}
            onChange={(e) => setStandardId(e.target.value)}
          >
            <option value="">{tc("none")}</option>
            {matching.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("source")}>
          <input value={source} onChange={(e) => setSource(e.target.value)} />
        </Field>
        <Field label={t("mass")} hint={t("massHint")}>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={mass}
            onChange={(e) => setMass(e.target.value)}
          />
        </Field>
        <ErrorNote error={create.error} />
        <div className="row">
          <button type="button" onClick={onCancel}>
            {tc("cancel")}
          </button>
          <button className="primary" disabled={create.isPending}>
            {t("createSample")}
          </button>
        </div>
      </form>
    </Card>
  );
}
