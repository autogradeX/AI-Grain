import { useMutation, useQuery } from "@tanstack/react-query";
import { api, download } from "../api/client";
import { useCrops } from "../api/crops";
import { Card, ErrorNote, Spinner } from "../components/ui";
import { useT } from "../i18n";
import { useGrainLabels } from "../i18n/common";
import { m } from "./DatasetPage.i18n";

interface Stat {
  crop: string;
  cls: string;
  count: number;
  corrected: number;
}

export function DatasetPage() {
  const t = useT(m);
  const { classLabel, cropLabel } = useGrainLabels();
  const cropProfiles = useCrops(true);
  const stats = useQuery({
    queryKey: ["dataset"],
    queryFn: () => api.get<Stat[]>("/dataset/stats"),
  });
  const exportZip = useMutation({
    mutationFn: (crop: string) =>
      download(
        `/dataset/export.zip?crop=${encodeURIComponent(crop)}`,
        `ai-grain-${crop}.zip`,
      ),
  });
  const crops = [...new Set(stats.data?.map((s) => s.crop) ?? [])];

  return (
    <div className="stack">
      <h1>{t("title")}</h1>
      <p className="muted small">{t("intro")}</p>
      {stats.isPending && <Spinner />}
      <ErrorNote error={stats.error ?? exportZip.error} />
      {stats.data?.length === 0 && <p>{t("empty")}</p>}
      {crops.map((crop) => {
        const rows = stats.data!.filter((s) => s.crop === crop);
        const total = rows.reduce((n, r) => n + r.count, 0);
        const profile = cropProfiles.data?.find((c) => c.key === crop);
        return (
          <Card
            key={crop}
            title={t.n("cardTitle", total, {
              crop: cropLabel(profile?.label ?? crop),
            })}
            actions={
              <button
                className="primary"
                disabled={exportZip.isPending}
                onClick={() => exportZip.mutate(crop)}
              >
                {t("downloadZip")}
              </button>
            }
          >
            <table className="table">
              <thead>
                <tr>
                  <th>{t("cls")}</th>
                  <th>{t("labels")}</th>
                  <th>{t("corrected")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.cls}>
                    <td>{classLabel(profile?.classes ?? [], r.cls)}</td>
                    <td className="num">{r.count}</td>
                    <td className="num">{r.corrected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        );
      })}
    </div>
  );
}
