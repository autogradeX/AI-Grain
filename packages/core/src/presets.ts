import type { ClassDef, CropProfile } from "./classes.js";

/*
 * Starting class lists for common crops, grouped like EN 15587 impurity
 * analysis. They are taxonomy only (no limits) and every organisation can
 * edit, add or remove classes. Ids of the original wheat classes are kept so
 * earlier samples and standards stay valid.
 */

const cereal = (otherCereals: string): ClassDef[] => [
  {
    id: "other_grain",
    label: "Other cereals",
    group: "admixture",
    description: otherCereals,
  },
  {
    id: "broken",
    label: "Broken",
    group: "broken_defective",
    description:
      "Pieces of kernel smaller than about three quarters of a whole kernel.",
  },
  {
    id: "shrivelled",
    label: "Shrivelled",
    group: "broken_defective",
    description:
      "Thin, wrinkled or underdeveloped kernels, clearly smaller than the sound kernels.",
  },
  {
    id: "sprouted",
    label: "Sprouted",
    group: "broken_defective",
    description:
      "Kernels with a visible rootlet or shoot, or a burst seed coat over the germ.",
  },
  {
    id: "heat_damaged",
    label: "Heat-damaged",
    group: "broken_defective",
    description:
      "Kernels darkened or discoloured by overheating in drying or storage.",
  },
  {
    id: "insect_damaged",
    label: "Pest-damaged",
    group: "broken_defective",
    description:
      "Kernels with holes, tunnels or bite marks from insects or other pests.",
  },
  {
    id: "black_point",
    label: "Discoloured germ / black point",
    group: "broken_defective",
    description: "Dark brown or black discolouration at the germ end.",
  },
  {
    id: "green_immature",
    label: "Green / immature",
    group: "broken_defective",
    description: "Unripe kernels with a green colour.",
  },
  {
    id: "weed_seeds",
    label: "Weed and foreign seeds",
    group: "impurity",
    description: "Seeds of weeds or other non-cereal plants.",
  },
  {
    id: "husks_chaff",
    label: "Husks and chaff",
    group: "impurity",
    description: "Loose husks, glumes and chaff without a kernel inside.",
  },
  {
    id: "plant_parts",
    label: "Plant parts",
    group: "impurity",
    description: "Pieces of straw, stems, leaves or ear parts.",
  },
  {
    id: "stones",
    label: "Stones",
    group: "impurity",
    description: "Stones, gravel and soil clods.",
    massFactor: 2.5,
  },
  {
    id: "foreign_material",
    label: "Other foreign material",
    group: "impurity",
    description:
      "Anything else that is not grain: dust balls, paper, plastic, metal, glass.",
  },
  {
    id: "ergot",
    label: "Ergot",
    group: "harmful",
    description:
      "Dark purple-black, horn-shaped ergot bodies (Claviceps), often longer than a kernel.",
  },
  {
    id: "sclerotia",
    label: "Sclerotia",
    group: "harmful",
    description:
      "Hard black fungal bodies other than ergot, irregular in shape.",
  },
  {
    id: "fusarium_mould",
    label: "Fusarium-damaged",
    group: "harmful",
    description:
      "Shrivelled, chalky white or pink kernels typical of Fusarium head blight.",
  },
  {
    id: "mouldy",
    label: "Mouldy / decayed",
    group: "harmful",
    description: "Kernels with visible mould growth or rot.",
  },
];

const oilseed = (crop: string, otherSeeds: string): ClassDef[] => [
  {
    id: "other_crop_seeds",
    label: "Other crop seeds",
    group: "admixture",
    description: otherSeeds,
  },
  {
    id: "broken",
    label: "Broken / split",
    group: "broken_defective",
    description: `Broken, split or crushed ${crop} seeds.`,
  },
  {
    id: "immature",
    label: "Immature / shrivelled",
    group: "broken_defective",
    description: `Small, wrinkled or underdeveloped ${crop} seeds.`,
  },
  {
    id: "green",
    label: "Green seeds",
    group: "broken_defective",
    description: `Unripe ${crop} seeds with a green colour inside or out.`,
  },
  {
    id: "heat_damaged",
    label: "Heat-damaged / discoloured",
    group: "broken_defective",
    description: "Seeds darkened or discoloured by overheating.",
  },
  {
    id: "sprouted",
    label: "Sprouted",
    group: "broken_defective",
    description: "Seeds with a visible rootlet or burst seed coat.",
  },
  {
    id: "pest_damaged",
    label: "Pest-damaged",
    group: "broken_defective",
    description: "Seeds with holes or bite marks from insects or other pests.",
  },
  {
    id: "weed_seeds",
    label: "Weed seeds",
    group: "impurity",
    description: "Seeds of weeds.",
  },
  {
    id: "pods_husks",
    label: "Pods and husks",
    group: "impurity",
    description: "Pod walls, hulls and husk fragments.",
    massFactor: 0.4,
  },
  {
    id: "plant_parts",
    label: "Plant parts",
    group: "impurity",
    description: "Stems, leaves and other plant debris.",
  },
  {
    id: "stones",
    label: "Stones",
    group: "impurity",
    description: "Stones, gravel and soil clods.",
    massFactor: 2.5,
  },
  {
    id: "foreign_material",
    label: "Other foreign material",
    group: "impurity",
    description:
      "Anything else that is not seed: dust balls, paper, plastic, metal, glass.",
  },
  {
    id: "sclerotia",
    label: "Sclerotia",
    group: "harmful",
    description:
      "Hard black fungal bodies (for example Sclerotinia), irregular and often larger than a seed.",
  },
  {
    id: "mouldy",
    label: "Mouldy / decayed",
    group: "harmful",
    description: "Seeds with visible mould growth or rot.",
  },
];

export const CROP_PRESETS: Record<string, CropProfile> = {
  wheat: {
    key: "wheat",
    label: "Wheat",
    classes: cereal(
      "Kernels of other cereals in wheat: barley, rye, oats, triticale.",
    ),
  },
  barley: {
    key: "barley",
    label: "Barley",
    classes: cereal(
      "Kernels of other cereals in barley: wheat, rye, oats, triticale.",
    ),
  },
  oats: {
    key: "oats",
    label: "Oats",
    classes: cereal(
      "Kernels of other cereals in oats: wheat, barley, rye, triticale.",
    ),
  },
  rapeseed: {
    key: "rapeseed",
    label: "Rapeseed",
    classes: oilseed(
      "rapeseed",
      "Seeds of other crops in rapeseed, for example cereals or other brassicas.",
    ),
  },
  hemp: {
    key: "hemp",
    label: "Hemp seeds",
    classes: oilseed(
      "hemp",
      "Seeds of other crops in hemp, for example cereals or other oilseeds.",
    ),
  },
};

/** A crop's starting profile: its preset when there is one, otherwise the general cereal list. */
export function presetFor(key: string, label?: string): CropProfile {
  const preset = CROP_PRESETS[key];
  if (preset) return JSON.parse(JSON.stringify(preset)) as CropProfile;
  return {
    key,
    label:
      label ?? (key.charAt(0).toUpperCase() + key.slice(1)).replace(/_/g, " "),
    classes: cereal(`Kernels of other cereals in ${key}.`),
  };
}
