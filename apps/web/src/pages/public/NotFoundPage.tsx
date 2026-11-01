import { Link } from "react-router-dom";
import { useT } from "../../i18n";
import { m } from "./NotFoundPage.i18n";

export function NotFoundPage() {
  const t = useT(m);
  return (
    <div className="site-page">
      <section className="hero compact">
        <span className="eyebrow">{t("eyebrow")}</span>
        <h1>{t("title")}</h1>
        <p className="hero-lead">{t("text")}</p>
        <div className="row wrap center">
          <Link to="/" className="button primary">
            {t("home")}
          </Link>
          <Link to="/demo" className="button">
            {t("demo")}
          </Link>
          <Link to="/hub" className="button">
            {t("hub")}
          </Link>
          <Link to="/contact" className="button">
            {t("contact")}
          </Link>
        </div>
      </section>
    </div>
  );
}
