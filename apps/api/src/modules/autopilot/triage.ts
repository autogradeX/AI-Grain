import { groupOf, SOUND, UNCLEAR, type ClassDef } from "@ai-grain/core";
import type { AutopilotSettings, FlagReason } from "../../db/schema.js";

export interface AutopilotPolicy {
  enabled: boolean;
  /** Percent of AI-accepted kernels a person checks anyway (0–20). */
  spotCheckPct: number;
  autoSummary: boolean;
  /** Kernels the first two looks couldn't settle go to the Advanced tier first. */
  expertReview: boolean;
}

/** An organisation's Autopilot settings with defaults filled in: on, 3% spot checks, summaries, expert pass. */
export function autopilotOf(
  settings: AutopilotSettings | null | undefined,
): AutopilotPolicy {
  return {
    enabled: settings?.enabled ?? true,
    spotCheckPct: Math.min(20, Math.max(0, settings?.spotCheckPct ?? 3)),
    autoSummary: settings?.autoSummary ?? true,
    expertReview: settings?.expertReview ?? true,
  };
}

type Confidence = "high" | "medium" | "low";

export interface TriageKernel {
  isCluster: boolean;
  aiClass: string | null;
  aiConfidence: Confidence | null;
  aiClass2: string | null;
  aiConfidence2: Confidence | null;
  expertClass?: string | null;
  expertConfidence?: Confidence | null;
  /** 0–1, stable per kernel: decides spot checks. */
  draw: number;
}

const isHarmful = (classes: readonly ClassDef[], cls: string | null) =>
  !!cls &&
  cls !== SOUND &&
  cls !== UNCLEAR &&
  groupOf(classes, cls) === "harmful";

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
  return !isHarmful(classes, k.aiClass);
}

/** Why the first two looks alone can't settle a kernel, or null when they can. */
function firstLooks(
  k: TriageKernel,
  classes: readonly ClassDef[],
): FlagReason | null {
  if (k.isCluster) return "cluster";
  if (k.aiClass === UNCLEAR) return "unclear";
  if (k.aiConfidence === "low") return "low_confidence";
  if (isHarmful(classes, k.aiClass)) return "harmful";
  if (wantsSecondOpinion(k, classes)) {
    // No second opinion (it failed): the first verdict alone isn't enough.
    if (!k.aiClass2)
      return k.aiClass === SOUND ? "medium_confidence" : "defect";
    if (k.aiClass2 !== k.aiClass || k.aiConfidence2 === "low")
      return "disagreement";
  }
  return null;
}

/**
 * Whether a kernel goes to the expert pass: Autopilot couldn't settle it on
 * two looks, and it isn't harmful (a person checks those anyway).
 */
export function wantsExpert(
  k: TriageKernel,
  classes: readonly ClassDef[],
  policy: AutopilotPolicy,
): boolean {
  if (!policy.enabled || !policy.expertReview || !k.aiClass) return false;
  const reason = firstLooks(k, classes);
  return reason !== null && reason !== "harmful";
}

/**
 * Why a person must look at a kernel, or null when the AI's verdict stands.
 *
 * Without Autopilot every kernel not confidently sound goes to a person. With
 * it, a verdict stands when two independent looks agree (or the kernel is
 * confidently sound). Kernels they can't settle (touching kernels, "unclear",
 * low confidence, disagreement) go to the expert pass, and its verdict stands
 * when it is confident: high confidence, or medium confidence agreeing with
 * an earlier look on a single kernel. Harmful classes (tight limits, rare)
 * always go to a person, and so does a small random spot check that keeps
 * measuring the AI's accuracy.
 */
export function flagFor(
  k: TriageKernel,
  classes: readonly ClassDef[],
  policy: AutopilotPolicy,
): FlagReason | null {
  if (!k.aiClass) return k.isCluster ? "cluster" : null;
  if (!policy.enabled) {
    if (k.isCluster) return "cluster";
    if (k.aiClass === UNCLEAR) return "unclear";
    if (k.aiConfidence === "low") return "low_confidence";
    return k.aiClass === SOUND ? null : "defect";
  }
  const reason = firstLooks(k, classes);
  if (reason === "harmful") return reason;
  if (reason && k.expertClass) {
    const settled =
      k.expertClass !== UNCLEAR &&
      (k.expertConfidence === "high" ||
        (k.expertConfidence === "medium" &&
          !k.isCluster &&
          (k.expertClass === k.aiClass || k.expertClass === k.aiClass2)));
    if (!settled) return reason;
    if (isHarmful(classes, k.expertClass)) return "harmful";
  } else if (reason) return reason;
  return k.draw * 100 < policy.spotCheckPct ? "spot_check" : null;
}
