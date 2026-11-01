import type { FlagReason } from "../api/types";
import { useT } from "../i18n";
import { Badge } from "./ui";
import { m } from "./FlagReason.i18n";

const TONE: Record<FlagReason, "warn" | "bad" | "info" | "neutral"> = {
  cluster: "warn",
  unclear: "warn",
  low_confidence: "warn",
  medium_confidence: "warn",
  defect: "warn",
  harmful: "bad",
  disagreement: "warn",
  spot_check: "info",
};

export function useFlagLabel() {
  const t = useT(m);
  return (reason: FlagReason) => t(reason);
}

/** Why a person is asked to look at this kernel. */
export function FlagReasonBadge({ reason }: { reason: FlagReason | null }) {
  const label = useFlagLabel();
  if (!reason) return null;
  return <Badge tone={TONE[reason]}>{label(reason)}</Badge>;
}
