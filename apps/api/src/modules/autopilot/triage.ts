import { groupOf, SOUND, UNCLEAR, type ClassDef } from "@ai-grain/core";
import type { AutopilotSettings, FlagReason } from "../../db/schema.js";

export interface AutopilotPolicy {
  enabled: boolean;
  /** Percent of AI-accepted kernels a person checks anyway (0–20). */
  spotCheckPct: number;
  autoSummary: boolean;
}

/** An organisation's Autopilot settings with defaults filled in: on, 3% spot checks, summaries. */
export function autopilotOf(
  settings: AutopilotSettings | null | undefined,
): AutopilotPolicy {
  return {
    enabled: settings?.enabled ?? true,
    spotCheckPct: Math.min(20, Math.max(0, settings?.spotCheckPct ?? 3)),
    autoSummary: settings?.autoSummary ?? true,
  };
}

export interface TriageKernel {
  isCluster: boolean;
  aiClass: string | null;
  aiConfidence: "high" | "medium" | "low" | null;
  aiClass2: string | null;
  aiConfidence2: "high" | "medium" | "low" | null;
  /** 0–1, stable per kernel: decides spot checks. */
  draw: number;
}

/**
 * Whether a kernel gets a second opinion (Autopilot): every defect and every
 * sound kernel the first pass wasn't sure about, except kernels a person
 * sees anyway.
 */
export function wantsSecondOpinion(
  k: TriageKernel,
  classes: readonly ClassDef[],
): boolean {
  if (k.isCluster || !k.aiClass || k.aiClass === UNCLEAR) return false;
  if (k.aiConfidence === "low") return false;
  if (k.aiClass === SOUND) return k.aiConfidence !== "high";
  return groupOf(classes, k.aiClass) !== "harmful";
}

/**
 * Why a person must look at a kernel, or null when the AI's verdict stands.
 *
 * Without Autopilot every kernel not confidently sound goes to a person. With
 * it, a verdict stands when two independent passes agree (or the kernel is
 * confidently sound), except: touching kernels, "unclear", low confidence,
 * harmful classes (tight limits, rare, so always checked), disagreement, and
 * a small random spot check that keeps measuring the AI's accuracy.
 */
export function flagFor(
  k: TriageKernel,
  classes: readonly ClassDef[],
  policy: AutopilotPolicy,
): FlagReason | null {
  if (k.isCluster) return "cluster";
  if (!k.aiClass) return null;
  if (k.aiClass === UNCLEAR) return "unclear";
  if (k.aiConfidence === "low") return "low_confidence";
  if (!policy.enabled) return k.aiClass === SOUND ? null : "defect";

  if (k.aiClass !== SOUND && groupOf(classes, k.aiClass) === "harmful")
    return "harmful";
  if (wantsSecondOpinion(k, classes)) {
    // No second opinion (it failed): the first verdict alone isn't enough.
    if (!k.aiClass2)
      return k.aiClass === SOUND ? "medium_confidence" : "defect";
    if (k.aiClass2 !== k.aiClass || k.aiConfidence2 === "low")
      return "disagreement";
  }
  return k.draw * 100 < policy.spotCheckPct ? "spot_check" : null;
}
