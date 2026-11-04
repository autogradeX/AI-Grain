import { useT } from "../i18n";
import { Field } from "./ui";
import { m } from "./LotFields.i18n";

/** The e-NAM lot a sample was drawn from, and its farmer. */
export interface Lot {
  enamLotId: string;
  gateEntryNo: string;
  farmerName: string;
  farmerId: string;
  farmerMobile: string;
}

export const emptyLot: Lot = {
  enamLotId: "",
  gateEntryNo: "",
  farmerName: "",
  farmerId: "",
  farmerMobile: "",
};

/** The lot from a sample (nulls as empty strings), for a form. */
export function lotOf(s: {
  [K in keyof Lot]?: string | null | undefined;
}): Lot {
  return {
    enamLotId: s.enamLotId ?? "",
    gateEntryNo: s.gateEntryNo ?? "",
    farmerName: s.farmerName ?? "",
    farmerId: s.farmerId ?? "",
    farmerMobile: s.farmerMobile ?? "",
  };
}

/** The lot as the API takes it: empty fields as null. */
export function lotBody(lot: Lot): { [K in keyof Lot]: string | null } {
  return {
    enamLotId: lot.enamLotId.trim() || null,
    gateEntryNo: lot.gateEntryNo.trim() || null,
    farmerName: lot.farmerName.trim() || null,
    farmerId: lot.farmerId.trim() || null,
    farmerMobile: lot.farmerMobile.trim() || null,
  };
}

/** Form fields for the lot, laid out in a grid-2 form. */
export function LotFields({
  value,
  onChange,
}: {
  value: Lot;
  onChange: (lot: Lot) => void;
}) {
  const t = useT(m);
  const input = (key: keyof Lot, extra: object = {}) => (
    <input
      value={value[key]}
      onChange={(e) => onChange({ ...value, [key]: e.target.value })}
      {...extra}
    />
  );
  return (
    <>
      <Field label={t("enamLotId")}>
        {input("enamLotId", { maxLength: 60, autoComplete: "off" })}
      </Field>
      <Field label={t("gateEntryNo")}>
        {input("gateEntryNo", { maxLength: 60, autoComplete: "off" })}
      </Field>
      <Field label={t("farmerName")}>
        {input("farmerName", { maxLength: 120 })}
      </Field>
      <Field label={t("farmerId")}>
        {input("farmerId", { maxLength: 60, autoComplete: "off" })}
      </Field>
      <Field label={t("farmerMobile")} hint={t("mobileHint")}>
        {input("farmerMobile", {
          type: "tel",
          inputMode: "tel",
          maxLength: 20,
          pattern: "\\+?[0-9 \\-]{6,20}",
        })}
      </Field>
    </>
  );
}
