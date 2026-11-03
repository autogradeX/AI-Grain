import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, Network } from "lucide-react";
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
  realKernels?: number;
  fromStations?: number;
  stations?: number;
}

interface ModelVersion {
  id: string;
  version: number;
  metrics: Metrics;
  active: boolean;
  createdAt: string;
  /** "features" (measurements) or the image model, e.g. "mobilenet-v2". */
  input: string;
  /** Why it can't be used yet; empty when it is. */
  shortfalls: string[];
}

interface Status {
  settings: { mode: Mode };
  counts: Record<
    string,
    { reviewed: number; settled: number; network?: number }
  >;
  minimum: { perClass: number; total: number };
  versions: ModelVersion[];
  /** The network's model, downloaded from the central server. */
  network: ModelVersion | null;
  /** Which model classifies here. */
  inUse: "own" | "network" | null;
  /** Connected to a central server. */
  connected: boolean;
  /** The image model installed here, if any. */
  imageModel: string | null;
  training: string | null;
  /** Why the last training failed, if it did. */
  lastError: { at: string; message: string } | null;
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
  const checkNetwork = useMutation({
    mutationFn: () =>
      api.post<{ pulled: number }>("/local-model/network/check", {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["local-model"] }),
  });
  const setMode = useMutation({
    mutationFn: (mode: Mode) => api.put("/local-model/settings", { mode }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["local-model"] }),
  });
  const s = status.data;
  const current = s?.versions.find((v) => v.active);
  const counts = Object.entries(s?.counts ?? {}).sort(
    (a, b) =>
      b[1].reviewed +
      b[1].settled +
      (b[1].network ?? 0) -
      (a[1].reviewed + a[1].settled + (a[1].network ?? 0)),
  );
  const fromStations = counts.some(([, c]) => (c.network ?? 0) > 0);
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
            {!s.training && s.lastError && (
              <p className="warn small">
                {t("lastError", { message: s.lastError.message })}
              </p>
            )}
            <ErrorNote error={trainNow.error} />
            {!current ? (
              <p className="muted">{t("noModel")}</p>
            ) : (
              <ModelSummary
                model={current}
                used={s.inUse === "own"}
                otherUsed={s.inUse === "network"}
                label={label}
              />
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

          {(s.connected || s.network) && (
            <Card
              title={
                <span className="row">
                  <Network size={18} aria-hidden />{" "}
                  {s.network
                    ? t("networkCurrent", { version: s.network.version })
                    : t("networkTitle")}
                </span>
              }
              actions={
                can.admin &&
                s.connected && (
                  <button
                    disabled={checkNetwork.isPending}
                    onClick={() => checkNetwork.mutate()}
                  >
                    {t("networkCheck")}
                  </button>
                )
              }
            >
              <p className="muted small">{t("networkHint")}</p>
              {checkNetwork.data && (
                <p className="small">
                  {checkNetwork.data.pulled > 0
                    ? t("networkPulled")
                    : t("networkUpToDate")}
                </p>
              )}
              <ErrorNote error={checkNetwork.error} />
              {s.network ? (
                <ModelSummary
                  model={s.network}
                  used={s.inUse === "network"}
                  otherUsed={s.inUse === "own"}
                  label={label}
                />
              ) : (
                <p className="muted">{t("networkNone")}</p>
              )}
            </Card>
          )}

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
                      {fromStations && (
                        <th className="num">{t("fromStations")}</th>
                      )}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {counts.map(([c, v]) => {
                      const n = v.reviewed + v.settled + (v.network ?? 0);
                      return (
                        <tr key={c}>
                          <td>{label(c)}</td>
                          <td className="num">{v.reviewed}</td>
                          <td className="num">{v.settled}</td>
                          {fromStations && (
                            <td className="num">{v.network ?? 0}</td>
                          )}
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

/** A model's scores on photos it didn't learn from, and whether it is used. */
function ModelSummary({
  model,
  used,
  otherUsed,
  label,
}: {
  model: ModelVersion;
  used: boolean;
  /** The other model (network or own) classifies instead. */
  otherUsed: boolean;
  label: (id: string) => string;
}) {
  const t = useT(m);
  const metrics = model.metrics;
  return (
    <>
      {model.shortfalls.length === 0 ? (
        <p className="small">
          {used ? (
            <>
              <Badge tone="good">{t("inUse")}</Badge>{" "}
              <span className="muted">{t("inUseNote")}</span>
            </>
          ) : (
            otherUsed && <span className="muted">{t("otherUsed")}</span>
          )}
        </p>
      ) : (
        <p className="warn small">
          {t("notUsed", { list: model.shortfalls.join("; ") })}
        </p>
      )}
      <div className="kpis">
        <div>
          <div className="result-grade">{pct(metrics.accuracy)}%</div>
          <div className="muted small">
            {t("accuracy")} ·{" "}
            {t("accuracyNote", { count: metrics.validatedOn })}
          </div>
        </div>
        <div>
          <div className="result-grade">{pct(metrics.defectRecall)}%</div>
          <div className="muted small">
            {t("defectRecall")} · {t("defectRecallNote")}
          </div>
        </div>
        <div>
          <div className="result-grade">{pct(metrics.highAccuracy)}%</div>
          <div className="muted small">
            {t("highAccuracy")} ·{" "}
            {t("highAccuracyNote", { share: pct(metrics.highShare) })}
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
            {Object.entries(metrics.perClass).map(([c, v]) => (
              <tr key={c}>
                <td>{label(c)}</td>
                <td className="num">{v.n}</td>
                <td className="num">{pct(v.precision)}%</td>
                <td className="num">{pct(v.recall)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {Object.keys(metrics.leftOut).length > 0 && (
        <p className="warn small">
          {t("leftOut", {
            list: Object.entries(metrics.leftOut)
              .map(([c, n]) => `${label(c)} (${n})`)
              .join(", "),
          })}
        </p>
      )}
      <p className="muted small">
        {t("trainedOn", {
          count: metrics.realKernels ?? metrics.trainedOn,
          date: formatDate(model.createdAt),
        })}
        {metrics.realKernels !== undefined &&
          metrics.trainedOn > metrics.realKernels &&
          ` ${t("withCopies", { count: metrics.trainedOn })}`}
        {(metrics.stations ?? 0) > 0 &&
          ` ${t("fromStationsNote", {
            count: metrics.fromStations ?? 0,
            stations: metrics.stations ?? 0,
          })}`}{" "}
        · {model.input === "features" ? t("readsFeatures") : t("readsImage")}
      </p>
    </>
  );
}
