import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";
import { useCan } from "../auth/AuthContext";
import { CropSelect } from "../components/CropSelect";
import {
  Badge,
  Card,
  ErrorNote,
  Field,
  formatDate,
  Spinner,
} from "../components/ui";
import { useT } from "../i18n";
import { useGrainLabels } from "../i18n/common";
import { useCrop } from "../api/crops";
import { m } from "./LocalModelPage.i18n";

type Mode = "offline" | "always" | "off";

interface Metrics {
  accuracy: number;
  defectRecall: number;
  highAccuracy: number;
  highShare: number;
  perClass: Record<string, { n: number; precision: number; recall: number }>;
  trainedOn: number;
  validatedOn: number;
  leftOut: Record<string, number>;
}

interface Status {
  settings: { mode: Mode };
  counts: Record<string, { reviewed: number; settled: number }>;
  minimum: { perClass: number; total: number };
  versions: {
    id: string;
    version: number;
    metrics: Metrics;
    active: boolean;
    createdAt: string;
    /** Why it can't be used yet; empty when it is used. */
    shortfalls: string[];
  }[];
  training: string | null;
}

const pct = (v: number) => Math.round(v * 100);

export function LocalModelPage() {
  const t = useT(m);
  const can = useCan();
  const qc = useQueryClient();
  const { classLabel } = useGrainLabels();
  const [crop, setCrop] = useState("wheat");
  const classes = useCrop(crop)?.classes ?? [];
  const status = useQuery({
    queryKey: ["local-model", crop],
    queryFn: () =>
      api.get<Status>(`/local-model?crop=${encodeURIComponent(crop)}`),
    // While training, look again every few seconds.
    refetchInterval: (q) => (q.state.data?.training ? 3000 : false),
  });
  const trainNow = useMutation({
    mutationFn: () => api.post("/local-model/train", { crop }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["local-model", crop] }),
  });
  const setMode = useMutation({
    mutationFn: (mode: Mode) => api.put("/local-model/settings", { mode }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["local-model"] }),
  });
  const s = status.data;
  const current = s?.versions.find((v) => v.active);
  const counts = Object.entries(s?.counts ?? {}).sort(
    (a, b) => b[1].reviewed + b[1].settled - (a[1].reviewed + a[1].settled),
  );
  const label = (id: string) => classLabel(classes, id);

  return (
    <div className="stack">
      <h1>{t("title")}</h1>
      <p className="muted small">{t("intro")}</p>
      <Field label={t("crop")}>
        <CropSelect value={crop} onChange={setCrop} />
      </Field>
      {status.isPending && <Spinner />}
      <ErrorNote error={status.error} />
      {s && (
        <>
          <Card title={t("useTitle")}>
            <select
              value={s.settings.mode}
              disabled={!can.admin || setMode.isPending}
              onChange={(e) => setMode.mutate(e.target.value as Mode)}
            >
              <option value="offline">{t("modeOffline")}</option>
              <option value="always">{t("modeAlways")}</option>
              <option value="off">{t("modeOff")}</option>
            </select>
            <ErrorNote error={setMode.error} />
          </Card>

          <Card
            title={
              <span className="row">
                <BrainCircuit size={18} aria-hidden />{" "}
                {current
                  ? t("current", { version: current.version })
                  : t("title")}
              </span>
            }
            actions={
              can.admin && (
                <button
                  className="primary"
                  disabled={trainNow.isPending || !!s.training}
                  onClick={() => trainNow.mutate()}
                >
                  {t("train")}
                </button>
              )
            }
          >
            {s.training && (
              <p className="small">
                <Spinner /> {t("training")}
              </p>
            )}
            <ErrorNote error={trainNow.error} />
            {!current ? (
              <p className="muted">{t("noModel")}</p>
            ) : (
              <>
                {current.shortfalls.length === 0 ? (
                  <p className="small">
                    <Badge tone="good">{t("inUse")}</Badge>{" "}
                    <span className="muted">{t("inUseNote")}</span>
                  </p>
                ) : (
                  <p className="warn small">
                    {t("notUsed", { list: current.shortfalls.join("; ") })}
                  </p>
                )}
                <div className="kpis">
                  <div>
                    <div className="result-grade">
                      {pct(current.metrics.accuracy)}%
                    </div>
                    <div className="muted small">
                      {t("accuracy")} ·{" "}
                      {t("accuracyNote", {
                        count: current.metrics.validatedOn,
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="result-grade">
                      {pct(current.metrics.defectRecall)}%
                    </div>
                    <div className="muted small">
                      {t("defectRecall")} · {t("defectRecallNote")}
                    </div>
                  </div>
                  <div>
                    <div className="result-grade">
                      {pct(current.metrics.highAccuracy)}%
                    </div>
                    <div className="muted small">
                      {t("highAccuracy")} ·{" "}
                      {t("highAccuracyNote", {
                        share: pct(current.metrics.highShare),
                      })}
                    </div>
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t("class")}</th>
                        <th className="num">{t("examples")}</th>
                        <th className="num">{t("precision")}</th>
                        <th className="num">{t("recall")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(current.metrics.perClass).map(
                        ([c, v]) => (
                          <tr key={c}>
                            <td>{label(c)}</td>
                            <td className="num">{v.n}</td>
                            <td className="num">{pct(v.precision)}%</td>
                            <td className="num">{pct(v.recall)}%</td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
                {Object.keys(current.metrics.leftOut).length > 0 && (
                  <p className="warn small">
                    {t("leftOut", {
                      list: Object.entries(current.metrics.leftOut)
                        .map(([c, n]) => `${label(c)} (${n})`)
                        .join(", "),
                    })}
                  </p>
                )}
                <p className="muted small">
                  {t("trainedOn", {
                    count: current.metrics.trainedOn,
                    date: formatDate(current.createdAt),
                  })}{" "}
                  {t("retrainHint")}
                </p>
              </>
            )}
            {s.versions.length > 1 && (
              <details>
                <summary className="small">{t("older")}</summary>
                <ul className="small">
                  {s.versions
                    .filter((v) => !v.active)
                    .map((v) => (
                      <li key={v.id}>
                        {t("versionLine", {
                          version: v.version,
                          pct: pct(v.metrics.accuracy),
                          date: formatDate(v.createdAt),
                        })}
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </Card>

          <Card title={t("dataTitle")}>
            <p className="muted small">
              {t("dataHint", {
                perClass: s.minimum.perClass,
                total: s.minimum.total,
              })}
            </p>
            {counts.length === 0 ? (
              <p className="muted">{t("noData")}</p>
            ) : (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("class")}</th>
                      <th className="num">{t("reviewed")}</th>
                      <th className="num">{t("settled")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {counts.map(([c, v]) => {
                      const n = v.reviewed + v.settled;
                      return (
                        <tr key={c}>
                          <td>{label(c)}</td>
                          <td className="num">{v.reviewed}</td>
                          <td className="num">{v.settled}</td>
                          <td>
                            {n >= s.minimum.perClass ? (
                              <Badge tone="good">{t("ready")}</Badge>
                            ) : (
                              <Badge tone="warn">
                                {t("needMore", {
                                  count: s.minimum.perClass - n,
                                })}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
