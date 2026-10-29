import {
  CLASS_GROUPS,
  CROP_PRESETS,
  GROUP_LABELS,
  type ClassGroup,
} from "@ai-grain/core";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { ArticleItem } from "./HubPage";

const GROUP_TEXT: Record<"sound" | ClassGroup, string> = {
  sound: "The clean fraction, reported as purity %.",
  admixture:
    "Other cereals, for example barley, rye, oats or triticale in wheat.",
  broken_defective:
    "Broken, shrivelled, sprouted, heat-damaged and pest-damaged kernels.",
  impurity: "Weed and foreign seeds, husks, plant parts, stones and debris.",
  harmful: "Ergot, sclerotia, Fusarium-damaged and mouldy kernels.",
};

const STEPS = [
  [
    "Weigh and spread",
    "Weigh the working sample on a 0.01 g scale, then spread 100–150 kernels per batch on a 1 cm grid board.",
  ],
  [
    "Photograph",
    "Take a straight-down photo with the phone. The app corrects perspective and finds every kernel by image processing.",
  ],
  [
    "AI analysis",
    "Claude classifies a close-up of each kernel into your crop's classes, with a confidence and a reason.",
  ],
  [
    "Verified report",
    "You check the flagged kernels and weigh the cups. The grade, purity and a QR-verifiable report follow.",
  ],
] as const;

const FAQ: [string, string][] = [
  [
    "Who is it for?",
    "Farms, intake points, elevators, mills, traders, cooperatives, seed companies and training labs that want a fast, documented pre-check of grain impurities without a dedicated grading machine.",
  ],
  [
    "Which crops does it handle?",
    `It ships with class lists for ${Object.values(CROP_PRESETS)
      .map((p) => p.label.toLowerCase())
      .join(
        ", ",
      )}. You can edit those classes, or add a crop and its classes yourself.`,
  ],
  [
    "How accurate is it?",
    "It depends on your grain and setup, so you measure it: grade 30–50 samples both ways (certified grader and this method) and the Validation page compares them class by class. Subtle defects, such as light heat damage or early sprouting, agree least.",
  ],
  [
    "Does it replace EN 15587 or manual grading?",
    "No. It follows the same categories and a person confirms every flagged kernel, but it is a screening and pre-check tool. It is not acceptable for official trade grading unless validated and approved for that use.",
  ],
  [
    "How fast is it?",
    "Kernel detection takes seconds per photo, and Claude classifies a batch of 100–150 kernels in parallel sheets, typically within a minute or two. The instant estimate is ready then; checking flagged kernels and weighing cups take a few more minutes.",
  ],
  [
    "Can it be tuned to our grain?",
    "Yes: write your standard's defect definitions, and add reference images of your own kernels. Every kernel an operator confirms also becomes a labelled training image you can export.",
  ],
  [
    "How is data handled?",
    "Photos and results are stored by your installation of AI-Grain. Kernel close-ups are sent to the Claude API for classification; nothing is processed on the phone itself. Access is by signed-in account, with roles and an activity log.",
  ],
  [
    "How is it different from a NIR analyser?",
    "A NIR analyser measures composition such as protein and moisture. This method looks at the physical side of the sample, kernel by kernel: broken and damaged kernels, admixtures and impurities.",
  ],
];

const MANUAL = [
  "A trained grader sorts the sample by eye, kernel by kernel",
  "Results depend on the person and the time of day",
  "Paper notes; hard to show a buyer how a figure was reached",
  "Each sample ties up an expert for 15–30 minutes",
];

const WITH_AI = [
  "Claude flags suspect kernels; an operator only checks the flagged ones",
  "The same definitions and reference images every time",
  "Every figure ties back to a kernel image, with a verifiable report",
  "Any trained operator can run it with a phone and a scale",
];

/** EN 15587-style groups with a short description each; on the home and demo pages. */
export function CategorySection() {
  return (
    <section className="site-section split">
      <div>
        <h2>The physical side of grain quality</h2>
        <p>
          Every object on the board is detected and classified, and every number
          in the report ties back to a kernel in the photo. Classes follow the
          grouping of EN 15587 impurity (Besatz) analysis, and you configure
          them per crop.
        </p>
        <p className="muted small">
          Each crop has its own classes: about 14–17 in the presets.{" "}
          <Link to="/hub?kind=glossary">Glossary</Link>
        </p>
      </div>
      <ul className="category-list">
        {(["sound", ...CLASS_GROUPS] as const).map((g) => (
          <li key={g} className="card">
            <span className={`dot dot-${g}`} aria-hidden />
            <div>
              <strong>{g === "sound" ? "Sound grain" : GROUP_LABELS[g]}</strong>
              <div className="muted small">{GROUP_TEXT[g]}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CropsSection() {
  return (
    <section className="site-section">
      <h2>Class lists for every crop</h2>
      <p className="muted">
        Each crop has its own classes and descriptions, which Claude uses to
        judge kernels. Edit the presets, or add any crop with its own classes.
      </p>
      <div className="crop-grid">
        {Object.entries(CROP_PRESETS).map(([key, p]) => (
          <div key={key} className="card">
            <strong>{p.label}</strong>
            <span className="muted small">{p.classes.length} classes</span>
          </div>
        ))}
        <div className="card crop-add">
          <strong>Your crop</strong>
          <span className="muted small">Define its classes in the app</span>
        </div>
      </div>
      <Link to="/demo" className="button">
        Explore a sample in the demo
      </Link>
    </section>
  );
}

/** Case studies the site owner published in the knowledge hub; nothing shows until there are some. */
function CaseStudies() {
  const list = useQuery({
    queryKey: ["articles", "case_study"],
    queryFn: () => api.get<ArticleItem[]>("/public/articles?kind=case_study"),
  });
  if (!list.data?.length) return null;
  return (
    <section className="site-section">
      <h2>Results from the field</h2>
      <div className="feature-grid">
        {list.data.slice(0, 3).map((a) => (
          <Link
            key={a.slug}
            to={`/hub/${a.slug}`}
            className="card article-card"
          >
            <strong>{a.title}</strong>
            {a.summary && <p className="muted small">{a.summary}</p>}
          </Link>
        ))}
      </div>
    </section>
  );
}

export function HomePage() {
  return (
    <div className="site-page">
      <section className="hero">
        <span className="eyebrow">AI-assisted grain impurity analysis</span>
        <h1>Grain quality screening with a phone, a scale and Claude</h1>
        <p className="hero-lead">
          Photograph a sample on a grid board. Claude flags every suspect
          kernel, a person confirms it, and the scale gives the mass percentage.
          You get a grade and a report anyone can verify, for about US$50 of
          equipment on top of a phone.
        </p>
        <div className="row wrap center">
          <Link to="/demo" className="button primary">
            Try the demo analysis
          </Link>
          <Link to="/contact" className="button">
            Talk to us
          </Link>
        </div>
      </section>

      <section className="site-section">
        <h2>Simple process, documented result</h2>
        <ol className="steps-grid">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="card">
              <span className="step-number">{i + 1}</span>
              <strong>{title}</strong>
              <p className="muted small">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="site-section">
        <h2>From slow and subjective to fast and documented</h2>
        <div className="compare">
          <div className="card">
            <span className="eyebrow muted">Manual inspection</span>
            <ul>
              {MANUAL.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div className="card compare-new">
            <span className="eyebrow">With AI-Grain</span>
            <ul>
              {WITH_AI.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <CategorySection />

      <section className="site-section">
        <h2>What you get</h2>
        <div className="feature-grid">
          {[
            [
              "Weighing or instant estimate",
              "The scale gives the verified result. An estimate from kernel areas is ready as soon as Claude has classified the photos, for fast pre-checks.",
            ],
            [
              "Reports anyone can verify",
              "Completed samples get a certificate code and QR code. Anyone can check the figures online, and any change shows.",
            ],
            [
              "Kernel-level transparency",
              "The report includes the image of every kernel not judged sound, with Claude's class, its confidence and the operator's decision.",
            ],
            [
              "Analytics",
              "Throughput, grades and defect trends by source, how often operators change Claude's verdicts, and how the photo estimate compares with the scale.",
            ],
            [
              "Your standards",
              "Grade limits per class and per group, from the standard you grade against. Nothing official is built in or assumed.",
            ],
            [
              "Team accounts",
              "Admins, graders and viewers, invitations, password reset, and an activity log.",
            ],
          ].map(([title, text]) => (
            <div key={title} className="card">
              <strong>{title}</strong>
              <p className="muted small">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <CropsSection />

      <CaseStudies />

      <section className="site-section">
        <h2>Equipment</h2>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Specification</th>
                <th className="num">Approx. cost (USD)</th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "Mobile phone",
                  "Any recent Android or iPhone, 12 MP or better",
                  "existing",
                ],
                [
                  "Scale",
                  "Pocket or jewellery scale, 0.01 g resolution, 100–200 g capacity",
                  "15–40",
                ],
                [
                  "Background board",
                  "Matte black or dark blue A4 card, printed 1 cm grid, columns A–T, rows 1–28",
                  "2",
                ],
                [
                  "Phone stand",
                  "Holds the phone flat, 20–25 cm above the board",
                  "10–20",
                ],
                [
                  "Lighting",
                  "LED ring light, or two desk lamps at 45°",
                  "15–25",
                ],
                ["Tweezers and cups", "One cup per defect class", "5"],
              ].map(([item, spec, cost]) => (
                <tr key={item}>
                  <td>{item}</td>
                  <td>{spec}</td>
                  <td className="num">{cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="site-section narrow">
        <h2>Frequently asked questions</h2>
        <div className="faq">
          {FAQ.map(([q, a]) => (
            <details key={q} className="card">
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="site-band">
        <h2>See it on real grain</h2>
        <p>
          Book a walkthrough, or send us a question about your crops and
          standards.
        </p>
        <Link to="/contact" className="button">
          Book a meeting
        </Link>
      </section>
    </div>
  );
}
