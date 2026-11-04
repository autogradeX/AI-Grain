import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { Badge, Card, ErrorNote, Field } from "../components/ui";
import { useT } from "../i18n";
import { m } from "./MeasurementImport.i18n";

interface ImportRow {
  line: number;
  sampleNumber: number | null;
  lotId: string | null;
  values: Partial<Record<"protein" | "oil" | "moisture", number>>;
  sampleId: string | null;
  error: string | null;
}
interface ImportAnswer {
  columns: string[];
  rows: ImportRow[];
  applied: number;
}

/** Protein, oil and moisture from an instrument's CSV: preview, then apply. */
export function MeasurementImport({ onClose }: { onClose: () => void }) {
  const t = useT(m);
  const qc = useQueryClient();
  const [csv, setCsv] = useState("");
  const send = useMutation({
    mutationFn: (apply: boolean) =>
      api.post<ImportAnswer>("/samples/measurements/import", { csv, apply }),
    onSuccess: (answer) => {
      if (answer.applied) void qc.invalidateQueries({ queryKey: ["samples"] });
    },
  });
  const rows = send.data?.rows ?? [];
  const ready = rows.filter((r) => r.sampleId).length;
  const applied = send.data?.applied ?? 0;

  return (
    <Card
      title={t("title")}
      actions={<button onClick={onClose}>{t("close")}</button>}
    >
      <p className="muted small">{t("hint")}</p>
      <div className="row wrap">
        <Field label={t("file")}>
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0];
              send.reset();
              if (file) void file.text().then(setCsv);
            }}
          />
        </Field>
        <button
          disabled={!csv || send.isPending}
          onClick={() => send.mutate(false)}
        >
          {t("preview")}
        </button>
        {ready > 0 && !applied && (
          <button
            className="primary"
            disabled={send.isPending}
            onClick={() => send.mutate(true)}
          >
            {t("apply", { count: ready })}
          </button>
        )}
      </div>
      <ErrorNote error={send.error} />
      {applied > 0 && (
        <p className="small">{t("applied", { count: applied })}</p>
      )}
      {rows.length > 0 && (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th className="num">{t("line")}</th>
                <th>{t("sample")}</th>
                <th>{t("values")}</th>
                <th>{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line}>
                  <td className="num">{r.line}</td>
                  <td>
                    {r.sampleNumber !== null && `#${r.sampleNumber}`}
                    {r.lotId && ` ${r.lotId}`}
                  </td>
                  <td>
                    {Object.entries(r.values)
                      .map(([k, v]) => `${t(k as "protein")} ${v} %`)
                      .join(", ")}
                  </td>
                  <td>
                    {r.error ? (
                      <span className="warn small">{r.error}</span>
                    ) : (
                      <Badge tone="good">{t("ready")}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
