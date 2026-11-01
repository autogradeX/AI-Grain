import { CloudUpload } from "lucide-react";
import { useT } from "../i18n";
import { m } from "./OfflineQueue.i18n";
import { syncNow, useQueueStatus } from "./queue";
import { apiSyncClient } from "./sync";

/** What is saved on the device and waiting to upload, with a button to send it now. */
export function OfflineQueueBanner() {
  const t = useT(m);
  const s = useQueueStatus();
  if (s.samples + s.photos === 0) return null;
  const list = [
    s.samples ? t.n("samples", s.samples) : null,
    s.photos ? t.n("photos", s.photos) : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <div className="banner queue-banner" role="status">
      <CloudUpload size={16} aria-hidden /> {t("waiting", { list })}
      {s.refused > 0 && <> {t.n("refused", s.refused)}.</>}{" "}
      <button
        type="button"
        className="link"
        disabled={s.syncing}
        onClick={() => void syncNow(apiSyncClient).catch(() => undefined)}
      >
        {s.syncing ? t("uploading") : t("uploadNow")}
      </button>
    </div>
  );
}
