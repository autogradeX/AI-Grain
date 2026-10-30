import type { ArticleKind } from "../../db/schema.js";

/**
 * Starting knowledge-hub content: guides to this method and general glossary
 * terms. Seeded once for the site owner, published, and editable like any
 * article. No news or case studies are seeded: those must be real.
 */
export const DEFAULT_ARTICLES: {
  slug: string;
  kind: ArticleKind;
  title: string;
  summary: string;
  body: string;
}[] = [
  {
    slug: "setting-up-phone-board-and-scale",
    kind: "guide",
    title: "Setting up the phone, board and scale",
    summary:
      "The equipment for low-cost grain screening, and how to set it up so results are repeatable.",
    body: `Grain screening with AI-Grain needs a phone, a precise scale and a few low-cost items: about US$50 on top of a phone.

| Item | What to get |
| --- | --- |
| Phone | Any recent Android or iPhone, 12 MP or better |
| Scale | Pocket or jewellery scale with 0.01 g resolution, 100–200 g capacity |
| Board | Matte black or dark blue A4 card with a printed 1 cm grid, columns A–T and rows 1–28 |
| Stand | Holds the phone flat, 20–25 cm above the board |
| Light | An LED ring light, or two desk lamps at 45° |
| Tweezers and cups | One small cup per defect class |

## Why the scale matters

A kitchen scale with 1 g steps is too coarse: on a 50 g sample, 1 g is already 2 %. If only a kitchen scale is available, use one with 0.1 g steps and a 100 g sample.

## Keep the setup fixed

Results change with lighting and phone model. Use the same phone, stand height and light every time, avoid direct sun and shadows, and keep the board clean.

## The method

1. Weigh the working sample, for example 20–25 g (about 500–600 wheat kernels).
2. Spread 100–150 kernels on the board in one layer, not touching. Repeat in batches until the whole sample is done.
3. Photograph straight down with every grid cell visible. Optionally flip the kernels for a crease-side photo.
4. Model Orchestration flags suspect kernels by grid cell, class and confidence.
5. Pick out each flagged kernel with tweezers, check it by eye, and drop it into the cup for its class. You make the final call.
6. Weigh each cup. Mass % per class is the cup weight divided by the sample weight, times 100.`,
  },
  {
    slug: "validating-against-a-certified-grader",
    kind: "guide",
    title: "Validating the method against a certified grader",
    summary:
      "Before relying on the results, grade 30–50 samples both ways and compare them class by class.",
    body: `Model Orchestration runs general-purpose AI models, not trained on your grain. Its accuracy on your crops, with your setup, is unknown until you measure it.

## How to validate

1. Pick 30–50 samples that cover the range you see in practice: clean lots, heavily damaged lots, and the defects that matter most to you.
2. Grade each sample with this method, and have a certified grader grade the same sample.
3. Enter the grader's result on the sample (**Certified grader result**).
4. Open **Validation** to compare, per defect class: the mean of each method, the bias (method minus grader) and the mean and largest differences, plus how often both gave the same grade.

## Reading the results

- A **positive bias** means this method reads high for that class; a negative one, low.
- Expect the weakest agreement on subtle defects: light heat damage, early sprouting, and Fusarium versus weather bleaching.
- Internal and fluorescent defects are invisible in a phone photo; this method can't find them.

If a class disagrees a lot, improve its definition on the standard and add reference images of that defect from your own grain, then validate again.

This method is a screening and pre-check tool. It is not acceptable for official trade grading unless it has been validated and approved for that use.`,
  },
  {
    slug: "photo-estimate-or-weighing",
    kind: "guide",
    title: "Photo estimate or weighing?",
    summary:
      "How the instant estimate works, where it falls short, and when the scale is needed.",
    body: `As soon as Model Orchestration has classified the kernels in your photos, AI-Grain shows an **instant estimate** of mass % per class and group.

## How the estimate works

Each object's weight is estimated from its area in the photo: area to the power 1.5, which scales an area to a volume, times the mass factor of its class. Mass factors let heavier material such as stones and lighter material such as husks count properly. Objects marked unclear are left out.

## Where it falls short

- Kernel thickness isn't visible from above, so thin, shrivelled kernels can look heavier than they are.
- Touching kernels are measured as one object.
- Mass factors are approximations until you tune them for your crop.

## When to weigh

Weighing the cups is the verified result, and it is closest to how official grading works. A standard can allow completing a sample on the estimate alone, for fast pre-checks, but it is off by default. The **Analytics** page shows how far the estimate is from the scale on your own samples: use it to decide.`,
  },
  {
    slug: "definitions-and-reference-images",
    kind: "guide",
    title: "Writing defect definitions and choosing reference images",
    summary:
      "The two things that improve Model Orchestration's classifications the most.",
    body: `Model Orchestration reads your defect definitions and up to 12 reference images with every request.

## Definitions

- Use the wording of the standard you grade against, then add local guidance: what early sprouting looks like in your variety, or how to tell Fusarium damage from weather bleaching.
- Describe what is **visible from above** in a photo: colour, shape, size relative to a sound kernel, marks.
- Keep each definition to a few sentences.

## Reference images

- Use close-ups from your own grain, photographed on the same board under the same light.
- Cover the classes where Model Orchestration and your operators disagree most (see **Analytics → Model Orchestration against the operators**).
- The quickest way to add one: on a reviewed kernel, choose **Use as a reference example**.`,
  },
  ...(
    [
      [
        "purity",
        "Purity",
        "The share of a sample, by mass, that is sound grain of the basic crop: 100 % minus all defects and impurities.",
      ],
      [
        "impurities-besatz",
        "Impurities (Besatz)",
        "Everything in a sample that is not sound grain of the basic crop. Besatz is the German term used by EN 15587, the European method for determining impurities in wheat, durum wheat, rye and feed barley. It groups impurities into broken kernels, grain impurities, sprouted kernels and miscellaneous impurities.",
      ],
      [
        "grain-admixture",
        "Grain admixture",
        "Kernels of other cereals in a sample, for example barley or rye in wheat.",
      ],
      [
        "broken-kernel",
        "Broken kernel",
        "A piece of kernel below a set fraction of a whole kernel, often around three quarters; the exact rule depends on the standard.",
      ],
      [
        "shrivelled-kernel",
        "Shrivelled kernel",
        "A thin, wrinkled or underdeveloped kernel, clearly smaller than sound kernels. Many standards separate them by sieving.",
      ],
      [
        "sprouted-kernel",
        "Sprouted kernel",
        "A kernel that has started to germinate: a visible rootlet or shoot, or a burst seed coat over the germ.",
      ],
      [
        "ergot",
        "Ergot",
        "The dark, horn-shaped resting body of the fungus Claviceps purpurea, which replaces a kernel in the ear. Ergot contains toxic alkaloids, so limits are usually very low.",
      ],
      [
        "sclerotia",
        "Sclerotia",
        "Hard, dark fungal resting bodies, for example from Sclerotinia in rapeseed.",
      ],
      [
        "fusarium-damaged-kernel",
        "Fusarium-damaged kernel",
        "A kernel infected by Fusarium head blight: often shrivelled, chalky white or pinkish. Fusarium infection is associated with mycotoxins such as deoxynivalenol (DON), which a photo cannot measure.",
      ],
      [
        "test-weight",
        "Test weight",
        "The mass of a fixed volume of grain, usually in kg per hectolitre. It indicates how well filled the kernels are, and is measured separately from impurity analysis.",
      ],
      [
        "moisture-content",
        "Moisture content",
        "The share of a sample's mass that is water, measured with a moisture meter. Grain that is too moist can spoil in storage.",
      ],
      [
        "working-sample",
        "Working sample",
        "The portion of a lot taken for analysis, after dividing a larger sample down. Its mass is the basis for every mass percentage.",
      ],
      [
        "mass-percentage",
        "Mass percentage",
        "The mass of one class divided by the mass of the working sample, times 100. Grading limits are usually set in mass %.",
      ],
    ] as const
  ).map(([slug, title, text]) => ({
    slug,
    kind: "glossary" as const,
    title,
    summary: text,
    body: text,
  })),
];
