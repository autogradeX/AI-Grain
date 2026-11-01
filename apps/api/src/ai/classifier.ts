import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  CLASS_GROUPS,
  kernelClassIds,
  SOUND,
  slugifyClassId,
  UNCLEAR,
  type ClassDef,
} from "@ai-grain/core";
import { z } from "zod";
import type { ClaudeModel } from "../config.js";
import {
  CLASSIFY_SYSTEM,
  CROP_SYSTEM,
  EXPERT_NOTE,
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

export interface Classifier {
  classify(req: ClassifyRequest): Promise<ClassifyResult>;
  /** A new crop's label and defect classes, from its name. */
  suggestCrop(req: {
    model: ClaudeModel;
    name: string;
  }): Promise<{ suggestion: CropSuggestion; usage: Usage }>;
  summarize(req: SummaryRequest): Promise<{ text: string; usage: Usage }>;
}

export class ClassifierError extends Error {}

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

  async classify(req: ClassifyRequest): Promise<ClassifyResult> {
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

  async suggestCrop(req: { model: ClaudeModel; name: string }) {
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

  async summarize(req: SummaryRequest) {
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
}
