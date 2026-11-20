import {
  CLASS_GROUPS,
  type ClassDef,
  type ClassGroup,
  type PriceDeduction,
  type PriceRules,
} from "@ai-grain/core";
import { useT } from "../i18n";
import { useGrainLabels } from "../i18n/common";
import { m } from "./PricingEditor.i18n";
import { Field } from "./ui";

/** The form's state: numbers as typed. */
export interface PriceForm {
  currency: string;
  unit: string;
  basePrice: string;
  gradePrices: Record<string, string>;
  rejectUngraded: boolean;
  deductions: {
    on: string;
    allowance: string;
    rate: string;
    mode: "amount" | "percent";
  }[];
}

const onOf = (d: PriceDeduction) =>
  d.scope === "class" || d.scope === "group" ? `${d.scope}:${d.key}` : d.scope;

export function toPriceForm(
  p: PriceRules | null | undefined,
): PriceForm | null {
  if (!p) return null;
  return {
    currency: p.currency,
    unit: p.unit,
    basePrice: String(p.basePrice),
    gradePrices: Object.fromEntries(
      Object.entries(p.gradePrices ?? {}).map(([g, v]) => [g, String(v)]),
    ),
    rejectUngraded: !!p.rejectUngraded,
    deductions: p.deductions.map((d) => ({
      on: onOf(d),
      allowance: String(d.allowance),
      rate: String(d.rate),
      mode: d.mode,
    })),
  };
}

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() && Number.isFinite(n) ? n : null;
};

/** The rules as the API takes them, for the grades the standard has. */
export function fromPriceForm(f: PriceForm, grades: string[]): PriceRules {
  const gradePrices: Record<string, number> = {};
  for (const g of grades) {
    const v = num(f.gradePrices[g] ?? "");
    if (v !== null) gradePrices[g] = v;
  }
  return {
    currency: f.currency.trim() || "INR",
    unit: f.unit,
    basePrice: num(f.basePrice) ?? 0,
    gradePrices,
    rejectUngraded: f.rejectUngraded,
    deductions: f.deductions.flatMap((d) => {
      const allowance = num(d.allowance);
      const rate = num(d.rate);
      if (allowance === null || rate === null) return [];
      const [scope, key] = d.on.split(":") as [
        PriceDeduction["scope"],
        string?,
      ];
      return [{ scope, ...(key && { key }), allowance, rate, mode: d.mode }];
    }),
  };
}

export const emptyPriceForm: PriceForm = {
  currency: "INR",
  unit: "quintal",
  basePrice: "",
  gradePrices: {},
  rejectUngraded: false,
  deductions: [{ on: "moisture", allowance: "12", rate: "1", mode: "percent" }],
};

/** Prices per grade and deductions, set with a standard. */
export function PricingEditor({
  value,
  onChange,
  grades,
  classes,
  readOnly,
}: {
  value: PriceForm | null;
  onChange: (v: PriceForm | null) => void;
  grades: string[];
  classes: readonly ClassDef[];
  readOnly: boolean;
}) {
  const t = useT(m);
  const { groupLabel, classLabel } = useGrainLabels();
  const set = (patch: Partial<PriceForm>) =>
    value && onChange({ ...value, ...patch });
  const setDeduction = (
    i: number,
    patch: Partial<PriceForm["deductions"][number]>,
  ) =>
    value &&
    set({
      deductions: value.deductions.map((d, j) =>
        j === i ? { ...d, ...patch } : d,
      ),
    });
  const groups = CLASS_GROUPS.filter((g) => classes.some((c) => c.group === g));
  return (
    <>
      <p className="muted small">{t("hint")}</p>
      <label className="row small">
        <input
          type="checkbox"
          disabled={readOnly}
          checked={!!value}
          onChange={(e) => onChange(e.target.checked ? emptyPriceForm : null)}
        />
        {t("enable")}
      </label>
      {value && (
        <div className="stack-sm">
          <div className="grid-3">
            <Field label={t("basePrice")}>
              <input
                inputMode="decimal"
                disabled={readOnly}
                value={value.basePrice}
                onChange={(e) => set({ basePrice: e.target.value })}
              />
            </Field>
            <Field label={t("currency")}>
              <input
                maxLength={8}
                disabled={readOnly}
                value={value.currency}
                onChange={(e) => set({ currency: e.target.value })}
              />
            </Field>
            <Field label={t("unit")}>
              <select
                disabled={readOnly}
                value={value.unit}
                onChange={(e) => set({ unit: e.target.value })}
              >
                {(["quintal", "tonne", "kg"] as const).map((u) => (
                  <option key={u} value={u}>
                    {t(u)}
                  </option>
                ))}
              </select>
            </Field>
            {grades.map((g) => (
              <Field
                key={g}
                label={t("gradePrice", { grade: g })}
                hint={t("gradePriceHint")}
              >
                <input
                  inputMode="decimal"
                  disabled={readOnly}
                  value={value.gradePrices[g] ?? ""}
                  onChange={(e) =>
                    set({
                      gradePrices: {
                        ...value.gradePrices,
                        [g]: e.target.value,
                      },
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <label className="row small">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={value.rejectUngraded}
              onChange={(e) => set({ rejectUngraded: e.target.checked })}
            />
            {t("rejectUngraded")}
          </label>
          <h4>{t("deductions")}</h4>
          <p className="muted small">{t("example")}</p>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("what")}</th>
                  <th>{t("allowance")}</th>
                  <th>{t("rate")}</th>
                  <th />
                  <th />
                </tr>
              </thead>
              <tbody>
                {value.deductions.map((d, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        aria-label={t("what")}
                        disabled={readOnly}
                        value={d.on}
                        onChange={(e) =>
                          setDeduction(i, { on: e.target.value })
                        }
                      >
                        <option value="moisture">{t("moisture")}</option>
                        <option value="totalDefects">
                          {t("totalDefects")}
                        </option>
                        <option value="protein">{t("protein")}</option>
                        <option value="oil">{t("oil")}</option>
                        {groups.map((g: ClassGroup) => (
                          <option key={g} value={`group:${g}`}>
                            {groupLabel(g)}
                          </option>
                        ))}
                        {classes
                          .filter((c) => c.id !== "sound" && c.id !== "unclear")
                          .map((c) => (
                            <option key={c.id} value={`class:${c.id}`}>
                              {classLabel(classes, c.id)}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={t("allowance")}
                        inputMode="decimal"
                        size={6}
                        disabled={readOnly}
                        value={d.allowance}
                        onChange={(e) =>
                          setDeduction(i, { allowance: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={t("rate")}
                        inputMode="decimal"
                        size={6}
                        disabled={readOnly}
                        value={d.rate}
                        onChange={(e) =>
                          setDeduction(i, { rate: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <select
                        aria-label={t("rate")}
                        disabled={readOnly}
                        value={d.mode}
                        onChange={(e) =>
                          setDeduction(i, {
                            mode: e.target.value as "amount" | "percent",
                          })
                        }
                      >
                        <option value="amount">{t("amount")}</option>
                        <option value="percent">{t("percent")}</option>
                      </select>
                    </td>
                    <td>
                      {!readOnly && (
                        <button
                          type="button"
                          className="link"
                          onClick={() =>
                            set({
                              deductions: value.deductions.filter(
                                (_, j) => j !== i,
                              ),
                            })
                          }
                        >
                          {t("remove")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() =>
                set({
                  deductions: [
                    ...value.deductions,
                    {
                      on: "totalDefects",
                      allowance: "0",
                      rate: "0",
                      mode: "amount",
                    },
                  ],
                })
              }
            >
              {t("add")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
