import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { Org, ReportSettings } from "../api/types";
import { Card, ErrorNote, Field } from "../components/ui";
import { useT } from "../i18n";
import { m } from "./ReportLayout.i18n";

type Toggle = "showBoards" | "showGallery" | "showDimensions" | "showSummary";
const TOGGLES: Toggle[] = [
  "showBoards",
  "showGallery",
  "showDimensions",
  "showSummary",
];

function LayoutForm({ initial }: { initial: ReportSettings }) {
  const t = useT(m);
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: initial.title ?? "",
    header: initial.header ?? "",
    footer: initial.footer ?? "",
    signatures: (initial.signatures ?? []).join("\n"),
    ...Object.fromEntries(TOGGLES.map((k) => [k, initial[k] !== false])),
  } as Record<"title" | "header" | "footer" | "signatures", string> &
    Record<Toggle, boolean>);
  const save = useMutation({
    mutationFn: () =>
      api.patch("/org", {
        report: {
          ...(form.title.trim() && { title: form.title.trim() }),
          ...(form.header.trim() && { header: form.header.trim() }),
          ...(form.footer.trim() && { footer: form.footer.trim() }),
          signatures: form.signatures
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 4),
          ...Object.fromEntries(TOGGLES.map((k) => [k, form[k]])),
        },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["org"] }),
  });
  return (
    <form
      className="stack-sm"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid-2">
        <Field label={t("reportTitle")}>
          <input
            maxLength={120}
            placeholder={t("titlePlaceholder")}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>
        <Field label={t("footer")}>
          <input
            maxLength={300}
            value={form.footer}
            onChange={(e) => setForm({ ...form, footer: e.target.value })}
          />
        </Field>
        <Field label={t("header")} hint={t("headerHint")}>
          <textarea
            rows={3}
            maxLength={600}
            value={form.header}
            onChange={(e) => setForm({ ...form, header: e.target.value })}
          />
        </Field>
        <Field label={t("signatures")} hint={t("signaturesHint")}>
          <textarea
            rows={3}
            value={form.signatures}
            onChange={(e) => setForm({ ...form, signatures: e.target.value })}
          />
        </Field>
      </div>
      {TOGGLES.map((k) => (
        <label key={k} className="row small">
          <input
            type="checkbox"
            checked={form[k]}
            onChange={(e) => setForm({ ...form, [k]: e.target.checked })}
          />
          {t(k)}
        </label>
      ))}
      <ErrorNote error={save.error} />
      {save.isSuccess && <p className="good small">{t("saved")}</p>}
      <div>
        <button className="primary" disabled={save.isPending}>
          {t("save")}
        </button>
      </div>
    </form>
  );
}

/** Admin setting: the PDF report's and slip's title, lines and sections. */
export function ReportLayoutCard() {
  const t = useT(m);
  const org = useQuery({
    queryKey: ["org"],
    queryFn: () => api.get<Org>("/org"),
  });
  return (
    <Card title={t("title")}>
      <p className="muted small">{t("intro")}</p>
      <ErrorNote error={org.error} />
      {org.data && <LayoutForm initial={org.data.report} />}
    </Card>
  );
}
