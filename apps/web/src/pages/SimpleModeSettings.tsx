import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useCrops } from "../api/crops";
import type { Org, SimpleModeSettings, Standard } from "../api/types";
import { Card, ErrorNote, Field, formatDate } from "../components/ui";
import { LANGS, useT } from "../i18n";
import { useGrainLabels } from "../i18n/common";
import { m } from "./SimpleModeSettings.i18n";

/** Admins set up the station's Simple mode once. */
export function SimpleModeCard() {
  const t = useT(m);
  const qc = useQueryClient();
  const { cropLabel } = useGrainLabels();
  const org = useQuery({
    queryKey: ["org"],
    queryFn: () => api.get<Org>("/org"),
  });
  const crops = useCrops();
  const standards = useQuery({
    queryKey: ["standards"],
    queryFn: () => api.get<Standard[]>("/standards"),
  });
  const [form, setForm] = useState<SimpleModeSettings | null>(null);
  const value: SimpleModeSettings = form ?? org.data?.simpleMode ?? {};
  const set = (patch: Partial<SimpleModeSettings>) =>
    setForm({ ...value, ...patch });
  const save = useMutation({
    mutationFn: () => api.patch("/org", { simpleMode: value }),
    onSuccess: () => {
      setForm(null);
      void qc.invalidateQueries({ queryKey: ["org"] });
    },
  });
  const chosen = value.crops ?? [];
  const toggle = (key: string) =>
    set({
      crops: chosen.includes(key)
        ? chosen.filter((c) => c !== key)
        : [...chosen, key],
    });
  const check = (key: keyof SimpleModeSettings, label: string) => (
    <label className="row small">
      <input
        type="checkbox"
        checked={!!value[key]}
        onChange={(e) => set({ [key]: e.target.checked })}
      />
      {label}
    </label>
  );

  return (
    <Card
      title={t("title")}
      actions={
        <Link to="/simple" className="button">
          {t("open")}
        </Link>
      }
    >
      <p className="muted small">{t("hint")}</p>
      <Field label={t("crops")}>
        <div className="stack-sm">
          {crops.data?.map((c) => (
            <div key={c.key} className="simple-crop-row">
              <label className="row small">
                <input
                  type="checkbox"
                  checked={chosen.includes(c.key)}
                  onChange={() => toggle(c.key)}
                />
                {cropLabel(c.label)}
              </label>
              {chosen.includes(c.key) && (
                <select
                  aria-label={t("standard")}
                  value={value.standards?.[c.key] ?? ""}
                  onChange={(e) => {
                    const next = { ...value.standards };
                    if (e.target.value) next[c.key] = e.target.value;
                    else delete next[c.key];
                    set({ standards: next });
                  }}
                >
                  <option value="">{t("none")}</option>
                  {standards.data
                    ?.filter((s) => s.crop === c.key && !s.archived)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              )}
            </div>
          ))}
        </div>
      </Field>
      <div className="grid-2">
        <Field label={t("capture")}>
          <select
            value={value.capture ?? "two"}
            onChange={(e) => set({ capture: e.target.value as "two" | "one" })}
          >
            <option value="two">{t("captureTwo")}</option>
            <option value="one">{t("captureOne")}</option>
          </select>
        </Field>
        <Field label={t("language")}>
          <select
            value={value.language ?? ""}
            onChange={(e) => set({ language: e.target.value })}
          >
            <option value="">—</option>
            {Object.entries(LANGS).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="stack-sm">
        {check("weigh", t("weigh"))}
        {check("moisture", t("moisture"))}
        {check("autoPrint", t("autoPrint"))}
        {check("askFarmer", t("askFarmer"))}
        {check("locked", t("locked"))}
      </div>
      <p className="muted small">{t("kiosk")}</p>
      <ErrorNote error={save.error} />
      <div className="row">
        <button
          className="primary"
          disabled={!form || save.isPending}
          onClick={() => save.mutate()}
        >
          {t("save")}
        </button>
        {save.isSuccess && !form && (
          <span className="good small">{t("saved")}</span>
        )}
      </div>
    </Card>
  );
}

interface HelpReport {
  id: string;
  note: string | null;
  diagnostics: Record<string, unknown>;
  createdAt: string;
  userName: string | null;
}

/** The help reports the station's operators sent (and, on a central server, its stations). */
export function HelpReportsCard() {
  const t = useT(m);
  const reports = useQuery({
    queryKey: ["help-reports"],
    queryFn: () => api.get<{ items: HelpReport[] }>("/station/help"),
  });
  return (
    <Card title={t("helpTitle")}>
      {reports.data?.items.length === 0 && (
        <p className="muted">{t("helpNone")}</p>
      )}
      <ul className="list">
        {reports.data?.items.map((r) => (
          <li key={r.id}>
            <details>
              <summary>
                {typeof r.diagnostics.station === "string" &&
                  `${t("station", { name: r.diagnostics.station })} · `}
                {t("helpBy", {
                  name: r.userName ?? "—",
                  date: formatDate(r.createdAt),
                })}
                {r.note && ` · “${r.note}”`}
              </summary>
              <pre className="small break">
                {JSON.stringify(r.diagnostics, null, 2)}
              </pre>
            </details>
          </li>
        ))}
      </ul>
    </Card>
  );
}
