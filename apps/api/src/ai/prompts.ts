import { CLASS_GROUPS, GROUP_LABELS, type ClassDef } from "@ai-grain/core";

/** The crop's defect classes, grouped, with each class's definition. */
export function classLines(classes: readonly ClassDef[]): string {
  return CLASS_GROUPS.flatMap((g) => {
    const inGroup = classes.filter((c) => c.group === g);
    if (!inGroup.length) return [];
    return [
      `${GROUP_LABELS[g]}:`,
      ...inGroup.map(
        (c) =>
          `- "${c.id}" (${c.label})${c.description?.trim() ? `: ${c.description.trim()}` : ""}`,
      ),
    ];
  }).join("\n");
}

/** System prompt for kernel classification. Stable across requests so it can be cached. */
export const CLASSIFY_SYSTEM = `You are assisting a grain grader who screens samples with a phone camera and a precise scale.

You receive sheets of numbered close-up photos. Each tile shows one kernel (or one piece of material) on a dark board, and every tile on a sheet is at the same scale, so sizes are comparable between tiles. Small parts of neighbouring kernels may show at tile edges; judge only the object centred in the tile.

For every numbered tile, give exactly one class:
- "sound" if the kernel shows no defect.
- One defect class from the list in the request. If several defects apply, choose the one the grader would sort the kernel into: the most serious defect.
- "unclear" if the photo is too poor to judge (blur, glare, cut off, two kernels overlapping). Say so instead of guessing.

Also give a confidence and a short reason naming what you see, for example "germ end split, rootlet visible":
- high: the tile clearly shows it.
- medium: fairly sure, but a subtle feature could change it (light heat damage, early sprouting, Fusarium versus weather bleaching).
- low: you can't really tell from this photo.
Kernels you are unsure about are checked again and, if needed, by the grader, so be honest about uncertainty, but don't mark a clear kernel low just to be safe.

Return one entry for every number on the sheet, and no other numbers.`;

/** Added to an expert-pass sheet, before the per-kernel notes. */
export const EXPERT_NOTE = `Expert pass: earlier looks at these kernels disagreed or were unsure. Their notes follow, by number. Judge each tile yourself from the photo; the notes are only context. Where a note says a tile shows touching kernels, give a class only if every kernel in the tile has it (usually "sound"), otherwise "unclear". Give high confidence only when the tile clearly shows the class.`;

export function classifyContext(input: {
  cropLabel: string;
  standardName: string | null;
  classes: readonly ClassDef[];
}): string {
  return `Crop: ${input.cropLabel}.
Standard: ${input.standardName ?? "not specified"}.

Defect classes by group, with how this grader defines them. Use the id in quotes:
${classLines(input.classes)}`;
}

/** System prompt for suggesting a new crop's defect classes. */
export const CROP_SYSTEM = `You help a grain quality lab set up a new commodity (a cereal, pulse, oilseed, millet, spice seed or similar) in a photo-based screening tool.

The tool photographs kernels or seeds one by one on a dark board, sorts each into "sound" or one defect class, and estimates mass percentages from each object's projected area. Classes fall into exactly four groups:
- admixture: kernels of other cultivated grains or seeds mixed in.
- broken_defective: damaged or substandard kernels of the commodity itself (broken, shrivelled, discoloured, insect-damaged, sprouted, immature, and so on).
- impurity: foreign material that isn't grain: stones, soil, chaff, husks, stalks, weed seeds, dead insects.
- harmful: toxic or diseased material that matters for food and feed safety.

For the commodity named, give:
- label: its usual English name; add a common alternative name in brackets when that helps, e.g. "Rajma (kidney beans)".
- classes: 8 to 20 defect classes that graders of this commodity actually sort into, in the four groups. Don't include "sound" or "unclear"; the tool adds those. For each: a short label; a description of what it looks like in a top-down photo, so a vision model can recognise it (one or two sentences); and a massFactor: weight relative to a sound kernel of the same projected area (1 for most kernel defects, above 1 for stones and soil, below 1 for chaff, husks or hollow insect-damaged kernels).

Use categories common in trade and national standards for this commodity, but no numeric limits: the lab sets those itself.`;

export const SUMMARY_SYSTEM = `You write short grain screening reports for farm and intake staff. Use plain language and the numbers given; do not invent measurements. The method is a screening and pre-check tool, not official grading: say so once. Mention any limit the sample fails, which defects drove the result, and anything the operator should double-check. At most 180 words, no headings, no tables.`;

/** The Level 1 prompt: for graders who use the Claude app directly with a whole-board photo. */
export function level1Prompt(input: {
  cropLabel: string;
  standardName: string | null;
  classes: readonly ClassDef[];
}): string {
  return `You are assisting a grain grader. Crop: ${input.cropLabel}. Standard: ${input.standardName ?? "[name of standard]"}.
The photo shows kernels on a dark board with a 1 cm grid: columns A-T, rows 1-28.
Defect classes, by group:
${
  input.classes.length
    ? CLASS_GROUPS.flatMap((g) => {
        const c = input.classes.filter((x) => x.group === g);
        return c.length
          ? [
              `${GROUP_LABELS[g]}: ${c.map((x) => (x.description?.trim() ? `${x.label} (${x.description.trim()})` : x.label)).join("; ")}`,
            ]
          : [];
      }).join("\n")
    : "[list your defect classes]"
}
For every kernel that is NOT sound, list: grid cell, class, confidence
(high / medium / low) and a short reason.
Then give the number of flagged kernels per class.
If the image is too poor to judge a kernel, say so instead of guessing.
Return a table only.`;
}
