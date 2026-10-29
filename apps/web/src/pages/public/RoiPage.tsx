import { useState } from "react";
import { Link } from "react-router-dom";
import { locale, useT } from "../../i18n";
import { m } from "./RoiPage.i18n";

/**
 * Rough Claude cost per ~500-kernel sample: about 17–20 sheets of 30 kernels,
 * each a few thousand input and output tokens, at list prices. Real costs vary
 * with the model's thinking; the Analytics page shows actual cost per sample.
 */
const MODEL_COST = {
  "claude-sonnet-5-5": { label: "modelSonnet", perSample: 0.7 },
  "claude-haiku-5-5": { label: "modelHaiku", perSample: 0.04 },
  "claude-opus-5-5": { label: "modelOpus", perSample: 1.4 },
} as const;
type Model = keyof typeof MODEL_COST;

function NumberField({
  label,
  hint,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div className="field">
      <label className="field">
        <span className="field-label">{label}</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? 0 : Number(e.target.value))
          }
        />
      </label>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

const money = (v: number) =>
  `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString(locale(), { maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 })}`;

export function RoiPage() {
  const t = useT(m);
  const [samplesPerDay, setSamplesPerDay] = useState(20);
  const [days, setDays] = useState(250);
  const [manualMin, setManualMin] = useState(20);
  const [aiMin, setAiMin] = useState(8);
  const [hourly, setHourly] = useState(15);
  const [model, setModel] = useState<Model>("claude-sonnet-5-5");
  const [claudeCost, setClaudeCost] = useState<number>(
    MODEL_COST["claude-sonnet-5-5"].perSample,
  );
  const [equipment, setEquipment] = useState(60);

  const samples = samplesPerDay * days;
  const hoursSaved = (samples * (manualMin - aiMin)) / 60;
  const labour = hoursSaved * hourly;
  const claude = samples * claudeCost;
  const net = labour - claude;
  const perDayNet = net / Math.max(1, days);
  const paybackDays = perDayNet > 0 ? Math.ceil(equipment / perDayNet) : null;

  return (
    <div className="site-page">
      <section className="hero compact">
        <span className="eyebrow">{t("eyebrow")}</span>
        <h1>{t("title")}</h1>
        <p className="hero-lead">{t("lead")}</p>
      </section>
      <section className="site-section roi">
        <div className="card stack">
          <h2>{t("yourFigures")}</h2>
          <div className="grid-2">
            <NumberField
              label={t("samplesPerDay")}
              value={samplesPerDay}
              onChange={setSamplesPerDay}
            />
            <NumberField
              label={t("daysPerYear")}
              value={days}
              onChange={setDays}
            />
            <NumberField
              label={t("manualMin")}
              hint={t("manualMinHint")}
              value={manualMin}
              onChange={setManualMin}
            />
            <NumberField
              label={t("aiMin")}
              hint={t("aiMinHint")}
              value={aiMin}
              onChange={setAiMin}
            />
            <NumberField
              label={t("hourly")}
              value={hourly}
              onChange={setHourly}
              step={0.5}
            />
            <NumberField
              label={t("equipment")}
              hint={t("equipmentHint")}
              value={equipment}
              onChange={setEquipment}
            />
            <div className="field">
              <label className="field">
                <span className="field-label">{t("model")}</span>
                <select
                  value={model}
                  onChange={(e) => {
                    const next = e.target.value as Model;
                    setModel(next);
                    setClaudeCost(MODEL_COST[next].perSample);
                  }}
                >
                  {Object.entries(MODEL_COST).map(([id, cost]) => (
                    <option key={id} value={id}>
                      {t(cost.label)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <NumberField
              label={t("claudeCost")}
              hint={t("claudeCostHint")}
              value={claudeCost}
              onChange={setClaudeCost}
              step={0.01}
            />
          </div>
        </div>
        <div className="card stack roi-results" aria-live="polite">
          <h2>{t("perYear")}</h2>
          <dl className="facts">
            <dt>{t("samples")}</dt>
            <dd>{samples.toLocaleString(locale())}</dd>
            <dt>{t("hoursSaved")}</dt>
            <dd>
              {t("hours", {
                hours: Math.round(hoursSaved).toLocaleString(locale()),
              })}
            </dd>
            <dt>{t("labourSaved")}</dt>
            <dd>{money(labour)}</dd>
            <dt>{t("claudeCostTotal")}</dt>
            <dd>{money(claude)}</dd>
          </dl>
          <div>
            <div className="muted small">{t("netSaving")}</div>
            <div className="result-grade">{money(net)}</div>
          </div>
          <p className="small">
            {paybackDays === null
              ? t("noPayback")
              : t.n("payback", paybackDays)}
          </p>
          <p className="muted small">{t("notCounted")}</p>
          <Link to="/contact" className="button primary">
            {t("talk")}
          </Link>
        </div>
      </section>
    </div>
  );
}
