import { Link } from "react-router-dom";
import type { Sample } from "../api/types";
import { useT } from "../i18n";
import { m } from "./FakeGrainAlert.i18n";

/** Warns when kernels of the sample are suspected or confirmed to be artificial (fake). */
export function FakeGrainAlert({ sample }: { sample: Sample }) {
  const t = useT(m);
  const suspected = sample.kernels.artificialSuspected ?? 0;
  const confirmed = sample.kernels.artificialConfirmed ?? 0;
  if (!suspected && !confirmed) return null;
  return (
    <div className="card fake-alert" role="alert">
      <strong>{t("title")}</strong>
      {suspected > 0 && <p>{t.n("suspected", suspected)}</p>}
      {confirmed > 0 && <p>{t.n("confirmed", confirmed)}</p>}
      <p className="small">{t("test")}</p>
      {suspected > 0 && (
        <Link className="button" to={`/app/samples/${sample.id}/review`}>
          {t("review")}
        </Link>
      )}
    </div>
  );
}
