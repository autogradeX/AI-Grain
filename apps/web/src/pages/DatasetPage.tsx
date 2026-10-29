import { CLASS_LABELS, type KernelClass } from "@ai-grain/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, download } from "../api/client";
import { Card, ErrorNote, Spinner } from "../components/ui";

interface Stat {
  crop: string;
  cls: KernelClass;
  count: number;
  corrected: number;
}

export function DatasetPage() {
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
      <h1>Training dataset</h1>
      <p className="muted small">
        Every kernel an operator confirmed or corrected is a labelled training
        image. This is the cheapest way to build the dataset a dedicated grading
        machine needs. Corrections are the most valuable labels: they are where
        Claude was wrong.
      </p>
      {stats.isPending && <Spinner />}
      <ErrorNote error={stats.error ?? exportZip.error} />
      {stats.data?.length === 0 && <p>No reviewed kernels yet.</p>}
      {crops.map((crop) => {
        const rows = stats.data!.filter((s) => s.crop === crop);
        const total = rows.reduce((n, r) => n + r.count, 0);
        return (
          <Card
            key={crop}
            title={`${crop} · ${total} labelled kernels`}
            actions={
              <button
                className="primary"
                disabled={exportZip.isPending}
                onClick={() => exportZip.mutate(crop)}
              >
                Download ZIP
              </button>
            }
          >
            <table className="table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Labels</th>
                  <th>Corrected from Claude</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.cls}>
                    <td>{CLASS_LABELS[r.cls]}</td>
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
