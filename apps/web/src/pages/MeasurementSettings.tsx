import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { Org } from "../api/types";
import { Card, ErrorNote, Field } from "../components/ui";
import { useT } from "../i18n";
import { m } from "./MeasurementSettings.i18n";

/** Current Indian coins (2019 series), by face value, with their diameters. */
const COINS: { label: string; mm: number }[] = [
  { label: "₹1 (2019 series) · 20 mm", mm: 20 },
  { label: "₹2 (2019 series) · 23 mm", mm: 23 },
  { label: "₹5 (2019 series) · 25 mm", mm: 25 },
  { label: "₹10 (2019 series) · 27 mm", mm: 27 },
];

function Form({ initial }: { initial: number | null }) {
  const t = useT(m);
  const qc = useQueryClient();
  const preset = COINS.some((c) => c.mm === initial);
  const [choice, setChoice] = useState(
    initial === null ? "none" : preset ? String(initial) : "custom",
  );
  const [custom, setCustom] = useState(
    initial !== null && !preset ? String(initial) : "",
  );
  const value =
    choice === "none"
      ? null
      : choice === "custom"
        ? Number(custom) || null
        : Number(choice);
  const save = useMutation({
    mutationFn: () =>
      api.patch("/org", { measurement: { referenceMm: value } }),
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
        <Field label={t("coin")}>
          <select value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="none">{t("none")}</option>
            {COINS.map((c) => (
              <option key={c.mm} value={String(c.mm)}>
                {c.label}
              </option>
            ))}
            <option value="custom">{t("custom")}</option>
          </select>
        </Field>
        {choice === "custom" && (
          <Field label={t("diameter")}>
            <input
              type="number"
              min={5}
              max={100}
              step={0.1}
              inputMode="decimal"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          </Field>
        )}
      </div>
      <p className="muted small">{t("hint")}</p>
      <ErrorNote error={save.error} />
      {save.isSuccess && <p className="good small">{t("saved")}</p>}
      <div>
        <button
          className="primary"
          disabled={save.isPending || (choice === "custom" && !value)}
        >
          {t("save")}
        </button>
      </div>
    </form>
  );
}

/** Admin setting: the reference coin that gives kernel sizes without the board. */
export function MeasurementSettingsCard() {
  const t = useT(m);
  const org = useQuery({
    queryKey: ["org"],
    queryFn: () => api.get<Org>("/org"),
  });
  return (
    <Card title={t("title")}>
      <p className="muted small">{t("intro")}</p>
      <ErrorNote error={org.error} />
      {org.data && <Form initial={org.data.measurement.referenceMm ?? null} />}
    </Card>
  );
}
