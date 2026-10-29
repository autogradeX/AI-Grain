import { classLabel } from "@ai-grain/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useCrop } from "../api/crops";
import { CropSelect } from "../components/CropSelect";
import type { ValidationReport } from "../api/types";
import { Badge, Card, ErrorNote, Field, Spinner } from "../components/ui";

const f = (v: number) => v.toFixed(2);

export function ValidationPage() {
  const [crop, setCrop] = useState("wheat");
  const report = useQuery({
    queryKey: ["validation", crop],
    queryFn: () =>
      api.get<ValidationReport>(`/validation?crop=${encodeURIComponent(crop)}`),
  });
  const classes = useCrop(crop)?.classes ?? [];
  const r = report.data;
  const n = r?.summary.samples ?? 0;

  return (
    <div className="stack">
      <h1>Validation</h1>
      <p className="muted small">
        Claude is a general-purpose AI, not trained on your grain, so its
        accuracy is unknown until tested. Grade 30–50 samples both ways (a
        certified grader and this method), enter the grader's result on each
        sample, and compare per class here before relying on the results.
      </p>
      <Field label="Crop">
        <CropSelect value={crop} onChange={setCrop} />
      </Field>
      {report.isPending && <Spinner />}
      <ErrorNote error={report.error} />
      {r && (
        <>
          <Card title="Progress">
            <div
              className="progress"
              aria-label={`${n} of ${r.target.recommended} samples`}
            >
              <div
                style={{
                  width: `${Math.min(100, (n / r.target.recommended) * 100)}%`,
                }}
              />
            </div>
            <p>
              {n} sample{n === 1 ? "" : "s"} graded both ways.{" "}
              {n < r.target.min ? (
                <Badge tone="warn">
                  At least {r.target.min - n} more needed
                </Badge>
              ) : (
                <Badge tone="good">Enough for a first assessment</Badge>
              )}
            </p>
            {r.summary.gradeAgreement !== null && (
              <p>
                Same grade as the certified grader in{" "}
                <strong>{Math.round(r.summary.gradeAgreement * 100)} %</strong>{" "}
                of {r.summary.gradeComparable} samples.
              </p>
            )}
          </Card>
          {r.summary.byClass.length > 0 && (
            <Card title="Agreement per defect class (mass %)">
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>n</th>
                      <th>Method mean</th>
                      <th>Grader mean</th>
                      <th>Bias</th>
                      <th>Mean abs. diff.</th>
                      <th>Max abs. diff.</th>
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
              <p className="muted small">
                Bias is method minus grader: positive means this method reads
                high. Expect subtle defects (light heat damage, early sprouting,
                Fusarium versus weather bleaching) to agree least. Internal and
                fluorescent defects are invisible in a phone photo.
              </p>
            </Card>
          )}
          {r.samples.length > 0 && (
            <Card title="Samples">
              <ul className="list">
                {r.samples.map((s) => (
                  <li key={s.id}>
                    <Link to={`/app/samples/${s.id}`} className="list-item">
                      <span>
                        #{s.number} · {s.standardName ?? "no standard"}
                      </span>
                      <span>
                        {s.methodGrade ?? "—"} vs {s.referenceGrade ?? "—"}{" "}
                        {s.methodGrade === s.referenceGrade ? (
                          <Badge tone="good">match</Badge>
                        ) : (
                          <Badge tone="bad">differs</Badge>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
