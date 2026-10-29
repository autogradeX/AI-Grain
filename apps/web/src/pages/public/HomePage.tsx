import { CLASS_GROUPS, CROP_PRESETS, type ClassGroup } from "@ai-grain/core";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useLang, useT } from "../../i18n";
import { useGrainLabels } from "../../i18n/common";
import { m } from "./HomePage.i18n";
import type { ArticleItem } from "./HubPage";

type Key = keyof typeof m;

const GROUP_TEXT: Record<"sound" | ClassGroup, Key> = {
  sound: "groupTextSound",
  admixture: "groupTextAdmixture",
  broken_defective: "groupTextBrokenDefective",
  impurity: "groupTextImpurity",
  harmful: "groupTextHarmful",
};

const STEPS = [
  ["step1Title", "step1Text"],
  ["step2Title", "step2Text"],
  ["step3Title", "step3Text"],
  ["step4Title", "step4Text"],
] as const;

const FEATURES = [
  ["feature1Title", "feature1Text"],
  ["feature2Title", "feature2Text"],
  ["feature3Title", "feature3Text"],
  ["feature4Title", "feature4Text"],
  ["feature5Title", "feature5Text"],
  ["feature6Title", "feature6Text"],
] as const;

const EQUIPMENT = [
  ["phone", "phoneSpec", null],
  ["scale", "scaleSpec", "15–40"],
  ["board", "boardSpec", "2"],
  ["stand", "standSpec", "10–20"],
  ["lighting", "lightingSpec", "15–25"],
  ["tweezers", "tweezersSpec", "5"],
] as const;

const FAQ = [
  ["faq1Q", "faq1A"],
  ["faq2Q", "faq2A"],
  ["faq3Q", "faq3A"],
  ["faq4Q", "faq4A"],
  ["faq5Q", "faq5A"],
  ["faq6Q", "faq6A"],
  ["faq7Q", "faq7A"],
  ["faq8Q", "faq8A"],
] as const;

const MANUAL = ["manual1", "manual2", "manual3", "manual4"] as const;
const WITH_AI = ["withAi1", "withAi2", "withAi3", "withAi4"] as const;

/** EN 15587-style groups with a short description each; on the home and demo pages. */
export function CategorySection() {
  const t = useT(m);
  const { groupLabel } = useGrainLabels();
  return (
    <section className="site-section split">
      <div>
        <h2>{t("categoryTitle")}</h2>
        <p>{t("categoryText")}</p>
        <p className="muted small">
          {t("categoryNote")}{" "}
          <Link to="/hub?kind=glossary">{t("glossary")}</Link>
        </p>
      </div>
      <ul className="category-list">
        {(["sound", ...CLASS_GROUPS] as const).map((g) => (
          <li key={g} className="card">
            <span className={`dot dot-${g}`} aria-hidden />
            <div>
              <strong>{groupLabel(g)}</strong>
              <div className="muted small">{t(GROUP_TEXT[g])}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CropsSection() {
  const t = useT(m);
  const { cropLabel } = useGrainLabels();
  return (
    <section className="site-section">
      <h2>{t("cropsTitle")}</h2>
      <p className="muted">{t("cropsText")}</p>
      <div className="crop-grid">
        {Object.entries(CROP_PRESETS).map(([key, p]) => (
          <div key={key} className="card">
            <strong>{cropLabel(p.label)}</strong>
            <span className="muted small">
              {t.n("classCount", p.classes.length)}
            </span>
          </div>
        ))}
        <div className="card crop-add">
          <strong>{t("yourCrop")}</strong>
          <span className="muted small">{t("yourCropText")}</span>
        </div>
      </div>
      <Link to="/demo" className="button">
        {t("exploreDemo")}
      </Link>
    </section>
  );
}

/** Case studies the site owner published in the knowledge hub; nothing shows until there are some. */
function CaseStudies() {
  const t = useT(m);
  const list = useQuery({
    queryKey: ["articles", "case_study"],
    queryFn: () => api.get<ArticleItem[]>("/public/articles?kind=case_study"),
  });
  if (!list.data?.length) return null;
  return (
    <section className="site-section">
      <h2>{t("resultsTitle")}</h2>
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
  const t = useT(m);
  const { lang } = useLang();
  const { cropLabel } = useGrainLabels();
  const crops = Object.values(CROP_PRESETS)
    .map((p) => (lang === "en" ? p.label.toLowerCase() : cropLabel(p.label)))
    .join(", ");
  return (
    <div className="site-page">
      <section className="hero">
        <span className="eyebrow">{t("eyebrow")}</span>
        <h1>{t("heroTitle")}</h1>
        <p className="hero-lead">{t("heroLead")}</p>
        <div className="row wrap center">
          <Link to="/demo" className="button primary">
            {t("tryDemo")}
          </Link>
          <Link to="/contact" className="button">
            {t("talkToUs")}
          </Link>
        </div>
      </section>

      <section className="site-section">
        <h2>{t("stepsTitle")}</h2>
        <ol className="steps-grid">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="card">
              <span className="step-number">{i + 1}</span>
              <strong>{t(title)}</strong>
              <p className="muted small">{t(text)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="site-section">
        <h2>{t("compareTitle")}</h2>
        <div className="compare">
          <div className="card">
            <span className="eyebrow muted">{t("manualTitle")}</span>
            <ul>
              {MANUAL.map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
          </div>
          <div className="card compare-new">
            <span className="eyebrow">{t("withAiTitle")}</span>
            <ul>
              {WITH_AI.map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <CategorySection />

      <section className="site-section">
        <h2>{t("featuresTitle")}</h2>
        <div className="feature-grid">
          {FEATURES.map(([title, text]) => (
            <div key={title} className="card">
              <strong>{t(title)}</strong>
              <p className="muted small">{t(text)}</p>
            </div>
          ))}
        </div>
      </section>

      <CropsSection />

      <CaseStudies />

      <section className="site-section">
        <h2>{t("equipmentTitle")}</h2>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t("item")}</th>
                <th>{t("specification")}</th>
                <th className="num">{t("cost")}</th>
              </tr>
            </thead>
            <tbody>
              {EQUIPMENT.map(([item, spec, cost]) => (
                <tr key={item}>
                  <td>{t(item)}</td>
                  <td>{t(spec)}</td>
                  <td className="num">{cost ?? t("existing")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="site-section narrow">
        <h2>{t("faqTitle")}</h2>
        <div className="faq">
          {FAQ.map(([q, a]) => (
            <details key={q} className="card">
              <summary>{t(q)}</summary>
              <p>{t(a, { crops })}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="site-band">
        <h2>{t("bandTitle")}</h2>
        <p>{t("bandText")}</p>
        <Link to="/contact" className="button">
          {t("bookMeeting")}
        </Link>
      </section>
    </div>
  );
}
