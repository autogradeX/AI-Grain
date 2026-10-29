import { CLASS_GROUPS, type ClassGroup } from "@ai-grain/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import {
  Badge,
  Card,
  ErrorNote,
  formatDate,
  pct,
  Spinner,
} from "../components/ui";
import { useLang, useT } from "../i18n";
import { presetLabel, useGrainLabels } from "../i18n/common";
import { m } from "./VerifyPage.i18n";

interface Verification {
  code: string;
  status: "valid" | "withdrawn";
  intact: boolean;
  payloadHash: string;
  issuedAt: string;
  withdrawnAt: string | null;
  withdrawnReason: string | null;
  newerVersion: { code: string; version: number } | null;
  payload: {
    version: number;
    organisation: string;
    sample: {
      number: number;
      crop: string;
      source: string | null;
      standard: string | null;
    };
    result: {
      source: "weighed" | "estimate";
      grade: string | null;
      purityPct: number;
      totalDefectsPct: number;
      byGroupPct: Record<string, number>;
      byClassPct: { id: string; label: string; group: string; pct: number }[];
    };
    measurements: {
      sampleMassG: number | null;
      moisturePct: number | null;
      testWeightKgPerHl: number | null;
    };
    kernels: { total: number; flagged: number; reviewed: number };
    model: string;
    operators: string[];
    completedAt: string;
  };
}

/** Public page: checks a report's certificate code. No sign-in needed. */
export function VerifyPage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  const t = useT(m);
  const v = useQuery({
    queryKey: ["verify", code],
    queryFn: () =>
      api.get<Verification>(`/public/verify/${encodeURIComponent(code)}`),
    enabled: code.length > 0,
    retry: false,
  });

  const form = (
    <form
      className="row wrap"
      onSubmit={(e) => {
        e.preventDefault();
        void navigate(`/verify/${encodeURIComponent(typed.trim())}`);
      }}
    >
      <input
        aria-label={t("codeLabel")}
        placeholder="XXXX-XXXX-XXXX"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        style={{ maxWidth: 260 }}
      />
      <button className="primary">{t("check")}</button>
    </form>
  );

  return (
    <div className="site-page">
      <div className="site-section narrow stack">
        <h1>{t("title")}</h1>
        <p className="muted">{t("intro")}</p>
        {form}
        {v.isFetching && <Spinner label={t("checking")} />}
        {v.error instanceof ApiError && v.error.status === 404 ? (
          <Card>
            <Badge tone="bad">{t("notFound")}</Badge>
            <p>{t("notFoundText", { code })}</p>
          </Card>
        ) : (
          <ErrorNote error={v.error} />
        )}
        {v.data && <Result v={v.data} />}
      </div>
    </div>
  );
}

function Result({ v }: { v: Verification }) {
  const p = v.payload;
  const ok = v.status === "valid" && v.intact;
  const t = useT(m);
  const { lang } = useLang();
  const { groupLabel, cropLabel } = useGrainLabels();
  return (
    <>
      <Card>
        <div className="verify-status">
          {!v.intact ? (
            <Badge tone="bad">{t("altered")}</Badge>
          ) : v.status === "valid" ? (
            <Badge tone="good">{t("valid")}</Badge>
          ) : (
            <Badge tone="warn">{t("withdrawn")}</Badge>
          )}
          <strong>{v.code}</strong>
          <span className="muted small">
            {t("version", { version: p.version })}
          </span>
        </div>
        {ok && <p>{t("issuedBy", { organisation: p.organisation })}</p>}
        {!v.intact && (
          <p className="error">
            {t("alteredText", { organisation: p.organisation })}
          </p>
        )}
        {v.status === "withdrawn" && (
          <p>
            {t("withdrawnOn", { date: formatDate(v.withdrawnAt) })}
            {v.withdrawnReason && `: ${v.withdrawnReason}`}
            {v.newerVersion && (
              <>
                {" "}
                {t.rich("newerVersion", {
                  link: (
                    <Link to={`/verify/${v.newerVersion.code}`}>
                      {t("newerLink", {
                        code: v.newerVersion.code,
                        version: v.newerVersion.version,
                      })}
                    </Link>
                  ),
                })}
              </>
            )}
          </p>
        )}
        <dl className="facts">
          <dt>{t("issued")}</dt>
          <dd>{formatDate(v.issuedAt)}</dd>
          <dt>{t("sample")}</dt>
          <dd>
            #{p.sample.number} · {cropLabel(p.sample.crop)}
            {p.sample.source && ` · ${p.sample.source}`}
          </dd>
          <dt>{t("standard")}</dt>
          <dd>{p.sample.standard ?? t("none")}</dd>
          <dt>{t("grade")}</dt>
          <dd>
            <strong>
              {p.result.grade ?? (p.sample.standard ? t("belowAll") : "—")}
            </strong>
          </dd>
          <dt>{t("purity")}</dt>
          <dd>{pct(p.result.purityPct)}</dd>
          <dt>{t("method")}</dt>
          <dd>
            {t("methodDetail", {
              source:
                p.result.source === "estimate" ? t("estimated") : t("weighed"),
              model: p.model,
              reviewed: p.kernels.reviewed,
              flagged: p.kernels.flagged,
              operators: p.operators.join(", "),
            })}
          </dd>
          {p.measurements.sampleMassG !== null && (
            <>
              <dt>{t("sampleMass")}</dt>
              <dd>{p.measurements.sampleMassG} g</dd>
            </>
          )}
          {p.measurements.moisturePct !== null && (
            <>
              <dt>{t("moisture")}</dt>
              <dd>{pct(p.measurements.moisturePct, 1)}</dd>
            </>
          )}
          <dt>{t("fingerprint")}</dt>
          <dd className="break small">SHA-256 {v.payloadHash}</dd>
        </dl>
      </Card>
      <Card title={t("composition")}>
        <table className="table">
          <tbody>
            {CLASS_GROUPS.map((g: ClassGroup) => (
              <tr key={g} className="group-row">
                <td>{groupLabel(g)}</td>
                <td className="num">{pct(p.result.byGroupPct[g])}</td>
              </tr>
            ))}
            <tr className="total">
              <td>{t("totalDefects")}</td>
              <td className="num">{pct(p.result.totalDefectsPct)}</td>
            </tr>
          </tbody>
        </table>
        <details>
          <summary className="small">{t("everyClass")}</summary>
          <table className="table small">
            <tbody>
              {p.result.byClassPct.map((c) => (
                <tr key={c.id}>
                  <td>{presetLabel(c.label, lang)}</td>
                  <td className="num">{pct(c.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>
      <p className="muted small">{t("disclaimer")}</p>
    </>
  );
}
