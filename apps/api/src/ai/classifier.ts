import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { kernelClassIds, type ClassDef } from "@ai-grain/core";
import { z } from "zod";
import type { ClaudeModel } from "../config.js";
import { CLASSIFY_SYSTEM, SUMMARY_SYSTEM, classifyContext } from "./prompts.js";

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
  side: "front" | "crease";
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

export interface Classifier {
  classify(
    req: ClassifyRequest,
  ): Promise<{ verdicts: KernelVerdict[]; usage: Usage }>;
  summarize(req: SummaryRequest): Promise<{ text: string; usage: Usage }>;
}

export class ClassifierError extends Error {}

/**
 * The answer's schema. Class ids are listed in the field's description rather
 * than enforced: an unknown id becomes "unclear" below, so one bad verdict
 * can't fail a whole sheet of 30 kernels.
 */
function verdictSheet(classes: readonly ClassDef[]) {
  return z.object({
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
      `Claude declined the request${message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : ""}`,
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new ClassifierError("Claude's answer was cut off before it finished");
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

  async classify(req: ClassifyRequest) {
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
              text: `This sheet shows the ${req.side === "crease" ? "crease side" : "top side"} of ${req.numbers.length} kernels. Each tile covers ${req.windowCm} cm × ${req.windowCm} cm. Numbers on this sheet: ${req.numbers.join(", ")}.`,
            },
          ],
        },
      ],
      output_config: { format: betaZodOutputFormat(verdictSheet(req.classes)) },
    });

    checkStop(message);
    const parsed = message.parsed_output;
    if (!parsed)
      throw new ClassifierError("Claude's answer was not valid JSON");

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
              reason: `Claude answered "${k.class}", which is not a class of this crop: ${k.reason}`,
            },
      );
    }
    for (const n of wanted) {
      verdicts.push({
        number: n,
        cls: "unclear",
        confidence: "low",
        reason: "Claude returned no verdict for this kernel",
      });
    }
    return { verdicts, usage: usageOf(message.usage) };
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

/** Used when no API key is configured: every call fails with a clear message. */
export class UnconfiguredClassifier implements Classifier {
  classify(): Promise<never> {
    return Promise.reject(
      new ClassifierError(
        "Claude is not configured: set ANTHROPIC_API_KEY on the server",
      ),
    );
  }

  summarize(): Promise<never> {
    return this.classify();
  }
}
