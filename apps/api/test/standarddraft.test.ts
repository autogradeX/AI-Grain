import { describe, expect, it } from "vitest";
import { cleanStandardDraft } from "../src/ai/classifier.js";
import { bearer, createTestApp, register } from "./helpers.js";

describe("drafting a standard with Model Orchestration", () => {
  it("keeps only the crop's classes, sane numbers and unique grades", () => {
    const draft = cleanStandardDraft(
      {
        name: " FCI rice ",
        description: "",
        basis: "Uniform specifications 2025-26.",
        grades: [
          {
            grade: "FAQ",
            limits: [
              { classId: "broken", maxPct: 25 },
              { classId: "husk", maxPct: 1 },
              { classId: "stones", maxPct: 140 },
            ],
            groupLimits: [{ group: "impurity", maxPct: 0.5 }],
            maxTotalDefectsPct: null,
            maxMoisturePct: 14,
            minTestWeightKgPerHl: -3,
          },
          {
            grade: "FAQ",
            limits: [],
            groupLimits: [],
            maxTotalDefectsPct: null,
            maxMoisturePct: null,
            minTestWeightKgPerHl: null,
          },
        ],
        definitions: [
          { classId: "broken", definition: "Less than 3/4 of a kernel." },
          { classId: "nope", definition: "Ignored." },
        ],
        uncertain: ["Moisture"],
        unmatched: ["Damaged grains: 3%"],
      },
      [
        { id: "broken", label: "Broken", group: "broken_defective" },
        { id: "stones", label: "Stones", group: "impurity" },
      ],
      "FCI rice",
    );
    expect(draft.name).toBe("FCI rice");
    expect(draft.grades).toEqual([
      {
        grade: "FAQ",
        maxDefectPct: { broken: 25 },
        maxGroupPct: { impurity: 0.5 },
        maxMoisturePct: 14,
      },
    ]);
    expect(draft.definitions).toEqual({
      broken: "Less than 3/4 of a kernel.",
    });
    expect(draft.unmatched).toEqual(["Damaged grains: 3%", "husk: 1% (FAQ)"]);
  });

  it("drafts for admins without saving, and the draft saves as a standard", async () => {
    const t = await createTestApp();
    try {
      const { token } = await register(t, "std@mandi.test", "Mandi");
      const post = (url: string, payload: object, as = token) =>
        t.app.inject({ method: "POST", url, headers: bearer(as), payload });
      const res = await post("/api/standards/draft", {
        crop: "rice",
        reference: "Test agency rice specification 2026",
      });
      expect(res.statusCode).toBe(200);
      const { draft } = res.json<{
        draft: {
          name: string;
          grades: { grade: string; maxDefectPct: Record<string, number> }[];
          definitions: Record<string, string>;
          uncertain: string[];
          unmatched: string[];
        };
      }>();
      expect(draft.grades.map((g) => g.grade)).toEqual(["A", "B"]);
      expect(draft.grades[1]!.maxDefectPct).toEqual({ broken: 4 });
      expect(draft.uncertain).toHaveLength(1);
      // A class the crop lacks: reported, not dropped silently.
      expect(
        draft.unmatched.some((u) => u.startsWith("not_a_class_here")),
      ).toBe(true);
      // The request named this crop's classes, on the Advanced tier.
      expect(
        t.classifier.drafts[0]!.classes.some((c) => c.id === "broken"),
      ).toBe(true);
      expect(t.classifier.drafts[0]!.model).toBe(t.ctx.config.EXPERT_MODEL);
      // Nothing saved yet.
      const list = await t.app.inject({
        method: "GET",
        url: "/api/standards",
        headers: bearer(token),
      });
      expect(list.json<unknown[]>()).toHaveLength(0);
      // As the editor sends it after checking.
      const saved = await post("/api/standards", {
        name: draft.name,
        crop: "rice",
        grades: draft.grades,
        definitions: draft.definitions,
      });
      expect(saved.statusCode).toBe(201);
    } finally {
      await t.close();
    }
  });
});
