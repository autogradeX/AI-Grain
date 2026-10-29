import { CLASS_GROUPS, GROUP_LABELS, type ClassGroup } from "@ai-grain/core";
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
        aria-label="Certificate code"
        placeholder="XXXX-XXXX-XXXX"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        style={{ maxWidth: 260 }}
      />
      <button className="primary">Check</button>
    </form>
  );

  return (
    <div className="public">
      <div className="content stack">
        <Link to="/" className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} /> AI-Grain
        </Link>
        <h1>Verify a grain report</h1>
        <p className="muted">
          Enter the code printed beside the QR code on the report, or scan the
          QR code. This page shows the figures the report was issued with, so
          you can check that a printout or PDF hasn't been changed.
        </p>
        {form}
        {v.isFetching && <Spinner label="Checking…" />}
        {v.error instanceof ApiError && v.error.status === 404 ? (
          <Card>
            <Badge tone="bad">Not found</Badge>
            <p>
              No report was issued with the code {code}. Check the code and try
              again.
            </p>
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
  return (
    <>
      <Card>
        <div className="verify-status">
          {!v.intact ? (
            <Badge tone="bad">Record altered</Badge>
          ) : v.status === "valid" ? (
            <Badge tone="good">Valid</Badge>
          ) : (
            <Badge tone="warn">Withdrawn</Badge>
          )}
          <strong>{v.code}</strong>
          <span className="muted small">version {p.version}</span>
        </div>
        {ok && (
          <p>
            This report was issued by {p.organisation} and has not been
            withdrawn.
          </p>
        )}
        {!v.intact && (
          <p className="error">
            The stored record no longer matches the fingerprint it was issued
            with. Do not rely on this report; contact {p.organisation}.
          </p>
        )}
        {v.status === "withdrawn" && (
          <p>
            Withdrawn {formatDate(v.withdrawnAt)}
            {v.withdrawnReason && `: ${v.withdrawnReason}`}
            {v.newerVersion && (
              <>
                {" "}
                A newer version exists:{" "}
                <Link to={`/verify/${v.newerVersion.code}`}>
                  {v.newerVersion.code} (version {v.newerVersion.version})
                </Link>
                .
              </>
            )}
          </p>
        )}
        <dl className="facts">
          <dt>Issued</dt>
          <dd>{formatDate(v.issuedAt)}</dd>
          <dt>Sample</dt>
          <dd>
            #{p.sample.number} · {p.sample.crop}
            {p.sample.source && ` · ${p.sample.source}`}
          </dd>
          <dt>Standard</dt>
          <dd>{p.sample.standard ?? "none"}</dd>
          <dt>Grade</dt>
          <dd>
            <strong>
              {p.result.grade ?? (p.sample.standard ? "below all grades" : "—")}
            </strong>
          </dd>
          <dt>Purity</dt>
          <dd>{pct(p.result.purityPct)}</dd>
          <dt>Method</dt>
          <dd>
            {p.result.source === "estimate"
              ? "Estimated from photos (not weighed)"
              : "Weighed"}
            ; kernels flagged by {p.model}, {p.kernels.reviewed} of{" "}
            {p.kernels.flagged} flagged kernels checked by{" "}
            {p.operators.join(", ")}
          </dd>
          {p.measurements.sampleMassG !== null && (
            <>
              <dt>Sample mass</dt>
              <dd>{p.measurements.sampleMassG} g</dd>
            </>
          )}
          {p.measurements.moisturePct !== null && (
            <>
              <dt>Moisture</dt>
              <dd>{pct(p.measurements.moisturePct, 1)}</dd>
            </>
          )}
          <dt>Fingerprint</dt>
          <dd className="break small">SHA-256 {v.payloadHash}</dd>
        </dl>
      </Card>
      <Card title="Composition (mass %)">
        <table className="table">
          <tbody>
            {CLASS_GROUPS.map((g: ClassGroup) => (
              <tr key={g} className="group-row">
                <td>{GROUP_LABELS[g]}</td>
                <td className="num">{pct(p.result.byGroupPct[g])}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Total defects</td>
              <td className="num">{pct(p.result.totalDefectsPct)}</td>
            </tr>
          </tbody>
        </table>
        <details>
          <summary className="small">Every class</summary>
          <table className="table small">
            <tbody>
              {p.result.byClassPct.map((c) => (
                <tr key={c.id}>
                  <td>{c.label}</td>
                  <td className="num">{pct(c.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>
      <p className="muted small">
        A screening and pre-check result, not an official trade grade unless the
        issuer's method has been validated and approved.
      </p>
    </>
  );
}
