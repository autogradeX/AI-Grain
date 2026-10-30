import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pager, usePage } from "../components/Pager";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useCrop } from "../api/crops";
import { CropSelect } from "../components/CropSelect";
import type { ValidationReport } from "../api/types";
import { Badge, Card, ErrorNote, Field, Spinner } from "../components/ui";
import { useT } from "../i18n";
import { useGrainLabels } from "../i18n/common";
import { m } from "./ValidationPage.i18n";

const f = (v: number) => v.toFixed(2);

const SAMPLES_PAGE = 25;

export function ValidationPage() {
  const [crop, setCrop] = useState("wheat");
  const [page, setPage] = usePage();
  const t = useT(m);
  const { classLabel } = useGrainLabels();
  const report = useQuery({
    queryKey: ["validation", crop, page],
    placeholderData: keepPreviousData,
    queryFn: () =>
      api.get<ValidationReport>(
        `/validation?crop=${encodeURIComponent(crop)}&limit=${SAMPLES_PAGE}&offset=${page * SAMPLES_PAGE}`,
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted small">{t("biasNote")}</p>
            </Card>
          )}
          {r.samples.length > 0 && (
            <Card title={t("samples")}>
              <ul className="list">
                {r.samples.map((s) => (
                  <li key={s.id}>
                    <Link to={`/app/samples/${s.id}`} className="list-item">
                      <span>
                        #{s.number} · {s.standardName ?? t("noStandard")}
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
