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

/*
 * Foreign matter as eNAM / DMI assaying splits it: organic (husk, chaff,
 * straw, weed seeds) and inorganic (stones, soil, dust).
 */
const foreignMatter = (husk: string): ClassDef[] => [
  {
    id: "organic_foreign",
    label: "Foreign matter (organic)",
    group: "impurity",
    description: `${husk}, straw, stems, leaves, weed seeds and other plant material that is not the commodity.`,
    massFactor: 0.4,
  },
  {
    id: "stones",
    label: "Stones",
    group: "impurity",
    description: "Stones, gravel and soil clods.",
    massFactor: 2.5,
  },
  {
    id: "inorganic_foreign",
    label: "Foreign matter (inorganic)",
    group: "impurity",
    description:
      "Dust balls, sand, glass, metal, plastic and other mineral or man-made material.",
    massFactor: 1.5,
  },
];

const mouldy: ClassDef = {
  id: "mouldy",
  label: "Mouldy / decayed",
  group: "harmful",
  description:
    "Kernels with visible mould growth (white, green, black) or rot.",
};

/** Paddy (unhusked rice), as assayed in mandi procurement. */
const paddy: ClassDef[] = [
  {
    id: "lower_class",
    label: "Admixture of lower class",
    group: "admixture",
    description:
      "Paddy grains of a different, lower variety: clearly shorter, bolder or a different husk colour from the lot.",
  },
  {
    id: "damaged",
    label: "Damaged / discoloured / sprouted / weevilled",
    group: "broken_defective",
    description:
      "Grains with a darkened, spotted or discoloured husk, a sprout or rootlet, or holes from insects.",
  },
  {
    id: "immature",
    label: "Immature / shrunken / shrivelled",
    group: "broken_defective",
    description:
      "Thin, chaffy, greenish or partly filled grains, clearly lighter than sound grains; empty husks count here only when a grain is inside.",
  },
  ...foreignMatter("Empty husks, chaff"),
  mouldy,
];

/** Milled rice (raw or parboiled). */
const rice: ClassDef[] = [
  {
    id: "lower_class",
    label: "Admixture of lower class",
    group: "admixture",
    description:
      "Rice grains of a different, lower variety: clearly shorter or bolder than the lot.",
  },
  {
    id: "paddy_grains",
    label: "Paddy grains",
    group: "admixture",
    description: "Unhusked paddy grains in the rice, with the husk still on.",
  },
  {
    id: "broken",
    label: "Brokens",
    group: "broken_defective",
    description:
      "Pieces smaller than three quarters of a whole grain (tips and small brokens included).",
  },
  {
    id: "chalky",
    label: "Chalky grains",
    group: "broken_defective",
    description:
      "Grains with an opaque, white, chalk-like area covering half or more of the grain.",
  },
  {
    id: "red_grains",
    label: "Red grains",
    group: "broken_defective",
    description: "Grains with red or reddish-brown bran streaks or patches.",
  },
  {
    id: "damaged",
    label: "Damaged / slightly damaged",
    group: "broken_defective",
    description:
      "Grains with spots, pinpoint damage, insect holes or internal damage visible at the surface.",
  },
  {
    id: "discoloured",
    label: "Discoloured grains",
    group: "broken_defective",
    description:
      "Grains with a yellow, brown or grey colour throughout, unlike the lot.",
  },
  ...foreignMatter("Husk pieces, bran balls"),
  mouldy,
];

/** Pulses (chana, tur, moong and similar). */
const pulse = (crop: string, others: string): ClassDef[] => [
  {
    id: "other_grain",
    label: "Other edible grains",
    group: "admixture",
    description: others,
  },
  {
    id: "damaged",
    label: "Damaged",
    group: "broken_defective",
    description: `${crop} seeds with internal damage, sprouting, deep discolouration, fungal damage or heat damage.`,
  },
  {
    id: "slightly_damaged",
    label: "Slightly damaged / touched",
    group: "broken_defective",
    description: `${crop} seeds with only surface damage: small spots, light discolouration or a touched seed coat.`,
  },
  {
    id: "immature",
    label: "Immature / shrivelled",
    group: "broken_defective",
    description: `Small, wrinkled, greenish or underdeveloped ${crop} seeds.`,
  },
  {
    id: "weevilled",
    label: "Weevilled",
    group: "broken_defective",
    description:
      "Seeds with round exit holes or tunnels from weevils or bruchids.",
    massFactor: 0.8,
  },
  {
    id: "split_broken",
    label: "Split / broken",
    group: "broken_defective",
    description: `${crop} seeds split into halves or broken into pieces.`,
  },
  ...foreignMatter("Pod walls, husk"),
  mouldy,
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
  paddy: { key: "paddy", label: "Paddy", classes: paddy },
  rice: { key: "rice", label: "Rice", classes: rice },
  maize: {
    key: "maize",
    label: "Maize",
    classes: [
      {
        id: "other_grain",
        label: "Other edible grains",
        group: "admixture",
        description: "Kernels of other cereals or pulses in maize.",
      },
      {
        id: "damaged",
        label: "Damaged",
        group: "broken_defective",
        description:
          "Kernels with internal damage, sprouting, deep discolouration, fungal or heat damage.",
      },
      {
        id: "slightly_damaged",
        label: "Slightly damaged / discoloured",
        group: "broken_defective",
        description:
          "Kernels with only surface spots or light discolouration of the pericarp.",
      },
      {
        id: "immature",
        label: "Shrivelled / immature",
        group: "broken_defective",
        description: "Small, wrinkled, thin or underdeveloped kernels.",
      },
      {
        id: "weevilled",
        label: "Weevilled",
        group: "broken_defective",
        description: "Kernels with holes or tunnels from weevils.",
        massFactor: 0.8,
      },
      {
        id: "broken",
        label: "Broken",
        group: "broken_defective",
        description: "Pieces smaller than three quarters of a whole kernel.",
      },
      ...foreignMatter("Cob pieces, husk, silk"),
      mouldy,
    ],
  },
  chana: {
    key: "chana",
    label: "Chana (gram)",
    classes: pulse(
      "Chana",
      "Seeds of other pulses or cereals in chana: peas, lentils, wheat.",
    ),
  },
  tur: {
    key: "tur",
    label: "Tur (arhar)",
    classes: pulse(
      "Tur",
      "Seeds of other pulses or cereals in tur: chana, moong, urad, cereals.",
    ),
  },
  moong: {
    key: "moong",
    label: "Moong",
    classes: pulse(
      "Moong",
      "Seeds of other pulses or cereals in moong: urad, masoor, cereals.",
    ),
  },
  soybean: {
    key: "soybean",
    label: "Soybean",
    classes: [
      ...oilseed(
        "soybean",
        "Seeds of other crops in soybean: other oilseeds, pulses or cereals.",
      ).filter((c) => c.id !== "green"),
    ],
  },
  mustard: {
    key: "mustard",
    label: "Mustard",
    classes: oilseed(
      "mustard",
      "Seeds of other crops in mustard: other brassicas, linseed, cereals.",
    ),
  },
};

/** Local names that mean a preset crop, e.g. "dhan" is paddy. */
const PRESET_ALIASES: Record<string, string> = {
  dhan: "paddy",
  dhaan: "paddy",
  धान: "paddy",
  chawal: "rice",
  चावल: "rice",
  makka: "maize",
  makki: "maize",
  corn: "maize",
  मक्का: "maize",
  gram: "chana",
  chickpea: "chana",
  chickpeas: "chana",
  चना: "chana",
  arhar: "tur",
  toor: "tur",
  tuar: "tur",
  pigeon_pea: "tur",
  अरहर: "tur",
  mung: "moong",
  green_gram: "moong",
  मूँग: "moong",
  मूंग: "moong",
  soya: "soybean",
  soyabean: "soybean",
  सोयाबीन: "soybean",
  sarson: "mustard",
  सरसों: "mustard",
  gehun: "wheat",
  gehu: "wheat",
  गेहूँ: "wheat",
  गेहूं: "wheat",
};

/** The preset crop a typed name refers to (by key or local name), or null. */
export function presetKeyFor(name: string): string | null {
  const key = name.trim().toLowerCase().replace(/\s+/g, "_");
  if (CROP_PRESETS[key]) return key;
  return PRESET_ALIASES[key] ?? null;
}

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
