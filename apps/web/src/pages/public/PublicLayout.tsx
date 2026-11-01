import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { LanguageSelect, useT } from "../../i18n";
import { HeadSync } from "../../seo/HeadSync";
import { m } from "./PublicLayout.i18n";

export interface PublicSite {
  name: string;
  bookingUrl: string | null;
  contactEmail: string | null;
  phone: string | null;
  address: string | null;
  demos: number;
}

export function usePublicSite() {
  return useQuery({
    queryKey: ["public-site"],
    queryFn: () => api.get<PublicSite>("/public/site"),
    staleTime: 5 * 60_000,
  });
}

/** The public website's frame: header with navigation and calls to action, footer with links. */
export function PublicLayout() {
  const { user } = useAuth();
  const site = usePublicSite();
  const [open, setOpen] = useState(false);
  // The home page is a dark, full-screen stage; the header floats over it.
  const landing = useLocation().pathname === "/";
  const t = useT(m);
  const links = (
    <>
      <NavLink to="/demo" onClick={() => setOpen(false)}>
        {t("demo")}
      </NavLink>
      <NavLink to="/roi" onClick={() => setOpen(false)}>
        {t("roi")}
      </NavLink>
      <NavLink to="/hub" onClick={() => setOpen(false)}>
        {t("hub")}
      </NavLink>
      <NavLink to="/verify" onClick={() => setOpen(false)}>
        {t("verify")}
      </NavLink>
      <NavLink to="/contact" onClick={() => setOpen(false)}>
        {t("contact")}
      </NavLink>
    </>
  );
  return (
    <div className={landing ? "site site--landing" : "site"}>
      <header className="site-header">
        <Link to="/" className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} /> AI-Grain
        </Link>
        <nav className="site-nav" aria-label={t("websiteNav")}>
          {links}
        </nav>
        <div className="site-cta">
          <LanguageSelect />
          {user ? (
            <Link to="/app" className="button">
              {t("openApp")}
            </Link>
          ) : (
            <Link to="/login" className="button">
              {t("signIn")}
            </Link>
          )}
          <Link to="/contact" className="button primary">
            {t("bookMeeting")}
          </Link>
          <button
            className="site-menu-toggle"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {t("menu")}
          </button>
        </div>
      </header>
      {open && (
        <nav className="site-nav-mobile" aria-label={t("websiteNav")}>
          {links}
          {/* On narrow screens these leave the header for the menu. */}
          <div className="site-nav-extra">
            <LanguageSelect />
            <Link
              to="/contact"
              className="button primary"
              onClick={() => setOpen(false)}
            >
              {t("bookMeeting")}
            </Link>
          </div>
        </nav>
      )}
      <HeadSync />
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <div>
            <div className="brand">
              <img src="/icon.svg" alt="" width={24} height={24} /> AI-Grain
            </div>
            <p className="muted small">{t("footerAbout")}</p>
          </div>
          <div className="site-footer-links">
            <strong>{t("product")}</strong>
            <Link to="/demo">{t("demo")}</Link>
            <Link to="/roi">{t("roi")}</Link>
            <Link to="/verify">{t("verify")}</Link>
          </div>
          <div className="site-footer-links">
            <strong>{t("resources")}</strong>
            <Link to="/hub?kind=guide">{t("guides")}</Link>
            <Link to="/hub?kind=glossary">{t("glossary")}</Link>
            <Link to="/hub?kind=news">{t("news")}</Link>
            <Link to="/hub?kind=case_study">{t("caseStudies")}</Link>
          </div>
          <div className="site-footer-links">
            <strong>{t("contact")}</strong>
            <span className="small">{site.data?.name}</span>
            {site.data?.contactEmail && (
              <a href={`mailto:${site.data.contactEmail}`}>
                {site.data.contactEmail}
              </a>
            )}
            {site.data?.phone && (
              <a href={`tel:${site.data.phone.replace(/\s/g, "")}`}>
                {site.data.phone}
              </a>
            )}
            {site.data?.address && (
              <span className="small muted">{site.data.address}</span>
            )}
            <Link to="/contact">{t("sendMessage")}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
