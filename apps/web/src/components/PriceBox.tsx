import type { ClassDef, ClassGroup, PriceQuote } from "@ai-grain/core";
import { locale, useT } from "../i18n";
import { useGrainLabels } from "../i18n/common";
import { m } from "./PriceBox.i18n";

/** ₹2,150 for rupees; otherwise the amount and the currency code. */
export function money(value: number, currency: string): string {
  const n = value.toLocaleString(locale(), { maximumFractionDigits: 2 });
  return currency === "INR" ? `₹${n}` : `${n} ${currency}`;
}

/** The price under the standard's rules: grade price, deductions, the result. */
export function PriceBox({
  price,
  classes,
  estimate,
  big,
}: {
  price: PriceQuote;
  classes: readonly ClassDef[];
  /** The price comes from the live photo estimate, not a completed result. */
  estimate?: boolean;
  big?: boolean;
}) {
  const t = useT(m);
  const { classLabel, groupLabel } = useGrainLabels();
  const unit =
    price.unit === "quintal" || price.unit === "tonne" || price.unit === "kg"
      ? t(price.unit)
      : price.unit;
  const name = (scope: string, key?: string) =>
    scope === "class"
      ? classLabel(classes, key ?? null)
      : scope === "group"
        ? groupLabel(key as ClassGroup)
        : t(scope as "moisture" | "totalDefects" | "protein" | "oil");
  return (
    <div className={big ? "price-box big" : "price-box"}>
      {estimate && <p className="muted small">{t("estimate")}</p>}
      {price.rejected ? (
        <strong className="error">{t("rejected")}</strong>
      ) : (
        <>
          <div className="price-main">
            <span className="price-value">
              {money(price.price ?? 0, price.currency)}
            </span>{" "}
            <span className="muted">{t("per", { unit })}</span>
          </div>
          {price.lines.length > 0 && (
            <dl className="price-lines small">
              <dt>{t("gradePrice")}</dt>
              <dd>{money(price.start, price.currency)}</dd>
              {price.lines.map((l, i) => (
                <div key={i} className="contents">
                  <dt>
                    − {l.label ?? name(l.scope, l.key)} ({l.value} %)
                  </dt>
                  <dd>−{money(l.amount, price.currency)}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
      {price.missing.length > 0 && (
        <p className="muted small">
          {t("missing", {
            list: price.missing.map((x) => name(x.scope, x.key)).join(", "),
          })}
        </p>
      )}
    </div>
  );
}
