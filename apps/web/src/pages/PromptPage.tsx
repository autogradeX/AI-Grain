import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { Standard } from "../api/types";
import { Card, ErrorNote, Field, Spinner } from "../components/ui";

/** Level 1: no app needed, just the Claude app on the phone and this prompt. */
export function PromptPage() {
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
      <h1>Prompt for the Claude app</h1>
      <p className="muted small">
        Level 1, without this app's camera flow: save this prompt in the Claude
        app and send it with a straight-down photo of the grid board, plus a few
        reference photos of each defect type from your own grain. Then pick out
        the listed kernels, check them, weigh the cups and enter the weights on
        a sample here.
      </p>
      <Field label="Standard">
        <select
          value={standardId}
          onChange={(e) => setStandardId(e.target.value)}
        >
          <option value="">Generic (wheat)</option>
          {standards.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.crop})
            </option>
          ))}
        </select>
      </Field>
      {prompt.isPending && <Spinner />}
      <ErrorNote error={prompt.error} />
      {prompt.data && (
        <Card
          title="Prompt"
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
              {copied ? "Copied" : "Copy"}
            </button>
          }
        >
          <pre className="prompt">{prompt.data.prompt}</pre>
        </Card>
      )}
    </div>
  );
}
