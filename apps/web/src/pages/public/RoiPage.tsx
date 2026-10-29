import { useState } from "react";
import { Link } from "react-router-dom";

/**
 * Rough Claude cost per ~500-kernel sample: about 17–20 sheets of 30 kernels,
 * each a few thousand input and output tokens, at list prices. Real costs vary
 * with the model's thinking; the Analytics page shows actual cost per sample.
 */
const MODEL_COST = {
  "claude-sonnet-5-5": { label: "Claude Sonnet 5.5 (default)", perSample: 0.7 },
  "claude-haiku-5-5": {
    label: "Claude Haiku 5.5 (lowest cost)",
    perSample: 0.04,
  },
  "claude-opus-5-5": {
    label: "Claude Opus 5.5 (difficult samples)",
    perSample: 1.4,
  },
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
  `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 })}`;

export function RoiPage() {
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
        <span className="eyebrow">ROI calculator</span>
        <h1>What would screening with AI-Grain save?</h1>
        <p className="hero-lead">
          Enter your own figures. Every number here is an assumption you can
          change; none is a promise.
        </p>
      </section>
      <section className="site-section roi">
        <div className="card stack">
          <h2>Your figures</h2>
          <div className="grid-2">
            <NumberField
              label="Samples per day"
              value={samplesPerDay}
              onChange={setSamplesPerDay}
            />
            <NumberField
              label="Working days per year"
              value={days}
              onChange={setDays}
            />
            <NumberField
              label="Minutes per sample today"
              hint="Your current manual impurity analysis, including sorting and weighing."
              value={manualMin}
              onChange={setManualMin}
            />
            <NumberField
              label="Minutes per sample with AI-Grain"
              hint="Spreading and photographing, checking flagged kernels, weighing cups. Measure it on a few samples."
              value={aiMin}
              onChange={setAiMin}
            />
            <NumberField
              label="Labour cost per hour (USD)"
              value={hourly}
              onChange={setHourly}
              step={0.5}
            />
            <NumberField
              label="Equipment, one-off (USD)"
              hint="Scale, board, stand, light, tweezers."
              value={equipment}
              onChange={setEquipment}
            />
            <div className="field">
              <label className="field">
                <span className="field-label">Claude model</span>
                <select
                  value={model}
                  onChange={(e) => {
                    const m = e.target.value as Model;
                    setModel(m);
                    setClaudeCost(MODEL_COST[m].perSample);
                  }}
                >
                  {Object.entries(MODEL_COST).map(([id, m]) => (
                    <option key={id} value={id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <NumberField
              label="Claude cost per sample (USD)"
              hint="A rough estimate for about 500 kernels at list prices. Signed-in users see their real cost on the Analytics page."
              value={claudeCost}
              onChange={setClaudeCost}
              step={0.01}
            />
          </div>
        </div>
        <div className="card stack roi-results" aria-live="polite">
          <h2>Per year</h2>
          <dl className="facts">
            <dt>Samples</dt>
            <dd>{samples.toLocaleString()}</dd>
            <dt>Hours saved</dt>
            <dd>{Math.round(hoursSaved).toLocaleString()} h</dd>
            <dt>Labour saved</dt>
            <dd>{money(labour)}</dd>
            <dt>Claude cost</dt>
            <dd>{money(claude)}</dd>
          </dl>
          <div>
            <div className="muted small">Net saving per year</div>
            <div className="result-grade">{money(net)}</div>
          </div>
          <p className="small">
            {paybackDays === null
              ? "With these figures the method doesn't pay for itself; check the minutes per sample."
              : `The equipment pays for itself in about ${paybackDays} working day${paybackDays === 1 ? "" : "s"}.`}
          </p>
          <p className="muted small">
            Not counted: the value of documented, verifiable reports, of
            catching problem lots earlier, and the time for validating the
            method against a certified grader before relying on it.
          </p>
          <Link to="/contact" className="button primary">
            Talk about your numbers
          </Link>
        </div>
      </section>
    </div>
  );
}
