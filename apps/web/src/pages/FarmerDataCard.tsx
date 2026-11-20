import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, download } from "../api/client";
import type { Org } from "../api/types";
import { Card, ErrorNote, Field } from "../components/ui";
import { useT } from "../i18n";
import { m } from "./FarmerDataCard.i18n";

/** Admins: how long farmers' details are kept, and a farmer's requests. */
export function FarmerDataCard() {
  const t = useT(m);
  const qc = useQueryClient();
  const org = useQuery({
    queryKey: ["org"],
    queryFn: () => api.get<Org>("/org"),
  });
  const [days, setDays] = useState<string | null>(null);
  const shown = days ?? String(org.data?.privacy?.farmerRetentionDays ?? "");
  const save = useMutation({
    mutationFn: () =>
      api.patch("/org", {
        privacy: { farmerRetentionDays: shown.trim() ? Number(shown) : null },
      }),
    onSuccess: () => {
      setDays(null);
      void qc.invalidateQueries({ queryKey: ["org"] });
    },
  });
  const [mobile, setMobile] = useState("");
  const [farmerId, setFarmerId] = useState("");
  const query = () => {
    const q = new URLSearchParams();
    if (mobile.trim()) q.set("mobile", mobile.trim());
    if (farmerId.trim()) q.set("farmerId", farmerId.trim());
    return q;
  };
  const exportData = useMutation({
    mutationFn: () =>
      download(`/privacy/farmer?${query().toString()}`, "farmer-data.json"),
  });
  const erase = useMutation({
    mutationFn: () =>
      api.post<{ samples: number }>("/privacy/farmer/erase", {
        ...(mobile.trim() && { mobile: mobile.trim() }),
        ...(farmerId.trim() && { farmerId: farmerId.trim() }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["samples"] }),
  });
  const someone = Boolean(mobile.trim() || farmerId.trim());
  return (
    <Card title={t("title")}>
      <p className="muted small">{t("hint")}</p>
      <form
        className="row wrap"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("retention")} hint={t("retentionHint")}>
          <input
            type="number"
            min="1"
            max="3650"
            inputMode="numeric"
            value={shown}
            onChange={(e) => setDays(e.target.value)}
          />
        </Field>
        <button disabled={days === null || save.isPending}>
          {t("saveRetention")}
        </button>
        {save.isSuccess && days === null && (
          <span className="good small">{t("saved")}</span>
        )}
      </form>
      <h4>{t("requestTitle")}</h4>
      <div className="grid-2">
        <Field label={t("mobile")}>
          <input
            type="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />
        </Field>
        <Field label={t("farmerId")}>
          <input
            value={farmerId}
            onChange={(e) => setFarmerId(e.target.value)}
          />
        </Field>
      </div>
      <ErrorNote error={save.error ?? exportData.error ?? erase.error} />
      {erase.data && (
        <p className="good small">
          {t("erased", { count: erase.data.samples })}
        </p>
      )}
      <div className="row wrap">
        <button
          type="button"
          disabled={!someone || exportData.isPending}
          onClick={() => exportData.mutate()}
        >
          {t("download")}
        </button>
        <button
          type="button"
          className="danger"
          disabled={!someone || erase.isPending}
          onClick={() => {
            if (window.confirm(t("confirmErase"))) erase.mutate();
          }}
        >
          {t("erase")}
        </button>
      </div>
      <p className="muted small">{t("certNote")}</p>
    </Card>
  );
}
