import { Scale } from "lucide-react";
import { useState } from "react";
import { readScale, scaleSupported } from "../devices/scale";
import { useT } from "../i18n";
import { m } from "./ScaleButton.i18n";

/**
 * Fills a weight field from a connected balance (USB/RS-232, Chrome or Edge
 * on a computer). Hidden where the browser can't reach a serial port.
 */
export function ScaleButton({
  onWeight,
  disabled,
}: {
  onWeight: (grams: number) => void;
  disabled?: boolean;
}) {
  const t = useT(m);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (!scaleSupported()) return null;
  return (
    <button
      type="button"
      className={`icon-button scale-button${error ? " is-error" : ""}`}
      title={error ? t("failed") : t("read")}
      aria-label={t("read")}
      disabled={disabled || busy}
      onClick={() => {
        setBusy(true);
        setError(false);
        readScale()
          .then((g) => onWeight(g))
          .catch(() => setError(true))
          .finally(() => setBusy(false));
      }}
    >
      <Scale size={16} aria-hidden />
      <span className="sr-only">{busy ? t("reading") : t("read")}</span>
    </button>
  );
}
