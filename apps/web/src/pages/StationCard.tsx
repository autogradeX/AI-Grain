import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Card } from "../components/ui";
import { useT } from "../i18n";
import { m } from "./StationCard.i18n";

interface Station {
  station: boolean;
  addresses: string[];
  qr: string | null;
}

/** Station mode: the address phones on the mandi's Wi-Fi open, as a QR code. */
export function StationCard() {
  const t = useT(m);
  const station = useQuery({
    queryKey: ["station"],
    queryFn: () => api.get<Station>("/station"),
  });
  const s = station.data;
  if (!s?.station) return null;
  return (
    <Card title={t("title")}>
      <p className="muted small">{t("intro")}</p>
      {s.addresses.length === 0 ? (
        <p className="warn small">{t("noAddress")}</p>
      ) : (
        <div className="row wrap station">
          {s.qr && <img src={s.qr} alt={t("qr")} width={160} height={160} />}
          <ul className="stack-sm">
            {s.addresses.map((a) => (
              <li key={a}>
                <strong className="mono">{a}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="small">{t("offline")}</p>
    </Card>
  );
}
