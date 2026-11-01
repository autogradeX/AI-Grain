import { useQuery } from "@tanstack/react-query";
import { Lightbulb } from "lucide-react";
import { api } from "../api/client";
import type { StandardSuggestion } from "../api/types";
import { useT } from "../i18n";
import { m } from "./StandardSuggestion.i18n";

/** The suggested standard for a crop, from this organisation's own samples. */
export function useStandardSuggestion(crop: string) {
  return useQuery({
    queryKey: ["standard-suggestion", crop],
    queryFn: () =>
      api.get<{ suggestion: StandardSuggestion | null }>(
        `/standards/suggest?crop=${encodeURIComponent(crop)}`,
      ),
    select: (r) => r.suggestion,
  });
}

/** "Suggested: X (why)", with a button to apply it when `onUse` is given. */
export function StandardSuggestionNote({
  suggestion,
  onUse,
  busy,
}: {
  suggestion: StandardSuggestion;
  onUse?: () => void;
  busy?: boolean;
}) {
  const t = useT(m);
  const r = suggestion.reason;
  const why =
    r.kind === "usage"
      ? t("usage", { used: r.used, of: r.of })
      : t(r.kind === "only" ? "only" : "newest");
  return (
    <div className="suggestion small">
      <Lightbulb size={16} aria-hidden />
      <span>
        <strong>{t("suggested", { name: suggestion.standard.name })}</strong>{" "}
        <span className="muted">({why})</span>
      </span>
      {onUse && (
        <button type="button" disabled={busy} onClick={onUse}>
          {t("use")}
        </button>
      )}
    </div>
  );
}
