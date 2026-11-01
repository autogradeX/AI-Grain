import { useMutation } from "@tanstack/react-query";
import { FileJson, Printer, Repeat2, Receipt } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api, download, printFile } from "../api/client";
import type { Sample } from "../api/types";
import { useCan } from "../auth/AuthContext";
import { Badge, Card, ErrorNote } from "../components/ui";
import { useT } from "../i18n";
import { m } from "./SampleExtras.i18n";

const n2 = (v: number) => v.toFixed(2);

/** Mean length, breadth and L/B of the sound kernels, from the photos. */
export function KernelSizeCard({ sample }: { sample: Sample }) {
  const t = useT(m);
  const d = sample.dimensions;
  if (!d) return null;
  return (
    <Card title={t("sizeTitle")}>
      <div className="kpis kernel-size">
        <div>
          <div className="result-grade">
            {t("mm", { value: n2(d.meanLengthMm) })}
          </div>
          <div className="muted small">
            {t("length")} · {t("spread", { value: n2(d.sdLengthMm) })}
          </div>
        </div>
        <div>
          <div className="result-grade">
            {t("mm", { value: n2(d.meanBreadthMm) })}
          </div>
          <div className="muted small">
            {t("breadth")} · {t("spread", { value: n2(d.sdBreadthMm) })}
          </div>
        </div>
        <div>
          <div className="result-grade">{n2(d.meanLb)}</div>
          <div className="muted small">{t("lb")}</div>
        </div>
        <div>
          <div className="result-grade">
            {n2(d.minLengthMm)}–{n2(d.maxLengthMm)}
          </div>
          <div className="muted small">
            {t("range")} ({t("length").toLowerCase()}, mm)
          </div>
        </div>
      </div>
      <p className="muted small">{t("sizeNote", { count: d.kernels })}</p>
    </Card>
  );
}

const tone = (pct: number) => (pct >= 99 ? "good" : pct >= 95 ? "warn" : "bad");

/** Other runs of the same physical sample, and how closely they agree. */
export function RepeatCard({ sample }: { sample: Sample }) {
  const t = useT(m);
  const can = useCan();
  const navigate = useNavigate();
  const repeat = useMutation({
    mutationFn: () => api.post<{ id: string }>(`/samples/${sample.id}/repeat`),
    onSuccess: (s) => void navigate(`/app/samples/${s.id}`),
  });
  const runs = sample.repeat.runs;
  if (!runs.length && sample.batches.length === 0) return null;
  return (
    <Card
      title={t("repeatTitle")}
      actions={
        can.write && (
          <button disabled={repeat.isPending} onClick={() => repeat.mutate()}>
            <Repeat2 size={16} aria-hidden /> {t("repeatButton")}
          </button>
        )
      }
    >
      <p className="muted small">{t("repeatHint")}</p>
      {runs.length > 0 && (
        <ul className="list">
          {runs.map((r) => (
            <li key={r.id}>
              <Link className="list-item" to={`/app/samples/${r.id}`}>
                <strong>{t("runOf", { number: r.number })}</strong>
                {r.comparison ? (
                  <span className="row">
                    <Badge tone={tone(r.comparison.agreementPct)}>
                      {t("agreement", { pct: n2(r.comparison.agreementPct) })}
                    </Badge>
                    <span className="muted small">
                      {t("maxDiff", { diff: n2(r.comparison.maxDiffPct) })}
                    </span>
                  </span>
                ) : (
                  <span className="muted small">{t("notYet")}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={repeat.error} />
    </Card>
  );
}

/** Print the report or an 80 mm slip, or download the result for eNAM / ERP. */
export function OutputButtons({ sample }: { sample: Sample }) {
  const t = useT(m);
  const print = useMutation({
    mutationFn: (format: "a4" | "slip") =>
      printFile(`/samples/${sample.id}/report.pdf?format=${format}`),
  });
  const file = useMutation({
    mutationFn: () =>
      download(
        `/samples/${sample.id}/result.json`,
        `sample-${sample.number}-result.json`,
      ),
  });
  return (
    <>
      <button disabled={print.isPending} onClick={() => print.mutate("a4")}>
        <Printer size={16} aria-hidden /> {t("printReport")}
      </button>
      <button disabled={print.isPending} onClick={() => print.mutate("slip")}>
        <Receipt size={16} aria-hidden /> {t("printSlip")}
      </button>
      {sample.status === "completed" && (
        <button disabled={file.isPending} onClick={() => file.mutate()}>
          <FileJson size={16} aria-hidden /> {t("resultFile")}
        </button>
      )}
      <ErrorNote error={print.error ?? file.error} />
    </>
  );
}
