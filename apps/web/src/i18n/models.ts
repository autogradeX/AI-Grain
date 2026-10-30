import { useCallback } from "react";
import type { ClaudeModel } from "../api/types";
import { defineMessages, useT } from "./index";

/*
 * Users see processing tiers of "Model Orchestration", never the names of
 * the models behind them. The ids stay internal (API and database).
 */
const m = defineMessages({
  "claude-sonnet-5-5": { en: "Standard (default)", hi: "स्टैंडर्ड (डिफ़ॉल्ट)" },
  "claude-haiku-5-5": {
    en: "Economy (lowest cost)",
    hi: "इकॉनमी (सबसे कम लागत)",
  },
  "claude-opus-5-5": {
    en: "Advanced (difficult samples)",
    hi: "एडवांस्ड (कठिन नमूनों के लिए)",
  },
  other: { en: "Model Orchestration", hi: "मॉडल ऑर्केस्ट्रेशन" },
});

/** The tiers in the order they are offered. */
export const MODEL_TIERS: ClaudeModel[] = [
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
  "claude-opus-5-5",
];

/** The tier name for a model id; unknown ids show as "Model Orchestration". */
export function useModelLabel() {
  const t = useT(m);
  return useCallback(
    (model: string | null | undefined) =>
      model && model in m ? t(model as ClaudeModel) : t("other"),
    [t],
  );
}
