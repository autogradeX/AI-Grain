import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pager, useDebounced, usePage } from "../components/Pager";
import { Link } from "react-router-dom";
import { api, download } from "../api/client";
import { useCan } from "../auth/AuthContext";
import { useCrop } from "../api/crops";
import { CropSelect } from "../components/CropSelect";
import type { ValidationReport } from "../api/types";
import { Badge, Card, ErrorNote, Field, Spinner } from "../components/ui";
import { useT } from "../i18n";
import { useGrainLabels } from "../i18n/common";
import { m } from "./ValidationPage.i18n";
import { RepeatabilityCard } from "./Repeatability";
import { LabImport } from "./LabImport";
import { m as labMessages } from "./LabImport.i18n";

const f = (v: number) => v.toFixed(2);

const SAMPLES_PAGE = 25;

export function ValidationPage() {
  const [crop, setCrop] = useState("wheat");
  const [page, setPage] = usePage();
  const t = useT(m);
  const { classLabel } = useGrainLabels();
  const can = useCan();
  const [importing, setImporting] = useState(false);
  const tl = useT(labMessages);
  // Agreement tolerances in percentage points; empty uses the default.
  const [tol, setTol] = useState({
    cls: "",
    moisture: "",
    protein: "",
    oil: "",
  });
  const tolQuery = useDebounced(
    new URLSearchParams(
      Object.entries({
        tolClass: tol.cls,
        tolMoisture: tol.moisture,
        tolProtein: tol.protein,
        tolOil: tol.oil,
      }).filter(([, v]) => v.trim() !== "" && Number(v) >= 0),
    ).toString(),
  );
  const filter = `crop=${encodeURIComponent(crop)}${tolQuery ? `&${tolQuery}` : ""}`;
  const report = useQuery({
    queryKey: ["validation", crop, page, tolQuery],
    placeholderData: keepPreviousData,
    queryFn: () =>
      api.get<ValidationReport>(
        `/validation?${filter}&limit=${SAMPLES_PAGE}&offset=${page * SAMPLES_PAGE}`,
      ),
  });
  const classes = useCrop(crop)?.classes ?? [];
  const r = report.data;
  const n = r?.summary.samples ?? 0;

  return (
    <div className="stack">
      <h1>{t("title")}</h1>
      <p className="muted small">{t("intro")}</p>
      <Field label={t("crop")}>
        <CropSelect
          value={crop}
          onChange={(c) => {
            setCrop(c);
            setPage(0);
          }}
        />
      </Field>
      <div className="row wrap">
        {can.write && (
          <button onClick={() => setImporting(!importing)}>{tl("open")}</button>
        )}
        <button
          onClick={() =>
            void download(
              `/validation/report.csv?${filter}`,
              "ai-grain-validation.csv",
            )
          }
        >
          {t("downloadReport")}
        </button>
      </div>
      {importing && <LabImport onClose={() => setImporting(false)} />}
      <RepeatabilityCard crop={crop} />
      {report.isPending && <Spinner />}
      <ErrorNote error={report.error} />
      {r && (
        <>
          <Card title={t("progress")}>
            <div
              className="progress"
              aria-label={t("progressLabel", {
                count: n,
                target: r.target.recommended,
              })}
            >
              <div
                style={{
                  width: `${Math.min(100, (n / r.target.recommended) * 100)}%`,
                }}
              />
            </div>
            <p>
              {t.n("gradedBoth", n)}{" "}
              {n < r.target.min ? (
                <Badge tone="warn">
                  {t("moreNeeded", { count: r.target.min - n })}
                </Badge>
              ) : (
                <Badge tone="good">{t("enough")}</Badge>
              )}
            </p>
            {r.summary.gradeAgreement !== null && (
              <p>
                {t.rich("sameGrade", {
                  pct: (
                    <strong>
                      {Math.round(r.summary.gradeAgreement * 100)} %
                    </strong>
                  ),
                  count: r.summary.gradeComparable,
                })}
              </p>
            )}
          </Card>
          {r.summary.byClass.length > 0 && (
            <Card title={t("agreement")}>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("class")}</th>
                      <th>n</th>
                      <th>{t("methodMean")}</th>
                      <th>{t("graderMean")}</th>
                      <th>{t("bias")}</th>
                      <th>{t("meanAbsDiff")}</th>
                      <th>{t("maxAbsDiff")}</th>
                      <th>
                        {t("within", { tol: r.summary.tolerances.classPct })}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.summary.byClass.map((c) => (
                      <tr key={c.cls}>
                        <td>{classLabel(classes, c.cls)}</td>
                        <td className="num">{c.n}</td>
                        <td className="num">{f(c.meanMethodPct)}</td>
                        <td className="num">{f(c.meanReferencePct)}</td>
                        <td className="num">
                          {c.meanBiasPct > 0 ? "+" : ""}
                          {f(c.meanBiasPct)}
                        </td>
                        <td className="num">{f(c.meanAbsDiffPct)}</td>
                        <td className="num">{f(c.maxAbsDiffPct)}</td>
                        <td className="num">
                          {Math.round(c.withinTolerance * 100)} %
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted small">{t("biasNote")}</p>
            </Card>
          )}
          {r.summary.measurements.length > 0 && (
            <Card title={t("measurements")}>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("measurement")}</th>
                      <th>n</th>
                      <th>{t("bias")}</th>
                      <th>{t("meanAbsDiff")}</th>
                      <th>{t("maxAbsDiff")}</th>
                      <th>{t("withinPlain")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.summary.measurements.map((x) => (
                      <tr key={x.field}>
                        <td>
                          {t(x.field)} (±{r.summary.tolerances[x.field]})
                        </td>
                        <td className="num">{x.n}</td>
                        <td className="num">
                          {x.meanBias > 0 ? "+" : ""}
                          {f(x.meanBias)}
                        </td>
                        <td className="num">{f(x.meanAbsDiff)}</td>
                        <td className="num">{f(x.maxAbsDiff)}</td>
                        <td className="num">
                          {Math.round(x.withinTolerance * 100)} %
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <Card title={t("tolerances")}>
            <p className="muted small">{t("tolerancesHint")}</p>
            <div className="grid-3">
              {(
                [
                  ["cls", "classPct", t("tolClass")],
                  ["moisture", "moisture", t("moisture")],
                  ["protein", "protein", t("protein")],
                  ["oil", "oil", t("oil")],
                ] as const
              ).map(([key, field, label]) => (
                <Field key={key} label={`${label} (±)`}>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    placeholder={String(r.summary.tolerances[field])}
                    value={tol[key]}
                    onChange={(e) => setTol({ ...tol, [key]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
          </Card>
          {r.samples.length > 0 && (
            <Card title={t("samples")}>
              <ul className="list">
                {r.samples.map((s) => (
                  <li key={s.id}>
                    <Link to={`/app/samples/${s.id}`} className="list-item">
                      <span>
                        #{s.number}
                        {s.enamLotId && ` · ${s.enamLotId}`} ·{" "}
                        {s.standardName ?? t("noStandard")}
                        {(s.lab || s.reportNo) && (
                          <span className="muted small">
                            {" "}
                            · {[s.lab, s.reportNo].filter(Boolean).join(" ")}
                          </span>
                        )}
                      </span>
                      <span>
                        {t("versus", {
                          method: s.methodGrade ?? "—",
                          reference: s.referenceGrade ?? "—",
                        })}{" "}
                        {s.methodGrade === s.referenceGrade ? (
                          <Badge tone="good">{t("match")}</Badge>
                        ) : (
                          <Badge tone="bad">{t("differs")}</Badge>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Pager
                total={r.total}
                limit={SAMPLES_PAGE}
                page={page}
                onPage={setPage}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
