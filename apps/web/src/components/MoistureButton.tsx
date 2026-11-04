import { Droplets } from "lucide-react";
import { useState } from "react";
import { moistureSupported, readMoisture } from "../devices/moisture";
import { useT } from "../i18n";
import { m } from "./MoistureButton.i18n";

/**
 * Fills the moisture field from a meter on a serial cable (USB/RS-232,
 * Chrome or Edge on a computer). Hidden where the browser can't reach one.
 */
export function MoistureButton({
  onMoisture,
  disabled,
}: {
  onMoisture: (pct: number) => void;
  disabled?: boolean;
}) {
  const t = useT(m);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (!moistureSupported()) return null;
  return (
    <button
      type="button"
      className={`icon-button scale-button${error ? " is-error" : ""}`}
      title={error ? t("failed") : busy ? t("reading") : t("read")}
      aria-label={t("read")}
      disabled={disabled || busy}
      onClick={() => {
        setBusy(true);
        setError(false);
        readMoisture()
          .then(onMoisture)
          .catch(() => setError(true))
          .finally(() => setBusy(false));
      }}
    >
      <Droplets size={16} aria-hidden />
      <span className="sr-only">{busy ? t("reading") : t("read")}</span>
    </button>
  );
}
