import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, download } from "../api/client";
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

const PAGE = 25;

export function SamplesPage() {
  const can = useCan();
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
        <h1>Samples</h1>
        <div className="row">
          <button
            onClick={() => void download("/samples/export.csv", "samples.csv")}
          >
            Export CSV
          </button>
          {can.write && (
            <button className="primary" onClick={() => setCreating(true)}>
              New sample
            </button>
          )}
        </div>
      </div>

      {creating && <NewSampleForm onCancel={() => setCreating(false)} />}

      <div className="row wrap">
        <div className="segmented">
          {(
            [
              ["", "All"],
              ["in_progress", "In progress"],
              ["completed", "Completed"],
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
          placeholder="Search number, crop or source"
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
          <p>No samples yet.</p>
          {can.write && (
            <p className="muted">
              Set up a grading standard first, then create a sample for each lot
              you screen.
            </p>
          )}
        </Card>
      )}
      <ul className="list">
        {samples.data?.items.map((s) => (
          <li key={s.id}>
            <Link to={`/app/samples/${s.id}`} className="list-item">
              <div>
                <strong>
                  #{s.number} · {s.crop}
                </strong>
                {s.source && <span className="muted"> · {s.source}</span>}
                <div className="muted small">
                  {s.standardName ?? "No standard"} · {formatDate(s.createdAt)}
                  {s.createdByName && ` · ${s.createdByName}`}
                </div>
              </div>
              <div className="list-item-end">
                {s.status === "completed" ? (
                  <Badge tone={s.grade ? "good" : "warn"}>
                    {s.grade ? `Grade ${s.grade}` : "No grade"}
                  </Badge>
                ) : (
                  <Badge tone="info">In progress</Badge>
                )}
                {s.totalDefectsPct !== null && (
                  <span className="muted small">
                    {pct(s.totalDefectsPct)} defects
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
            Previous
          </button>
          <span className="muted">
            {page * PAGE + 1}–{Math.min(samples.data.total, (page + 1) * PAGE)}{" "}
            of {samples.data.total}
          </span>
          <button
            disabled={(page + 1) * PAGE >= samples.data.total}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function NewSampleForm({ onCancel }: { onCancel: () => void }) {
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
    <Card title="New sample">
      <form
        className="grid-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Crop">
          <CropSelect
            value={crop}
            onChange={(c) => {
              setCrop(c);
              setStandardId("");
            }}
          />
        </Field>
        <Field
          label="Standard"
          hint={
            matching.length
              ? undefined
              : "No standard for this crop yet: results get percentages but no grade."
          }
        >
          <select
            value={standardId}
            onChange={(e) => setStandardId(e.target.value)}
          >
            <option value="">None</option>
            {matching.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source (farm, lot, truck)">
          <input value={source} onChange={(e) => setSource(e.target.value)} />
        </Field>
        <Field
          label="Working sample mass (g)"
          hint="Weigh 20–25 g on the 0.01 g scale (about 500–600 wheat kernels)."
        >
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
            Cancel
          </button>
          <button className="primary" disabled={create.isPending}>
            Create sample
          </button>
        </div>
      </form>
    </Card>
  );
}
