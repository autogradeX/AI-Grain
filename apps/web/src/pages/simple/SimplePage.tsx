import { useQuery } from "@tanstack/react-query";
import { CircleHelp, Printer, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, printFile } from "../../api/client";
import { useCrops } from "../../api/crops";
import type { Org, ReviewKernel, Sample } from "../../api/types";
import { useCan } from "../../auth/AuthContext";
import {
  emptyLot,
  LotFields,
  lotBody,
  type Lot,
} from "../../components/LotFields";
import { AuthImage, ClassBadge, Spinner } from "../../components/ui";
import { readMoisture } from "../../devices/moisture";
import { readScale } from "../../devices/scale";
import {
  captureTray,
  CaptureError,
  checkStation,
  diagnostics,
  type Check,
  type StationHealth,
} from "../../devices/station";
import {
  asLang,
  hasChosenLang,
  LanguageSelect,
  useLang,
  useT,
} from "../../i18n";
import { useGrainLabels } from "../../i18n/common";
import { m } from "./SimplePage.i18n";

type Step = "start" | "weigh" | "moisture" | "photo" | "analyse";

type Screen =
  | { at: "home" }
  | { at: "farmer"; crop: string }
  | { at: "run"; step: Step; notes: string[]; waiting?: boolean }
  | { at: "review"; sampleId: string }
  | { at: "done"; sampleId: string }
  | { at: "problem"; message: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The station screen for operators who aren't technical: pick the grain,
 * tap once. Weighing, moisture, photos, counting and checking happen by
 * themselves with the setup an admin saved once (Settings → Simple mode);
 * only grains the system can't settle are shown, one at a time, as a yes /
 * no question. Problems come as one plain sentence with what to do.
 */
export function SimplePage() {
  const t = useT(m);
  const can = useCan();
  const { cropLabel } = useGrainLabels();
  const org = useQuery({
    queryKey: ["org"],
    queryFn: () => api.get<Org>("/org"),
  });
  const crops = useCrops();
  const health = useQuery({
    queryKey: ["station-health"],
    queryFn: () => api.get<StationHealth>("/station/health"),
    refetchInterval: 30_000,
    retry: false,
  });
  const setup = org.data?.simpleMode ?? {};
  // The station's language, until someone here picks one.
  const { lang, setLang } = useLang();
  const stationLang = asLang(setup.language);
  useEffect(() => {
    if (stationLang && stationLang !== lang && !hasChosenLang())
      setLang(stationLang);
  }, [stationLang, lang, setLang]);
  const capture = setup.capture ?? "two";
  const [screen, setScreen] = useState<Screen>({ at: "home" });
  const [lot, setLot] = useState<Lot>(emptyLot);
  const [checks, setChecks] = useState<Check[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const errors = useRef<string[]>([]);
  const remember = (e: unknown) => {
    errors.current = [
      ...errors.current.slice(-19),
      `${new Date().toISOString()} ${e instanceof Error ? e.message : String(e)}`,
    ];
  };

  // The station's state, checked on the home screen.
  useEffect(() => {
    if (screen.at !== "home" || !org.data) return;
    let cancelled = false;
    void checkStation(
      {
        capture,
        weigh: !!setup.weigh,
        moisture: !!setup.moisture,
      },
      health.isError ? null : (health.data ?? null),
    ).then((c) => {
      if (!cancelled) setChecks(c);
    });
    return () => {
      cancelled = true;
    };
  }, [
    screen.at,
    org.data,
    health.data,
    health.isError,
    capture,
    setup.weigh,
    setup.moisture,
  ]);

  const run = async (crop: string) => {
    const notes: string[] = [];
    const step = (s: Step, waiting?: boolean) =>
      setScreen({
        at: "run",
        step: s,
        notes: [...notes],
        ...(waiting && { waiting }),
      });
    try {
      step("start");
      const sample = await api.post<{ id: string }>("/samples", {
        crop,
        standardId: setup.standards?.[crop] ?? null,
        ...lotBody(lot),
      });
      if (setup.weigh) {
        step("weigh");
        try {
          const g = await readScale();
          await api.patch(`/samples/${sample.id}`, { sampleMassG: g });
        } catch (e) {
          remember(e);
          notes.push(
            t("skipped", {
              what: t("weight"),
              reason: String((e as Error).message ?? e),
            }),
          );
        }
      }
      if (setup.moisture) {
        step("moisture");
        try {
          const pct = await readMoisture();
          await api.patch(`/samples/${sample.id}`, { moisturePct: pct });
        } catch (e) {
          remember(e);
          notes.push(
            t("skipped", {
              what: t("moisture"),
              reason: String((e as Error).message ?? e),
            }),
          );
        }
      }
      step("photo");
      const photos = await captureTray(capture);
      const first = new FormData();
      first.set("side", "front");
      if (capture === "two") first.set("board", "none");
      if (!photos.bottom) first.set("finish", "true");
      first.set("photo", photos.top, "top.jpg");
      const top = await api.upload<{ id: string }>(
        `/samples/${sample.id}/batches`,
        first,
      );
      if (photos.bottom) {
        const second = new FormData();
        second.set("pairWith", top.id);
        second.set("finish", "true");
        second.set("photo", photos.bottom, "bottom.jpg");
        await api.upload(`/samples/${sample.id}/batches`, second);
      }
      step("analyse");
      await follow(sample.id, notes);
    } catch (e) {
      remember(e);
      setScreen({ at: "problem", message: explain(e) });
    }
  };

  /** Waits for the sample: done, a question for the operator, or a problem. */
  const follow = async (sampleId: string, notes: string[] = []) => {
    for (let i = 0; i < 300; i++) {
      const s = await api.get<Sample>(`/samples/${sampleId}`);
      if (s.status === "completed") {
        setScreen({ at: "done", sampleId });
        if (setup.autoPrint)
          void printFile(`/samples/${sampleId}/report.pdf?format=slip`).catch(
            remember,
          );
        return;
      }
      const failed = s.batches.find((b) => b.status === "failed");
      if (failed) {
        setScreen({
          at: "problem",
          message: t("photoFailed", { reason: failed.error ?? "" }),
        });
        return;
      }
      const busy = s.batches.some((b) =>
        ["uploaded", "detecting", "classifying"].includes(b.status),
      );
      if (!busy && s.kernels.pendingReview > 0) {
        setScreen({ at: "review", sampleId });
        return;
      }
      const waiting = s.batches.some((b) => b.status === "waiting");
      setScreen({
        at: "run",
        step: "analyse",
        notes,
        ...(waiting && { waiting: true }),
      });
      await sleep(2000);
    }
  };

  const explain = (e: unknown): string => {
    if (e instanceof CaptureError) {
      if (e.camera === "cameras")
        return t(e.reason === "missing" ? "camerasMissing" : "camerasStart");
      return t(e.camera === "top" ? "topBlank" : "bottomBlank");
    }
    if (e instanceof TypeError) return t("serverDown");
    return e instanceof Error ? e.message : String(e);
  };

  const enabled = (setup.crops ?? []).filter((c) =>
    crops.data?.some((x) => x.key === c),
  );
  const blocking = checks.some((c) => c.state === "stop");

  return (
    <div className="simple">
      <header className="simple-head">
        <strong>{org.data?.name ?? t("title")}</strong>
        <div className="row">
          <LanguageSelect />
          <button className="simple-help" onClick={() => setHelpOpen(true)}>
            <CircleHelp size={22} aria-hidden /> {t("help")}
          </button>
          {can.admin && (
            <Link to="/app" className="button">
              {t("fullApp")}
            </Link>
          )}
        </div>
      </header>

      <main className="simple-main">
        {(org.isPending || crops.isPending) && <Spinner />}

        {screen.at === "home" && org.data && (
          <>
            {checks.length > 0 && <StationChecks checks={checks} />}
            {enabled.length === 0 ? (
              <p className="simple-message">{t("noCrops")}</p>
            ) : (
              <>
                <h1>{t("pickCrop")}</h1>
                <div className="simple-tiles">
                  {enabled.map((c) => {
                    const crop = crops.data!.find((x) => x.key === c)!;
                    return (
                      <button
                        key={c}
                        className="simple-tile"
                        disabled={blocking}
                        onClick={() => {
                          setLot(emptyLot);
                          if (setup.askFarmer)
                            setScreen({ at: "farmer", crop: c });
                          else void run(c);
                        }}
                      >
                        {cropLabel(crop.label)}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {screen.at === "farmer" && (
          <div className="simple-card">
            <h1>{t("farmerTitle")}</h1>
            <p className="muted">{t("farmerHint")}</p>
            <div className="grid-2">
              <LotFields value={lot} onChange={setLot} />
            </div>
            <div className="row wrap">
              <button
                className="simple-big"
                onClick={() => setScreen({ at: "home" })}
              >
                {t("back")}
              </button>
              <button
                className="simple-big primary"
                onClick={() => void run(screen.crop)}
              >
                {t("start")}
              </button>
            </div>
          </div>
        )}

        {screen.at === "run" && (
          <div className="simple-card simple-center">
            <Spinner />
            <h1>
              {t(
                {
                  start: "stepStart",
                  weigh: "stepWeigh",
                  moisture: "stepMoisture",
                  photo: "stepPhoto",
                  analyse: "stepAnalyse",
                }[screen.step] as "stepStart",
              )}
            </h1>
            {screen.notes.map((n) => (
              <p key={n} className="warn">
                {n}
              </p>
            ))}
            {screen.waiting && (
              <>
                <p className="warn">{t("waitingInternet")}</p>
                <button
                  className="simple-big"
                  onClick={() => setScreen({ at: "home" })}
                >
                  {t("next")}
                </button>
              </>
            )}
          </div>
        )}

        {screen.at === "review" && (
          <SimpleReview
            sampleId={screen.sampleId}
            onDone={() => {
              setScreen({ at: "run", step: "analyse", notes: [] });
              void follow(screen.sampleId);
            }}
          />
        )}

        {screen.at === "done" && (
          <SimpleResult
            sampleId={screen.sampleId}
            onNext={() => setScreen({ at: "home" })}
          />
        )}

        {screen.at === "problem" && (
          <div className="simple-card simple-center">
            <h1>{t("problem")}</h1>
            <p className="simple-message">{screen.message}</p>
            <div className="row wrap">
              <button
                className="simple-big primary"
                onClick={() => setScreen({ at: "home" })}
              >
                <RotateCcw size={22} aria-hidden /> {t("tryAgain")}
              </button>
              <button className="simple-big" onClick={() => setHelpOpen(true)}>
                <CircleHelp size={22} aria-hidden /> {t("help")}
              </button>
            </div>
          </div>
        )}
      </main>

      {helpOpen && (
        <HelpPanel
          checks={checks}
          health={health.data ?? null}
          errors={() => errors.current}
          onClose={() => setHelpOpen(false)}
        />
      )}
    </div>
  );
}

function StationChecks({ checks }: { checks: Check[] }) {
  const t = useT(m);
  const bad = checks.filter((c) => c.state !== "ok");
  if (bad.length === 0)
    return <p className="simple-checks ok">✓ {t("allGood")}</p>;
  return (
    <div
      className={`simple-checks ${bad.some((c) => c.state === "stop") ? "stop" : "warn"}`}
    >
      {bad.map((c) => (
        <p key={c.id}>
          <strong>{t(`check_${c.id}`)}:</strong> {t(`fix_${c.id}`)}
        </p>
      ))}
    </div>
  );
}

/** One grain at a time: is the AI right? */
function SimpleReview({
  sampleId,
  onDone,
}: {
  sampleId: string;
  onDone: () => void;
}) {
  const t = useT(m);
  const { classLabel } = useGrainLabels();
  const [busy, setBusy] = useState(false);
  const [others, setOthers] = useState(false);
  const sample = useQuery({
    queryKey: ["sample", sampleId],
    queryFn: () => api.get<Sample>(`/samples/${sampleId}`),
  });
  const next = useQuery({
    queryKey: ["simple-review", sampleId],
    queryFn: () =>
      api.get<{ items: ReviewKernel[]; total: number }>(
        `/samples/${sampleId}/review?scope=pending&limit=1&offset=0`,
      ),
  });
  const k = next.data?.items[0];
  useEffect(() => {
    if (next.data && next.data.total === 0) onDone();
  }, [next.data, onDone]);
  if (!k || !sample.data) return <Spinner />;
  const classes = sample.data.cropProfile.classes;
  const decide = async (cls: string) => {
    setBusy(true);
    setOthers(false);
    try {
      await api.post("/kernels/review", {
        decisions: [{ kernelId: k.id, finalClass: cls }],
      });
      await next.refetch();
    } finally {
      setBusy(false);
    }
  };
  const restAi = async () => {
    setBusy(true);
    try {
      await api.post(`/samples/${sampleId}/review/accept-ai`, {});
      await next.refetch();
    } finally {
      setBusy(false);
    }
  };
  const ai = k.aiClass && k.aiClass !== "unclear" ? k.aiClass : null;
  return (
    <div className="simple-card">
      <h1>{t("reviewTitle", { left: next.data!.total })}</h1>
      <div className="simple-crops">
        <figure>
          <AuthImage
            path={`/kernels/${k.id}/crop`}
            alt=""
            className="simple-crop"
          />
          {k.undersideId && <figcaption>{t("reviewTop")}</figcaption>}
        </figure>
        {k.undersideId && (
          <figure>
            <AuthImage
              path={`/kernels/${k.undersideId}/crop`}
              alt=""
              className="simple-crop"
            />
            <figcaption>{t("reviewUnder")}</figcaption>
          </figure>
        )}
      </div>
      <p className="simple-message">
        {ai ? t("aiSays", { class: classLabel(classes, ai) }) : t("aiUnsure")}
      </p>
      <div className="simple-answers">
        {ai && ai !== "sound" && (
          <button
            className="simple-big primary"
            disabled={busy}
            onClick={() => void decide(ai)}
          >
            {t("yes", { class: classLabel(classes, ai) })}
          </button>
        )}
        <button
          className="simple-big good"
          disabled={busy}
          onClick={() => void decide("sound")}
        >
          {t("sound")}
        </button>
        <button
          className="simple-big"
          disabled={busy}
          onClick={() => setOthers(!others)}
        >
          {t("other")}
        </button>
        <button
          className="simple-big"
          disabled={busy}
          onClick={() => void decide("unclear")}
        >
          {t("notSure")}
        </button>
      </div>
      {others && (
        <div className="simple-others">
          {classes.map((c) => (
            <button
              key={c.id}
              disabled={busy}
              onClick={() => void decide(c.id)}
            >
              <ClassBadge cls={c.id} classes={classes} />
            </button>
          ))}
        </div>
      )}
      {next.data!.total > 3 && (
        <button
          className="simple-link"
          disabled={busy}
          onClick={() => void restAi()}
        >
          {t("restAi")}
        </button>
      )}
    </div>
  );
}

function SimpleResult({
  sampleId,
  onNext,
}: {
  sampleId: string;
  onNext: () => void;
}) {
  const t = useT(m);
  const s = useQuery({
    queryKey: ["sample", sampleId],
    queryFn: () => api.get<Sample>(`/samples/${sampleId}`),
  });
  if (!s.data) return <Spinner />;
  // Without a standard (or before weighing) the photo estimate has the figures.
  const r = s.data.result ?? s.data.estimate;
  const pct = (v: number) => `${v.toFixed(2)} %`;
  return (
    <div className="simple-card simple-center">
      <p className="muted">{t("done")}</p>
      <h1 className="simple-grade">
        {r?.grade.grade
          ? t("grade", { grade: r.grade.grade })
          : s.data.standardId
            ? t("noGrade")
            : t("noStandard")}
      </h1>
      {r && (
        <dl className="simple-facts">
          <dt>{t("purity")}</dt>
          <dd>{pct(r.purityPct)}</dd>
          <dt>{t("defects")}</dt>
          <dd>{pct(r.totalDefectsPct)}</dd>
          {s.data.moisturePct !== null && (
            <>
              <dt>{t("moisture")}</dt>
              <dd>{pct(s.data.moisturePct)}</dd>
            </>
          )}
          <dt>{t("grains")}</dt>
          <dd>{s.data.kernels.total}</dd>
        </dl>
      )}
      <div className="row wrap">
        <button
          className="simple-big"
          onClick={() =>
            void printFile(`/samples/${sampleId}/report.pdf?format=slip`)
          }
        >
          <Printer size={22} aria-hidden /> {t("print")}
        </button>
        <button className="simple-big primary" onClick={onNext}>
          {t("next")}
        </button>
      </div>
    </div>
  );
}

function HelpPanel({
  checks,
  health,
  errors,
  onClose,
}: {
  checks: Check[];
  health: StationHealth | null;
  /** The recent errors, read when the report is sent. */
  errors: () => string[];
  onClose: () => void;
}) {
  const t = useT(m);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">(
    "idle",
  );
  const send = async () => {
    setState("sending");
    try {
      await api.post("/station/help", {
        ...(note.trim() && { note: note.trim() }),
        diagnostics: await diagnostics({ health, checks, errors: errors() }),
      });
      setState("sent");
    } catch {
      setState("failed");
    }
  };
  return (
    <div className="simple-overlay" role="dialog" aria-modal="true">
      <div className="simple-card">
        <h1>{t("checksTitle")}</h1>
        <ul className="simple-checklist">
          {checks.map((c) => (
            <li key={c.id} className={c.state}>
              <strong>{t(`check_${c.id}`)}</strong>
              {c.state !== "ok" && <span> · {t(`fix_${c.id}`)}</span>}
            </li>
          ))}
        </ul>
        {checks.every((c) => c.state === "ok") && <p>{t("allGood")}</p>}
        <textarea
          rows={3}
          placeholder={t("helpNote")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {state === "sent" ? (
          <p className="good">{t("helpSent")}</p>
        ) : (
          <button
            className="simple-big primary"
            disabled={state === "sending"}
            onClick={() => void send()}
          >
            {t("sendHelp")}
          </button>
        )}
        {state === "failed" && <p className="error">{t("serverDown")}</p>}
        <button className="simple-big" onClick={onClose}>
          {t("close")}
        </button>
      </div>
    </div>
  );
}
