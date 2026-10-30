import { CLASS_GROUPS, type ClassGroup } from "@ai-grain/core";
import { Link } from "react-router-dom";
import { useT } from "../../i18n";
import { useGrainLabels } from "../../i18n/common";
import { m } from "./home/HomePage.i18n";

const GROUP_TEXT: Record<"sound" | ClassGroup, keyof typeof m> = {
  sound: "groupTextSound",
  admixture: "groupTextAdmixture",
  broken_defective: "groupTextBrokenDefective",
  impurity: "groupTextImpurity",
  harmful: "groupTextHarmful",
};

/** EN 15587-style groups with a short description each; on the home and demo pages. */
export function CategorySection() {
  const t = useT(m);
  const { groupLabel } = useGrainLabels();
  return (
    <section className="site-section split">
      <div data-reveal>
        <h2>{t("categoryTitle")}</h2>
        <p>{t("categoryText")}</p>
        <p className="muted small">
          {t("categoryNote")}{" "}
          <Link to="/hub?kind=glossary">{t("glossary")}</Link>
        </p>
      </div>
      <ul className="category-list">
        {(["sound", ...CLASS_GROUPS] as const).map((g) => (
          <li key={g} className="card" data-reveal>
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
