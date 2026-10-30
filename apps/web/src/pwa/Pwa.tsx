import { Download, Share, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Card, Field } from "../components/ui";
import { useT } from "../i18n";
import { m } from "./Pwa.i18n";
import { applyUpdate, promptInstall, usePhoneView, usePwa } from "./pwa";

/** "A new version is ready": shown on every page once an update has downloaded. */
export function UpdateToast() {
  const t = useT(m);
  const { updateReady } = usePwa();
  const [dismissed, setDismissed] = useState(false);
  if (!updateReady || dismissed) return null;
  return (
    <div className="toast" role="status">
      <span>{t("updateReady")}</span>
      <button className="primary" onClick={applyUpdate}>
        {t("reload")}
      </button>
      <button className="link" onClick={() => setDismissed(true)}>
        {t("later")}
      </button>
    </div>
  );
}

export function OfflineBanner() {
  const t = useT(m);
  const { online } = usePwa();
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <WifiOff size={16} aria-hidden /> {t("offline")}
    </div>
  );
}

/** Steps for browsers without an install prompt (iPhone Safari and others). */
function InstallDialog({
  ios,
  onClose,
}: {
  ios: boolean;
  onClose: () => void;
}) {
  const t = useT(m);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className="sheet" onClose={onClose}>
      <div className="sheet-head">
        <img src="/icons/apple-touch-icon.png" alt="" width={48} height={48} />
        <strong>{t("installTitle")}</strong>
        <button
          className="icon-button"
          aria-label={t("close")}
          onClick={onClose}
        >
          <X size={20} aria-hidden />
        </button>
      </div>
      <p className="muted small">{t("installWhy")}</p>
      {ios ? (
        <ol className="install-steps">
          <li>
            {t.rich("iosStep1", {
              icon: <Share size={16} aria-label="Share" />,
            })}
          </li>
          <li>{t("iosStep2")}</li>
          <li>{t("iosStep3")}</li>
        </ol>
      ) : (
        <p>{t("otherBrowser")}</p>
      )}
    </dialog>
  );
}

/**
 * Installs the app: the browser's own prompt where there is one, otherwise
 * the steps. Hidden once the app runs installed.
 */
export function InstallButton({
  className,
  label = true,
}: {
  className?: string;
  label?: boolean;
}) {
  const t = useT(m);
  const pwa = usePwa();
  const [steps, setSteps] = useState(false);
  if (pwa.standalone) return null;
  return (
    <>
      <button
        className={className}
        title={label ? undefined : t("installApp")}
        aria-label={label ? undefined : t("installApp")}
        onClick={() => {
          if (pwa.canPrompt) void promptInstall();
          else setSteps(true);
        }}
      >
        <Download size={18} strokeWidth={1.9} aria-hidden />
        {label && <span className="side-label">{t("installApp")}</span>}
      </button>
      {steps && <InstallDialog ios={pwa.ios} onClose={() => setSteps(false)} />}
    </>
  );
}

/** Settings card: install, and the phone layout choice. */
export function AppSettingsCard() {
  const t = useT(m);
  const pwa = usePwa();
  const [view, setView] = usePhoneView();
  return (
    <Card title={t("appCard")}>
      {pwa.standalone ? (
        <p className="small">{t("installed")}</p>
      ) : (
        <div className="stack-sm">
          <p className="muted small">{t("installWhy")}</p>
          <div>
            <InstallButton className="primary" />
          </div>
        </div>
      )}
      <Field label={t("phoneLayout")} hint={t("phoneLayoutHint")}>
        <select
          value={view}
          onChange={(e) => setView(e.target.value as "app" | "classic")}
        >
          <option value="app">{t("viewApp")}</option>
          <option value="classic">{t("viewClassic")}</option>
        </select>
      </Field>
    </Card>
  );
}
