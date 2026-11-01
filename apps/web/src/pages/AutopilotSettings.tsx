import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { AutopilotPolicy, Org } from "../api/types";
import { useCan } from "../auth/AuthContext";
import { Card, ErrorNote, Field } from "../components/ui";
import { useT } from "../i18n";
import { m } from "./AutopilotSettings.i18n";

/** Organisation setting: how much the AI does on its own. */
export function AutopilotSettingsCard() {
  const t = useT(m);
  const can = useCan();
  const qc = useQueryClient();
  const org = useQuery({
    queryKey: ["org"],
    queryFn: () => api.get<Org>("/org"),
  });
  const [spot, setSpot] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (autopilot: Partial<AutopilotPolicy>) =>
      api.patch("/org", { autopilot }),
    onSuccess: () => {
      setSpot(null);
      void qc.invalidateQueries({ queryKey: ["org"] });
      void qc.invalidateQueries({ queryKey: ["sample"] });
    },
  });
  if (!org.data) return <ErrorNote error={org.error} />;
  const a = org.data.autopilot;
  const disabled = !can.admin || save.isPending;
  return (
    <Card title={t("title")}>
      <p className="muted small">{t("intro")}</p>
      <label className="row">
        <input
          type="checkbox"
          checked={a.enabled}
          disabled={disabled}
          onChange={(e) => save.mutate({ enabled: e.target.checked })}
        />
        <strong>{t("enabled")}</strong>
      </label>
      <span className="field-hint">{t("enabledHint")}</span>
      {a.enabled && (
        <>
          <p className="small">{t("always")}</p>
          <div className="grid-2">
            <Field label={t("spotCheck")} hint={t("spotCheckHint")}>
              <input
                type="number"
                min={0}
                max={20}
                step={1}
                disabled={disabled}
                value={spot ?? String(a.spotCheckPct)}
                onChange={(e) => setSpot(e.target.value)}
                onBlur={() => {
                  if (spot !== null && spot !== String(a.spotCheckPct)) {
                    save.mutate({
                      spotCheckPct: Math.min(
                        20,
                        Math.max(0, Number(spot) || 0),
                      ),
                    });
                  }
                }}
              />
            </Field>
          </div>
          <label className="row small">
            <input
              type="checkbox"
              checked={a.autoSummary}
              disabled={disabled}
              onChange={(e) => save.mutate({ autoSummary: e.target.checked })}
            />
            {t("summary")}
          </label>
        </>
      )}
      <ErrorNote error={save.error} />
    </Card>
  );
}
