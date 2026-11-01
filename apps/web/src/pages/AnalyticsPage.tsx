import { CLASS_GROUPS, type ClassGroup } from "@ai-grain/core";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { useCrops } from "../api/crops";
import { BarList, ColumnChart, LineChart, Meter } from "../components/charts";
import { Card, ErrorNote, Spinner } from "../components/ui";
import { locale, useT, type Translate } from "../i18n";
import { useGrainLabels } from "../i18n/common";
import { useModelLabel } from "../i18n/models";
import { m } from "./AnalyticsPage.i18n";

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
    aiHandledRate: number | null;
    spotChecked: number;
    spotCheckAgreement: number | null;
    completedByAutopilot: number;
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
  [7, "last7"],
  [30, "last30"],
  [90, "last90"],
  [365, "last365"],
] as const;

const p2 = (v: number) => `${v.toFixed(2)} %`;
const usd = (v: number) => (v < 1 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`);

function duration(
  minutes: number | null,
  t: Translate<keyof typeof m>,
): string {
  if (minutes === null) return "—";
  if (minutes < 90) return t("minutes", { n: Math.round(minutes) });
  if (minutes < 48 * 60) return t("hours", { n: (minutes / 60).toFixed(1) });
  return t("days", { n: (minutes / 1440).toFixed(1) });
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
  const t = useT(m);
  const modelLabel = useModelLabel();
  const { groupLabel, classLabel, cropLabel } = useGrainLabels();
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
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale(), {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  return (
    <div className="stack">
      <h1>{t("title")}</h1>
      <div className="filter-row">
        <select
          aria-label={t("period")}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {PERIODS.map(([d, label]) => (
            <option key={d} value={d}>
              {t(label)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("crop")}
          value={crop}
          onChange={(e) => setCrop(e.target.value)}
        >
          <option value="">{t("allCrops")}</option>
          {crops.data?.map((c) => (
            <option key={c.key} value={c.key}>
              {cropLabel(c.label)}
            </option>
          ))}
        </select>
        {q.isFetching && a && (
          <span className="muted small">{t("updating")}</span>
        )}
      </div>
      {q.isPending && <Spinner />}
      <ErrorNote error={q.error} />
      {a && (
        <div className={`stack ${q.isPlaceholderData ? "refetching" : ""}`}>
          <div className="kpis">
            <Kpi
              label={t("aiHandled")}
              value={
                a.totals.aiHandledRate === null
                  ? "—"
                  : `${Math.round(a.totals.aiHandledRate * 100)} %`
              }
              note={t("aiHandledNote", {
                count: a.totals.completedByAutopilot,
              })}
            />
            <Kpi
              label={t("spotAgreement")}
              value={
                a.totals.spotCheckAgreement === null
                  ? "—"
                  : `${Math.round(a.totals.spotCheckAgreement * 100)} %`
              }
              note={t("spotAgreementNote", { count: a.totals.spotChecked })}
            />
            <Kpi
              label={t("completedSamples")}
              value={String(a.totals.completed)}
              note={t("inProgress", { count: a.totals.inProgress })}
            />
            <Kpi
              label={t("averagePurity")}
              value={
                a.totals.meanPurityPct === null
                  ? "—"
                  : `${a.totals.meanPurityPct.toFixed(1)} %`
              }
              note={t("completedSamplesNote")}
            />
            <Kpi
              label={t("medianTurnaround")}
              value={duration(a.totals.medianTurnaroundMinutes, t)}
              note={t("createdToCompleted")}
            />
            <Kpi
              label={t("claudeConfirmed")}
              value={
                a.totals.claudeConfirmedRate === null
                  ? "—"
                  : `${Math.round(a.totals.claudeConfirmedRate * 100)} %`
              }
              note={t("ofFlaggedChecked", {
                count: a.totals.kernelsReviewed,
              })}
            />
            <Kpi
              label={t("estimateVsScale")}
              value={
                a.estimateVsWeighed.meanAbsDiffTotalPct === null
                  ? "—"
                  : `±${a.estimateVsWeighed.meanAbsDiffTotalPct.toFixed(2)} pp`
              }
              note={t("meanDifference", {
                count: a.estimateVsWeighed.samples,
              })}
            />
            <Kpi
              label={t("claudeCost")}
              value={usd(a.totals.estimatedClaudeCostUsd)}
              note={
                a.totals.costPerCompletedSampleUsd === null
                  ? t("atListPrices")
                  : t("perCompletedSample", {
                      cost: usd(a.totals.costPerCompletedSampleUsd),
                    })
              }
            />
          </div>

          <Card title={t("completedPerDay")}>
            <ColumnChart
              unitLabel={t("samplesCompleted")}
              data={a.perDay.map((d) => ({
                label: shortDate(d.date),
                value: d.completed,
                detail: t("createdDetail", {
                  date: shortDate(d.date),
                  count: d.created,
                }),
              }))}
              format={(v) => t("completedValue", { count: v })}
            />
          </Card>

          <Card title={t("defectsByGroup")}>
            {a.groupTrend.length === 0 ? (
              <p className="muted">{t("noCompletedPeriod")}</p>
            ) : (
              <div className="multiples">
                {CLASS_GROUPS.map((g) => (
                  <LineChart
                    key={g}
                    title={groupLabel(g)}
                    maxHint={1}
                    format={p2}
                    data={a.groupTrend.map((w) => ({
                      label: shortDate(w.week),
                      value: w.byGroup[g],
                      detail: t("weekDetail", {
                        date: shortDate(w.week),
                        count: w.samples,
                      }),
                    }))}
                  />
                ))}
              </div>
            )}
            <p className="muted small">{t("groupTrendNote")}</p>
          </Card>

          <div className="grid-2">
            <Card title={t("grades")}>
              {a.grades.length ? (
                <BarList
                  data={a.grades.map((g) => ({
                    // The API reports samples without a grade as "No grade".
                    label:
                      g.grade === "No grade"
                        ? t("noGrade")
                        : t("grade", { grade: g.grade }),
                    value: g.count,
                  }))}
                />
              ) : (
                <p className="muted">{t("noCompleted")}</p>
              )}
            </Card>
            <Card title={t("sources")}>
              {a.sources.length ? (
                <div className="table-scroll">
                  <table className="table small">
                    <thead>
                      <tr>
                        <th>{t("source")}</th>
                        <th className="num">{t("samples")}</th>
                        <th className="num">{t("meanPurity")}</th>
                        <th className="num">{t("lowest")}</th>
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
                <p className="muted">{t("noCompleted")}</p>
              )}
            </Card>
          </div>

          <Card title={t("operatorConsistency")}>
            <p className="muted small">{t("operatorNote")}</p>
            {a.operators.length ? (
              <div className="table-scroll">
                <table className="table small">
                  <thead>
                    <tr>
                      <th>{t("operator")}</th>
                      <th className="num">{t("samplesCompleted")}</th>
                      <th className="num">{t("kernelsChecked")}</th>
                      <th>{t("changedVerdict")}</th>
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
                              label={t("changedVerdicts", {
                                name: o.name,
                                count: o.corrected,
                              })}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">{t("noKernelsChecked")}</p>
            )}
          </Card>

          <Card title={t("claudeByClass")}>
            <p className="muted small">{t("claudeByClassNote")}</p>
            {a.claudeByClass.length ? (
              <div className="table-scroll">
                <table className="table small">
                  <thead>
                    <tr>
                      <th>{t("claudeSaid")}</th>
                      <th className="num">{t("checked")}</th>
                      <th>{t("operatorAgreed")}</th>
                      <th>{t("mostOftenChangedTo")}</th>
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
                            label={t("agreedPct", {
                              pct: Math.round(c.confirmedRate * 100),
                            })}
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
              <p className="muted">{t("noKernelsChecked")}</p>
            )}
          </Card>

          <Card title={t("claudeUsage")}>
            {a.claude.length ? (
              <div className="table-scroll">
                <table className="table small">
                  <thead>
                    <tr>
                      <th>{t("model")}</th>
                      <th className="num">{t("requests")}</th>
                      <th className="num">{t("inputTokens")}</th>
                      <th className="num">{t("cached")}</th>
                      <th className="num">{t("outputTokens")}</th>
                      <th className="num">{t("costList")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.claude.map((c) => (
                      <tr key={c.model}>
                        <td>{modelLabel(c.model)}</td>
                        <td className="num">{c.requests}</td>
                        <td className="num">
                          {c.inputTokens.toLocaleString(locale())}
                        </td>
                        <td className="num">
                          {c.cacheReadTokens.toLocaleString(locale())}
                        </td>
                        <td className="num">
                          {c.outputTokens.toLocaleString(locale())}
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
              <p className="muted">{t("noRequests")}</p>
            )}
            <p className="muted small">{t("costNote")}</p>
          </Card>
        </div>
      )}
    </div>
  );
}
