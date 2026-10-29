import { CLASS_LABELS, DEFECT_CLASSES, type DefectClass } from "@ai-grain/core";

export type Definitions = Partial<Record<DefectClass, string>>;

export function definitionLines(definitions: Definitions): string {
  return DEFECT_CLASSES.map((cls) => {
    const text = definitions[cls]?.trim();
    return `- ${cls} (${CLASS_LABELS[cls]})${text ? `: ${text}` : ""}`;
  }).join("\n");
}

/** System prompt for kernel classification. Stable across requests so it can be cached. */
export const CLASSIFY_SYSTEM = `You are assisting a grain grader who screens samples with a phone camera and a precise scale.

You receive sheets of numbered close-up photos. Each tile shows one kernel (or one piece of material) on a dark board, and every tile on a sheet is at the same scale, so sizes are comparable between tiles. Small parts of neighbouring kernels may show at tile edges; judge only the object centred in the tile.

For every numbered tile, give exactly one class:
- "sound" if the kernel shows no defect.
- One defect class from the list in the request. If several defects apply, choose the one the grader would sort the kernel into: the most serious defect.
- "unclear" if the photo is too poor to judge (blur, glare, cut off, two kernels overlapping). Say so instead of guessing.

Also give a confidence (high, medium or low) and a short reason naming what you see, for example "germ end split, rootlet visible". The grader checks every flagged kernel by eye and makes the final call, so be honest about uncertainty: subtle defects such as light heat damage, early sprouting, or Fusarium versus weather bleaching should usually get medium or low confidence.

Return one entry for every number on the sheet, and no other numbers.`;

export function classifyContext(input: {
  crop: string;
  standardName: string | null;
  definitions: Definitions;
}): string {
  return `Crop: ${input.crop}.
Standard: ${input.standardName ?? "not specified"}.

Defect classes and how this standard defines them:
${definitionLines(input.definitions)}`;
}

export const SUMMARY_SYSTEM = `You write short grain screening reports for farm and intake staff. Use plain language and the numbers given; do not invent measurements. The method is a screening and pre-check tool, not official grading: say so once. Mention any limit the sample fails, which defects drove the result, and anything the operator should double-check. At most 180 words, no headings, no tables.`;

/** The Level 1 prompt: for graders who use the Claude app directly with a whole-board photo. */
export function level1Prompt(input: {
  crop: string;
  standardName: string | null;
  definitions: Definitions;
}): string {
  const classes = DEFECT_CLASSES.map((c) => CLASS_LABELS[c].toLowerCase()).join(
    ", ",
  );
  const defined = DEFECT_CLASSES.filter((c) => input.definitions[c]?.trim());
  const definitionsBlock = defined.length
    ? `\nDefinitions from the standard:\n${defined
        .map(
          (c) => `- ${CLASS_LABELS[c]}: ${input.definitions[c]?.trim() ?? ""}`,
        )
        .join("\n")}\n`
    : "";
  return `You are assisting a grain grader. Crop: ${input.crop}. Standard: ${input.standardName ?? "[name of standard]"}.
The photo shows kernels on a dark board with a 1 cm grid: columns A-T, rows 1-28.
Defect classes: ${classes}.
${definitionsBlock}For every kernel that is NOT sound, list: grid cell, class, confidence
(high / medium / low) and a short reason.
Then give the number of flagged kernels per class.
If the image is too poor to judge a kernel, say so instead of guessing.
Return a table only.`;
}
