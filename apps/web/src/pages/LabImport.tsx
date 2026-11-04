import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { Badge, Card, ErrorNote, Field } from "../components/ui";
import { useT } from "../i18n";
import { m } from "./LabImport.i18n";

interface Answer {
  applied: number;
  ignoredColumns: string[];
  rows: {
    line: number;
    sampleNumber: number | null;
    lotId: string | null;
    sampleId: string | null;
    classes: number;
    error: string | null;
  }[];
}

/** A reference lab's results for many samples (CSV): preview, then save. */
export function LabImport({ onClose }: { onClose: () => void }) {
  const t = useT(m);
  const qc = useQueryClient();
  const [csv, setCsv] = useState("");
  const send = useMutation({
    mutationFn: (apply: boolean) =>
      api.post<Answer>("/validation/import", { csv, apply }),
    onSuccess: (a) => {
      if (a.applied) void qc.invalidateQueries({ queryKey: ["validation"] });
    },
  });
  const rows = send.data?.rows ?? [];
  const ready = rows.filter((r) => r.sampleId && !r.error).length;
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
      {(send.data?.ignoredColumns.length ?? 0) > 0 && (
        <p className="warn small">
          {t("ignored", { list: send.data!.ignoredColumns.join(", ") })}
        </p>
      )}
      {rows.length > 0 && (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th className="num">{t("line")}</th>
                <th>{t("sample")}</th>
                <th className="num">{t("classes")}</th>
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
                  <td className="num">{r.classes}</td>
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
