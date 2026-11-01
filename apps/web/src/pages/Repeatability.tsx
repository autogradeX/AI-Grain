import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Badge, Card, ErrorNote, Spinner } from "../components/ui";
import { useT } from "../i18n";
import { m } from "./Repeatability.i18n";

type Band = "99+" | "97-99" | "95-97" | "below95";

interface RepeatabilityReport {
  pairs: {
    crop: string;
    first: { id: string; number: number };
    repeat: { id: string; number: number };
    agreementPct: number;
    maxDiffPct: number;
    band: Band;
  }[];
  summary: {
    count: number;
    meanAgreementPct: number | null;
    minAgreementPct: number | null;
    bands: Record<Band, number>;
  };
}

const TONE: Record<Band, "good" | "warn" | "bad"> = {
  "99+": "good",
  "97-99": "warn",
  "95-97": "warn",
  below95: "bad",
};

/** How closely repeat runs of the same sample agree, per crop. */
export function RepeatabilityCard({ crop }: { crop: string }) {
  const t = useT(m);
  const report = useQuery({
    queryKey: ["repeatability", crop],
    queryFn: () =>
      api.get<RepeatabilityReport>(
        `/validation/repeatability?crop=${encodeURIComponent(crop)}`,
      ),
  });
  const r = report.data;
  const bandLabel: Record<Band, string> = {
    "99+": t("band99"),
    "97-99": t("band97"),
    "95-97": t("band95"),
    below95: t("bandLow"),
  };
  return (
    <Card title={t("title")}>
      <p className="muted small">{t("intro")}</p>
      {report.isPending && <Spinner />}
      <ErrorNote error={report.error} />
      {r && r.summary.count === 0 && <p className="muted">{t("none")}</p>}
      {r && r.summary.count > 0 && (
        <>
          <div className="kpis">
            <div>
              <div className="result-grade">
                {r.summary.meanAgreementPct!.toFixed(2)} %
              </div>
              <div className="muted small">
                {t("mean")} · {t.n("pairs", r.summary.count)}
              </div>
            </div>
            <div>
              <div className="result-grade">
                {r.summary.minAgreementPct!.toFixed(2)} %
              </div>
              <div className="muted small">{t("lowest")}</div>
            </div>
          </div>
          <div className="row wrap small">
            {(Object.keys(bandLabel) as Band[]).map((b) => (
              <span key={b} className="row">
                <Badge tone={TONE[b]}>{bandLabel[b]}</Badge>
                <span className="muted">×{r.summary.bands[b]}</span>
              </span>
            ))}
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="num">{t("agreement")}</th>
                  <th className="num">{t("maxDiff")}</th>
                </tr>
              </thead>
              <tbody>
                {r.pairs.map((p) => (
                  <tr key={p.repeat.id}>
                    <td>
                      <Link to={`/app/samples/${p.repeat.id}`}>
                        {t("pair", {
                          first: p.first.number,
                          repeat: p.repeat.number,
                        })}
                      </Link>
                    </td>
                    <td className="num">
                      <Badge tone={TONE[p.band]}>
                        {p.agreementPct.toFixed(2)} %
                      </Badge>
                    </td>
                    <td className="num">
                      {t("points", { value: p.maxDiffPct.toFixed(2) })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
