import { describe, expect, it } from "vitest";
import { ClaudeClassifier } from "../src/ai/classifier.js";

interface Captured {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

function fakeFetch(
  captured: Captured[],
  reply: Record<string, unknown>,
): typeof fetch {
  return (input, init) => {
    captured.push({
      url: input instanceof Request ? input.url : input.toString(),
      headers: new Headers(init?.headers),
      body: JSON.parse(init?.body as string) as Record<string, unknown>,
    });
    return Promise.resolve(
      new Response(JSON.stringify(reply), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
}

const message = (text: string, stop_reason = "end_turn") => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5-5",
  content: [{ type: "text", text }],
  stop_reason,
  stop_sequence: null,
  usage: {
    input_tokens: 1200,
    output_tokens: 300,
    cache_read_input_tokens: 900,
    cache_creation_input_tokens: 0,
  },
});

const request = {
  cropLabel: "Wheat",
  standardName: "Test",
  classes: [
    {
      id: "broken",
      label: "Broken",
      group: "broken_defective" as const,
      description: "Pieces of kernel.",
    },
    { id: "ergot", label: "Ergot", group: "harmful" as const },
  ],
  references: [
    {
      cls: "broken" as const,
      jpeg: Buffer.from([0xff, 0xd8, 0xff]),
      note: null,
    },
  ],
  sheet: Buffer.from([0xff, 0xd8, 0xff]),
  numbers: [1, 2, 3],
  windowCm: 1.6,
  side: "front" as const,
};

describe("ClaudeClassifier", () => {
  it("asks for the side when it wasn't given, and passes expert notes", async () => {
    const captured: Captured[] = [];
    const classifier = new ClaudeClassifier({
      apiKey: "test-key",
      fetch: fakeFetch(
        captured,
        message(
          JSON.stringify({
            side: "crease",
            kernels: [1, 2, 3].map((number) => ({
              number,
              class: "sound",
              confidence: "high",
              reason: "clear",
            })),
          }),
        ),
      ),
    });
    const res = await classifier.classify({
      ...request,
      model: "claude-opus-5-5",
      side: "auto",
      expert: { notes: { 2: 'first look: "broken" (low confidence)' } },
    });
    expect(res.side).toBe("crease");
    const body = JSON.stringify(captured[0]!.body);
    expect(body).toContain("Expert pass");
    expect(body).toContain('#2: first look: \\"broken\\" (low confidence)');
    expect(body).toContain("say which");
    // The schema asks for the side.
    expect(body).toContain('"required":["side","kernels"]');
  });

  it("sends a cached prefix, a JSON schema and refusal fallbacks", async () => {
    const captured: Captured[] = [];
    const classifier = new ClaudeClassifier({
      apiKey: "test-key",
      fetch: fakeFetch(
        captured,
        message(
          JSON.stringify({
            kernels: [
              {
                number: 1,
                class: "broken",
                confidence: "high",
                reason: "half kernel",
              },
              {
                number: 2,
                class: "sound",
                confidence: "high",
                reason: "plump",
              },
              {
                number: 9,
                class: "sound",
                confidence: "high",
                reason: "not on this sheet",
              },
              {
                number: 3,
                class: "gold_nugget",
                confidence: "high",
                reason: "shiny",
              },
            ],
          }),
        ),
      ),
    });
    const result = await classifier.classify({
      ...request,
      model: "claude-sonnet-5-5",
    });

    expect(result.verdicts).toEqual([
      { number: 1, cls: "broken", confidence: "high", reason: "half kernel" },
      { number: 2, cls: "sound", confidence: "high", reason: "plump" },
      {
        number: 3,
        cls: "unclear",
        confidence: "low",
        reason:
          'Model Orchestration answered "gold_nugget", which is not a class of this crop: shiny',
      },
    ]);
    expect(result.usage).toEqual({
      inputTokens: 1200,
      outputTokens: 300,
      cacheReadTokens: 900,
      cacheWriteTokens: 0,
    });

    const sent = captured[0]!;
    expect(sent.body.model).toBe("claude-sonnet-5-5");
    expect(sent.body.fallbacks).toBe("default");
    expect(sent.headers.get("anthropic-beta")).toContain(
      "server-side-fallback-2026-07-01",
    );
    expect(sent.body.output_config).toMatchObject({
      format: { type: "json_schema" },
    });
    const content = (
      sent.body.messages as { content: Record<string, unknown>[] }[]
    )[0]!.content;
    // Definitions, reference label and reference image; the image carries the cache breakpoint.
    const cached = content.findIndex((b) => b.cache_control);
    expect(content[cached]?.type).toBe("image");
    expect(content[0]?.text).toMatch(/Pieces of kernel/);
    expect(content[0]?.text).toMatch(/Harmful & disease:\n- "ergot" \(Ergot\)/);
    // The answer may only use this crop's classes.
    const format = sent.body.output_config as { format: { schema: unknown } };
    expect(JSON.stringify(format.format.schema)).toContain(
      "One of: sound, broken, ergot, unclear",
    );
    expect(content.at(-1)?.text).toMatch(/Numbers on this sheet: 1, 2, 3/);
  });

  it("sends no fallbacks for Claude Haiku", async () => {
    const captured: Captured[] = [];
    const classifier = new ClaudeClassifier({
      apiKey: "test-key",
      fetch: fakeFetch(captured, message(JSON.stringify({ kernels: [] }))),
    });
    await classifier.classify({ ...request, model: "claude-haiku-5-5" });
    expect(captured[0]!.body.fallbacks).toBeUndefined();
  });

  it("reports a refusal instead of returning verdicts", async () => {
    const classifier = new ClaudeClassifier({
      apiKey: "test-key",
      fetch: fakeFetch([], {
        ...message(""),
        content: [],
        stop_reason: "refusal",
        stop_details: { type: "refusal", category: null, explanation: null },
      }),
    });
    await expect(
      classifier.classify({ ...request, model: "claude-sonnet-5-5" }),
    ).rejects.toThrow(/declined/);
  });
});
