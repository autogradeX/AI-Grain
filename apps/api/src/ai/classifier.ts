import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  CLASS_GROUPS,
  kernelClassIds,
  SOUND,
  slugifyClassId,
  UNCLEAR,
  type ClassDef,
  type GradeSpec,
} from "@ai-grain/core";
import { z } from "zod";
import type { ClaudeModel } from "../config.js";
import {
  CLASSIFY_SYSTEM,
  classLines,
  CROP_SYSTEM,
  EXPERT_NOTE,
  STANDARD_SYSTEM,
  SUMMARY_SYSTEM,
  classifyContext,
} from "./prompts.js";

export type Confidence = "high" | "medium" | "low";

export interface ReferenceExample {
  cls: string;
  jpeg: Buffer;
  note: string | null;
}

export interface ClassifyRequest {
  model: ClaudeModel;
  cropLabel: string;
  standardName: string | null;
  /** The crop's defect classes, with the standard's definitions applied. */
  classes: readonly ClassDef[];
  references: readonly ReferenceExample[];
  sheet: Buffer;
  numbers: readonly number[];
  windowCm: number;
  /** "auto": the side wasn't given; the answer says which side is up. */
  side: "front" | "crease" | "auto";
  /**
   * Expert pass: the kernels earlier looks couldn't settle, with what those
   * looks said (by kernel number).
   */
  expert?: { notes: Record<number, string> };
}

export interface ClassifyResult {
  verdicts: KernelVerdict[];
  usage: Usage;
  /** Only when the request's side was "auto". */
  side?: "front" | "crease";
}

export interface KernelVerdict {
  number: number;
  cls: string;
  confidence: Confidence;
  reason: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface SummaryRequest {
  model: ClaudeModel;
  facts: Record<string, unknown>;
}

export interface CropSuggestion {
  label: string;
  classes: ClassDef[];
}

/** A grading standard drafted by Model Orchestration: for the lab to check, never used as is. */
export interface StandardDraft {
  name: string;
  description: string;
  grades: GradeSpec[];
  definitions: Record<string, string>;
  /** Which document and edition the draft follows. */
  basis: string;
  /** Limits and definitions it isn't sure of. */
  uncertain: string[];
  /** Limits of the standard this crop has no class for. */
  unmatched: string[];
}

export interface DraftStandardRequest {
  model: ClaudeModel;
  /** The standard the lab grades against, in its own words. */
  reference: string;
  cropLabel: string;
  classes: readonly ClassDef[];
}

export interface Classifier {
  classify(req: ClassifyRequest): Promise<ClassifyResult>;
  /** A new crop's label and defect classes, from its name. */
  suggestCrop(req: {
    model: ClaudeModel;
    name: string;
  }): Promise<{ suggestion: CropSuggestion; usage: Usage }>;
  summarize(req: SummaryRequest): Promise<{ text: string; usage: Usage }>;
  /** A draft of a grading standard's grades and limits, from the standard's name. */
  draftStandard(
    req: DraftStandardRequest,
  ): Promise<{ draft: StandardDraft; usage: Usage }>;
}

export class ClassifierError extends Error {}

/**
 * Model Orchestration couldn't be reached or is overloaded (no internet,
 * DNS failure, timeout, 5xx, 429): worth trying again later, unlike a
 * refusal or a bad answer.
 */
export class ClassifierUnavailableError extends ClassifierError {}

/** Turns the SDK's network and server errors into ClassifierUnavailableError. */
function unavailable(err: unknown): never {
  if (
    err instanceof Anthropic.APIConnectionError ||
    (err instanceof Anthropic.APIError &&
      typeof err.status === "number" &&
      (err.status >= 500 || err.status === 429))
  ) {
    throw new ClassifierUnavailableError(
      "Model Orchestration can't be reached (no internet connection?)",
    );
  }
  throw err;
}

/**
 * The answer's schema. Class ids are listed in the field's description rather
 * than enforced: an unknown id becomes "unclear" below, so one bad verdict
 * can't fail a whole sheet of 30 kernels.
 */
function verdictSheet(classes: readonly ClassDef[], withSide: boolean) {
  return z.object({
    ...(withSide && {
      side: z
        .enum(["top", "crease"])
        .describe(
          "Which side of most kernels faces the camera: top (rounded back, germ visible) or crease (the groove)",
        ),
    }),
    kernels: z.array(
      z.object({
        number: z.number().int(),
        class: z
          .string()
          .describe(`One of: ${kernelClassIds(classes).join(", ")}`),
        confidence: z.enum(["high", "medium", "low"]),
        reason: z.string(),
      }),
    ),
  });
}

/** Claude Haiku has no server-side refusal fallback; the others route a refusal to a fallback model. */
function fallbackParams(model: ClaudeModel) {
  return model === "claude-haiku-5-5"
    ? {}
    : {
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default" as const,
      };
}

function usageOf(u: Anthropic.Beta.BetaUsage): Usage {
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
}

function checkStop(message: Anthropic.Beta.BetaMessage): void {
  if (message.stop_reason === "refusal") {
    throw new ClassifierError(
      `Model Orchestration declined the request${message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : ""}`,
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new ClassifierError(
      "The Model Orchestration answer was cut off before it finished",
    );
  }
}

const jpegBlock = (data: Buffer): Anthropic.Beta.BetaImageBlockParam => ({
  type: "image",
  source: {
    type: "base64",
    media_type: "image/jpeg",
    data: data.toString("base64"),
  },
});

export class ClaudeClassifier implements Classifier {
  private readonly client: Anthropic;

  constructor(options: { apiKey?: string; fetch?: typeof fetch } = {}) {
    this.client = new Anthropic({
      ...(options.apiKey && { apiKey: options.apiKey }),
      ...(options.fetch && { fetch: options.fetch }),
    });
  }

  classify(req: ClassifyRequest): Promise<ClassifyResult> {
    return this.classifyOnline(req).catch(unavailable);
  }

  private async classifyOnline(req: ClassifyRequest): Promise<ClassifyResult> {
    // Stable per standard and organisation: definitions and reference images go
    // first, marked for caching, so each sheet after the first reads them from cache.
    const prefix: (
      Anthropic.Beta.BetaTextBlockParam | Anthropic.Beta.BetaImageBlockParam
    )[] = [{ type: "text", text: classifyContext(req) }];
    if (req.references.length) {
      prefix.push({
        type: "text",
        text: "Reference examples from this grader's own grain, at the same scale as the sheet tiles:",
      });
      for (const ref of req.references) {
        prefix.push({
          type: "text",
          text: `Example of class "${ref.cls}"${ref.note ? ` (${ref.note})` : ""}:`,
        });
        prefix.push(jpegBlock(ref.jpeg));
      }
    }
    const last = prefix[prefix.length - 1]!;
    prefix[prefix.length - 1] = {
      ...last,
      cache_control: { type: "ephemeral" },
    };

    const message = await this.client.beta.messages.parse({
      model: req.model,
      max_tokens: 16000,
      ...fallbackParams(req.model),
      system: CLASSIFY_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            ...prefix,
            jpegBlock(req.sheet),
            {
              type: "text",
              text: [
                `This sheet shows ${req.side === "auto" ? "one side (say which)" : `the ${req.side === "crease" ? "crease side" : "top side"}`} of ${req.numbers.length} kernels. Each tile covers ${req.windowCm} cm × ${req.windowCm} cm. Numbers on this sheet: ${req.numbers.join(", ")}.`,
                ...(req.expert
                  ? [
                      EXPERT_NOTE,
                      ...req.numbers.map(
                        (n) => `#${n}: ${req.expert!.notes[n] ?? "no notes"}`,
                      ),
                    ]
                  : []),
              ].join("\n"),
            },
          ],
        },
      ],
      output_config: {
        format: betaZodOutputFormat(
          verdictSheet(req.classes, req.side === "auto"),
        ),
      },
    });

    checkStop(message);
    const parsed = message.parsed_output;
    if (!parsed)
      throw new ClassifierError(
        "The Model Orchestration answer was not valid JSON",
      );

    const known = new Set(kernelClassIds(req.classes));
    const wanted = new Set(req.numbers);
    const verdicts: KernelVerdict[] = [];
    for (const k of parsed.kernels) {
      if (!wanted.has(k.number)) continue;
      wanted.delete(k.number);
      verdicts.push(
        known.has(k.class)
          ? {
              number: k.number,
              cls: k.class,
              confidence: k.confidence,
              reason: k.reason,
            }
          : {
              number: k.number,
              cls: "unclear",
              confidence: "low",
              reason: `Model Orchestration answered "${k.class}", which is not a class of this crop: ${k.reason}`,
            },
      );
    }
    for (const n of wanted) {
      verdicts.push({
        number: n,
        cls: "unclear",
        confidence: "low",
        reason: "Model Orchestration returned no verdict for this kernel",
      });
    }
    const side = (parsed as { side?: "top" | "crease" }).side;
    return {
      verdicts,
      usage: usageOf(message.usage),
      ...(req.side === "auto" &&
        side && { side: side === "crease" ? "crease" : "front" }),
    };
  }

  private async suggestCropOnline(req: { model: ClaudeModel; name: string }) {
    const message = await this.client.beta.messages.parse({
      model: req.model,
      max_tokens: 8000,
      ...fallbackParams(req.model),
      system: CROP_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Commodity: ${req.name.trim().slice(0, 80)}`,
        },
      ],
      output_config: { format: betaZodOutputFormat(cropSchema) },
    });
    checkStop(message);
    if (!message.parsed_output)
      throw new ClassifierError(
        "The Model Orchestration answer was not valid JSON",
      );
    return {
      suggestion: cleanCropSuggestion(message.parsed_output, req.name),
      usage: usageOf(message.usage),
    };
  }

  summarize(req: SummaryRequest) {
    return this.summarizeOnline(req).catch(unavailable);
  }

  suggestCrop(req: { model: ClaudeModel; name: string }) {
    return this.suggestCropOnline(req).catch(unavailable);
  }

  draftStandard(req: DraftStandardRequest) {
    return this.draftStandardOnline(req).catch(unavailable);
  }

  private async draftStandardOnline(req: DraftStandardRequest) {
    const message = await this.client.beta.messages.parse({
      model: req.model,
      max_tokens: 12000,
      ...fallbackParams(req.model),
      system: STANDARD_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Standard: ${req.reference.trim().slice(0, 300)}
Commodity: ${req.cropLabel}

The tool's classes for this commodity, by group (use these ids):
${classLines(req.classes)}`,
        },
      ],
      output_config: { format: betaZodOutputFormat(standardSchema) },
    });
    checkStop(message);
    if (!message.parsed_output)
      throw new ClassifierError(
        "The Model Orchestration answer was not valid JSON",
      );
    return {
      draft: cleanStandardDraft(
        message.parsed_output,
        req.classes,
        req.reference,
      ),
      usage: usageOf(message.usage),
    };
  }

  private async summarizeOnline(req: SummaryRequest) {
    const message = await this.client.beta.messages.create({
      model: req.model,
      max_tokens: 4000,
      ...fallbackParams(req.model),
      output_config: { effort: "low" },
      system: SUMMARY_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Write the report for this sample:\n${JSON.stringify(req.facts, null, 2)}`,
        },
      ],
    });
    checkStop(message);
    const text = message.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("\n")
      .trim();
    return { text, usage: usageOf(message.usage) };
  }
}

const cropSchema = z.object({
  label: z.string(),
  classes: z.array(
    z.object({
      label: z.string(),
      group: z.enum(CLASS_GROUPS),
      description: z.string(),
      massFactor: z.number(),
    }),
  ),
});

/**
 * Turns the model's answer into classes the crop editor accepts: ids from
 * labels, no duplicates or reserved ids, mass factors in range. Throws when
 * nothing usable is left.
 */
export function cleanCropSuggestion(
  raw: z.infer<typeof cropSchema>,
  name: string,
): CropSuggestion {
  const seen = new Set<string>([SOUND, UNCLEAR]);
  const classes: ClassDef[] = [];
  for (const c of raw.classes.slice(0, 30)) {
    const label = c.label.trim().slice(0, 80);
    if (!label) continue;
    const id = slugifyClassId(label);
    if (seen.has(id)) continue;
    seen.add(id);
    const factor = Number.isFinite(c.massFactor) ? c.massFactor : 1;
    classes.push({
      id,
      label,
      group: c.group,
      description: c.description.trim().slice(0, 1000) || undefined,
      massFactor: Math.round(Math.min(5, Math.max(0.05, factor)) * 100) / 100,
    });
  }
  if (!classes.length)
    throw new ClassifierError(
      "Model Orchestration didn't suggest any usable classes",
    );
  return { label: raw.label.trim().slice(0, 80) || name.trim(), classes };
}

const standardSchema = z.object({
  name: z.string(),
  description: z.string(),
  basis: z.string(),
  grades: z.array(
    z.object({
      grade: z.string(),
      limits: z.array(z.object({ classId: z.string(), maxPct: z.number() })),
      groupLimits: z.array(
        z.object({ group: z.enum(CLASS_GROUPS), maxPct: z.number() }),
      ),
      maxTotalDefectsPct: z.number().nullable(),
      maxMoisturePct: z.number().nullable(),
      minTestWeightKgPerHl: z.number().nullable(),
      minProteinPct: z.number().nullable(),
      minOilPct: z.number().nullable(),
    }),
  ),
  definitions: z.array(
    z.object({ classId: z.string(), definition: z.string() }),
  ),
  uncertain: z.array(z.string()),
  unmatched: z.array(z.string()),
});

/**
 * Turns the model's answer into a standard the editor accepts: only this
 * crop's class ids (others are reported as unmatched), percentages within
 * 0–100, unique grade names. A draft with no grades is still returned: its
 * basis says why.
 */
export function cleanStandardDraft(
  raw: z.infer<typeof standardSchema>,
  classes: readonly ClassDef[],
  reference: string,
): StandardDraft {
  const ids = new Set(classes.map((c) => c.id));
  const unmatched = raw.unmatched.map((u) => u.trim().slice(0, 200));
  const pct = (v: number | null) =>
    v === null || !Number.isFinite(v) || v < 0 || v > 100
      ? undefined
      : Math.round(v * 100) / 100;
  const seen = new Set<string>();
  const grades: GradeSpec[] = [];
  for (const g of raw.grades.slice(0, 20)) {
    const grade = g.grade.trim().slice(0, 40);
    if (!grade || seen.has(grade)) continue;
    seen.add(grade);
    const maxDefectPct: Record<string, number> = {};
    for (const l of g.limits) {
      const v = pct(l.maxPct);
      if (v === undefined) continue;
      if (ids.has(l.classId)) maxDefectPct[l.classId] = v;
      else unmatched.push(`${l.classId}: ${v}% (${grade})`);
    }
    const spec: GradeSpec = { grade, maxDefectPct };
    const groups: Partial<Record<(typeof CLASS_GROUPS)[number], number>> = {};
    for (const l of g.groupLimits) {
      const v = pct(l.maxPct);
      if (v !== undefined) groups[l.group] = v;
    }
    if (Object.keys(groups).length) spec.maxGroupPct = groups;
    const total = pct(g.maxTotalDefectsPct);
    const moisture = pct(g.maxMoisturePct);
    const tw =
      g.minTestWeightKgPerHl !== null &&
      g.minTestWeightKgPerHl > 0 &&
      g.minTestWeightKgPerHl < 200
        ? Math.round(g.minTestWeightKgPerHl * 10) / 10
        : undefined;
    if (total !== undefined) spec.maxTotalDefectsPct = total;
    if (moisture !== undefined) spec.maxMoisturePct = moisture;
    if (tw !== undefined) spec.minTestWeightKgPerHl = tw;
    const protein = pct(g.minProteinPct);
    const oil = pct(g.minOilPct);
    if (protein !== undefined) spec.minProteinPct = protein;
    if (oil !== undefined) spec.minOilPct = oil;
    grades.push(spec);
  }
  const definitions: Record<string, string> = {};
  for (const d of raw.definitions)
    if (ids.has(d.classId) && d.definition.trim())
      definitions[d.classId] = d.definition.trim().slice(0, 1000);
  return {
    name: raw.name.trim().slice(0, 120) || reference.trim().slice(0, 120),
    description: raw.description.trim().slice(0, 2000),
    grades,
    definitions,
    basis: raw.basis.trim().slice(0, 500),
    uncertain: raw.uncertain.map((u) => u.trim().slice(0, 300)).slice(0, 30),
    unmatched: [...new Set(unmatched)].slice(0, 30),
  };
}

/** Used when no API key is configured: every call fails with a clear message. */
export class UnconfiguredClassifier implements Classifier {
  classify(): Promise<never> {
    return Promise.reject(
      new ClassifierError(
        "Model Orchestration is not configured: set ANTHROPIC_API_KEY on the server",
      ),
    );
  }

  summarize(): Promise<never> {
    return this.classify();
  }

  suggestCrop(): Promise<never> {
    return this.classify();
  }

  draftStandard(): Promise<never> {
    return this.classify();
  }
}
