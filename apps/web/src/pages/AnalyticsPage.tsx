import {
  CLASS_GROUPS,
  GROUP_LABELS,
  classLabel,
  type ClassGroup,
} from "@ai-grain/core";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { useCrops } from "../api/crops";
import { BarList, ColumnChart, LineChart, Meter } from "../components/charts";
import { Card, ErrorNote, Spinner } from "../components/ui";

interface Analytics {
  range: { days: number; from: string; crop: string | null };
  totals: {
    samples: number;
    completed: number;
    inProgress: number;
    meanPurityPct: number | null;
    medianTurnaroundMinutes: number | null;
    kernelsReviewed: number;
    claudeConfirmedRate: number | null;
    estimatedClaudeCostUsd: number;
    costPerCompletedSampleUsd: number | null;
  };
  perDay: { date: string; created: number; completed: number }[];
  groupTrend: {
    week: string;
    samples: number;
    purityPct: number;
    byGroup: Record<ClassGroup, number>;
  }[];
  grades: { grade: string; count: number }[];
  sources: {
    source: string;
    samples: number;
    meanPurityPct: number;
    minPurityPct: number;
  }[];
  operators: {
    userId: string;
    name: string;
    samplesCompleted: number;
    kernelsReviewed: number;
    corrected: number;
    correctionRate: number | null;
  }[];
  claudeByClass: {
    cls: string;
    reviewed: number;
    confirmedRate: number;
    mostOftenCorrectedTo: { cls: string; count: number } | null;
  }[];
  estimateVsWeighed: {
    samples: number;
    meanAbsDiffTotalPct: number | null;
    meanBiasByGroup: Record<ClassGroup, number | null>;
  };
  claude: {
    model: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    estimatedCostUsd: number | null;
  }[];
}

const PERIODS = [
  [7, "Last 7 days"],
  [30, "Last 30 days"],
  [90, "Last 90 days"],
  [365, "Last 12 months"],
] as const;

const p2 = (v: number) => `${v.toFixed(2)} %`;
const usd = (v: number) => (v < 1 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`);

function duration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 90) return `${Math.round(minutes)} min`;
  if (minutes < 48 * 60) return `${(minutes / 60).toFixed(1)} h`;
  return `${(minutes / 1440).toFixed(1)} days`;
}

function Kpi({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {note && <span className="kpi-note">{note}</span>}
    </div>
  );
}

export function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [crop, setCrop] = useState("");
  const crops = useCrops(true);
  const q = useQuery({
    queryKey: ["analytics", days, crop],
    queryFn: () =>
      api.get<Analytics>(
        `/analytics?days=${days}${crop ? `&crop=${encodeURIComponent(crop)}` : ""}`,
      ),
    // Keep the previous charts on screen while a new range loads: no flash, no layout jump.
    placeholderData: keepPreviousData,
  });
  const a = q.data;
  const classesOf = (key: string | null) =>
    crops.data?.find((c) => c.key === key)?.classes ??
    crops.data?.flatMap((c) => c.classes) ??
    [];
  const classes = classesOf(crop || null);
  const shortDate = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  return (
    <div className="stack">
      <h1>Analytics</h1>
      <div className="filter-row">
        <select
          aria-label="Period"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {PERIODS.map(([d, label]) => (
            <option key={d} value={d}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Crop"
          value={crop}
          onChange={(e) => setCrop(e.target.value)}
        >
          <option value="">All crops</option>
          {crops.data?.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        {q.isFetching && a && <span className="muted small">Updating…</span>}
      </div>
      {q.isPending && <Spinner />}
      <ErrorNote error={q.error} />
      {a && (
        <div className={`stack ${q.isPlaceholderData ? "refetching" : ""}`}>
          <div className="kpis">
            <Kpi
              label="Completed samples"
              value={String(a.totals.completed)}
              note={`${a.totals.inProgress} in progress`}
            />
            <Kpi
              label="Average purity"
              value={
                a.totals.meanPurityPct === null
                  ? "—"
                  : `${a.totals.meanPurityPct.toFixed(1)} %`
              }
              note="completed samples"
            />
            <Kpi
              label="Median turnaround"
              value={duration(a.totals.medianTurnaroundMinutes)}
              note="created to completed"
            />
            <Kpi
              label="Claude confirmed by operators"
              value={
                a.totals.claudeConfirmedRate === null
                  ? "—"
                  : `${Math.round(a.totals.claudeConfirmedRate * 100)} %`
              }
              note={`of ${a.totals.kernelsReviewed} flagged kernels checked`}
            />
            <Kpi
              label="Photo estimate vs scale"
              value={
                a.estimateVsWeighed.meanAbsDiffTotalPct === null
                  ? "—"
                  : `±${a.estimateVsWeighed.meanAbsDiffTotalPct.toFixed(2)} pp`
              }
              note={`mean difference in total defects, ${a.estimateVsWeighed.samples} weighed samples`}
            />
            <Kpi
              label="Claude cost (estimate)"
              value={usd(a.totals.estimatedClaudeCostUsd)}
              note={
                a.totals.costPerCompletedSampleUsd === null
                  ? "at list prices"
                  : `${usd(a.totals.costPerCompletedSampleUsd)} per completed sample, list prices`
              }
            />
          </div>

          <Card title="Samples completed per day">
            <ColumnChart
              unitLabel="Samples completed"
              data={a.perDay.map((d) => ({
                label: shortDate(d.date),
                value: d.completed,
                detail: `${shortDate(d.date)} · ${d.created} created`,
              }))}
              format={(v) => `${v} completed`}
            />
          </Card>

          <Card title="Average defects by group, per week">
            {a.groupTrend.length === 0 ? (
              <p className="muted">No completed samples in this period.</p>
            ) : (
              <div className="multiples">
                {CLASS_GROUPS.map((g) => (
                  <LineChart
                    key={g}
                    title={GROUP_LABELS[g]}
                    maxHint={1}
                    format={p2}
                    data={a.groupTrend.map((w) => ({
                      label: shortDate(w.week),
                      value: w.byGroup[g],
                      detail: `Week of ${shortDate(w.week)} · ${w.samples} samples`,
                    }))}
                  />
                ))}
              </div>
            )}
            <p className="muted small">
              Mass % averaged over the samples completed each week. Each chart
              has its own scale.
            </p>
          </Card>

          <div className="grid-2">
            <Card title="Grades">
              {a.grades.length ? (
                <BarList
                  data={a.grades.map((g) => ({
                    label:
                      g.grade === "No grade" ? g.grade : `Grade ${g.grade}`,
                    value: g.count,
                  }))}
                />
              ) : (
                <p className="muted">No completed samples.</p>
              )}
            </Card>
            <Card title="Sources">
              {a.sources.length ? (
                <div className="table-scroll">
                  <table className="table small">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th className="num">Samples</th>
                        <th className="num">Mean purity</th>
                        <th className="num">Lowest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.sources.map((s) => (
                        <tr key={s.source}>
                          <td>{s.source}</td>
                          <td className="num">{s.samples}</td>
                          <td className="num">
                            {s.meanPurityPct.toFixed(1)} %
                          </td>
                          <td className="num">{s.minPurityPct.toFixed(1)} %</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No completed samples.</p>
              )}
            </Card>
          </div>

          <Card title="Operator consistency">
            <p className="muted small">
              How often each person changed Claude&apos;s verdict when checking
              flagged kernels. Large differences between operators on similar
              grain suggest they read the defect definitions differently: worth
              a calibration session with reference images.
            </p>
            {a.operators.length ? (
              <div className="table-scroll">
                <table className="table small">
                  <thead>
                    <tr>
                      <th>Operator</th>
                      <th className="num">Samples completed</th>
                      <th className="num">Kernels checked</th>
                      <th>Changed Claude&apos;s verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.operators.map((o) => (
                      <tr key={o.userId}>
                        <td>{o.name}</td>
                        <td className="num">{o.samplesCompleted}</td>
                        <td className="num">{o.kernelsReviewed}</td>
                        <td>
                          {o.correctionRate === null ? (
                            "—"
                          ) : (
                            <Meter
                              value={o.correctionRate}
                              label={`${o.name} changed ${o.corrected} verdicts`}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No kernels checked in this period.</p>
            )}
          </Card>

          <Card title="Claude against the operators, by class">
            <p className="muted small">
              For each class Claude chose, the share of checked kernels the
              operator kept. Low rates show where Claude needs better
              definitions or more reference images.
            </p>
            {a.claudeByClass.length ? (
              <div className="table-scroll">
                <table className="table small">
                  <thead>
                    <tr>
                      <th>Claude said</th>
                      <th className="num">Checked</th>
                      <th>Operator agreed</th>
                      <th>Most often changed to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.claudeByClass.map((c) => (
                      <tr key={c.cls}>
                        <td>{classLabel(classes, c.cls)}</td>
                        <td className="num">{c.reviewed}</td>
                        <td>
                          <Meter
                            value={c.confirmedRate}
                            label={`${Math.round(c.confirmedRate * 100)} % agreed`}
                          />
                        </td>
                        <td>
                          {c.mostOftenCorrectedTo
                            ? `${classLabel(classes, c.mostOftenCorrectedTo.cls)} (${c.mostOftenCorrectedTo.count})`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No kernels checked in this period.</p>
            )}
          </Card>

          <Card title="Claude usage">
            {a.claude.length ? (
              <div className="table-scroll">
                <table className="table small">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th className="num">Requests</th>
                      <th className="num">Input tokens</th>
                      <th className="num">Cached</th>
                      <th className="num">Output tokens</th>
                      <th className="num">Cost (list)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.claude.map((c) => (
                      <tr key={c.model}>
                        <td>{c.model}</td>
                        <td className="num">{c.requests}</td>
                        <td className="num">
                          {c.inputTokens.toLocaleString()}
                        </td>
                        <td className="num">
                          {c.cacheReadTokens.toLocaleString()}
                        </td>
                        <td className="num">
                          {c.outputTokens.toLocaleString()}
                        </td>
                        <td className="num">
                          {c.estimatedCostUsd === null
                            ? "—"
                            : usd(c.estimatedCostUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No Claude requests in this period.</p>
            )}
            <p className="muted small">
              Estimated from token counts at list prices; your invoice is the
              reference.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
