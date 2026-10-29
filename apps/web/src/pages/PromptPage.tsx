import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { useCrops } from "../api/crops";
import type { Standard } from "../api/types";
import { Card, ErrorNote, Field, Spinner } from "../components/ui";
import { useT } from "../i18n";
import { useGrainLabels } from "../i18n/common";
import { m } from "./PromptPage.i18n";

/** Level 1: no app needed, just the Claude app on the phone and this prompt. */
export function PromptPage() {
  const t = useT(m);
  const { cropLabel } = useGrainLabels();
  const crops = useCrops(true);
  const standards = useQuery({
    queryKey: ["standards"],
    queryFn: () => api.get<Standard[]>("/standards"),
  });
  const [standardId, setStandardId] = useState("");
  const [copied, setCopied] = useState(false);
  const prompt = useQuery({
    queryKey: ["prompt", standardId],
    queryFn: () =>
      api.get<{ prompt: string }>(
        `/prompts/level1${standardId ? `?standardId=${standardId}` : ""}`,
      ),
  });
  return (
    <div className="stack">
      <h1>{t("title")}</h1>
      <p className="muted small">{t("intro")}</p>
      <p className="muted small">{t("englishHint")}</p>
      <Field label={t("standard")}>
        <select
          value={standardId}
          onChange={(e) => setStandardId(e.target.value)}
        >
          <option value="">{t("generic")}</option>
          {standards.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} (
              {cropLabel(
                crops.data?.find((c) => c.key === s.crop)?.label ?? s.crop,
              )}
              )
            </option>
          ))}
        </select>
      </Field>
      {prompt.isPending && <Spinner />}
      <ErrorNote error={prompt.error} />
      {prompt.data && (
        <Card
          title={t("prompt")}
          actions={
            <button
              onClick={() =>
                void navigator.clipboard
                  .writeText(prompt.data.prompt)
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  })
              }
            >
              {copied ? t("copied") : t("copy")}
            </button>
          }
        >
          <pre className="prompt">{prompt.data.prompt}</pre>
        </Card>
      )}
    </div>
  );
}
