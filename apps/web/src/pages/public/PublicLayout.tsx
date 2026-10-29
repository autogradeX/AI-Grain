import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";

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
  const links = (
    <>
      <NavLink to="/demo" onClick={() => setOpen(false)}>
        Demo analysis
      </NavLink>
      <NavLink to="/roi" onClick={() => setOpen(false)}>
        ROI calculator
      </NavLink>
      <NavLink to="/hub" onClick={() => setOpen(false)}>
        Knowledge hub
      </NavLink>
      <NavLink to="/verify" onClick={() => setOpen(false)}>
        Verify a report
      </NavLink>
      <NavLink to="/contact" onClick={() => setOpen(false)}>
        Contact
      </NavLink>
    </>
  );
  return (
    <div className="site">
      <header className="site-header">
        <Link to="/" className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} /> AI-Grain
        </Link>
        <nav className="site-nav" aria-label="Website">
          {links}
        </nav>
        <div className="site-cta">
          {user ? (
            <Link to="/app" className="button">
              Open the app
            </Link>
          ) : (
            <Link to="/login" className="button">
              Sign in
            </Link>
          )}
          <Link to="/contact" className="button primary">
            Book a meeting
          </Link>
          <button
            className="site-menu-toggle"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            Menu
          </button>
        </div>
      </header>
      {open && (
        <nav className="site-nav-mobile" aria-label="Website">
          {links}
        </nav>
      )}
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <div>
            <div className="brand">
              <img src="/icon.svg" alt="" width={24} height={24} /> AI-Grain
            </div>
            <p className="muted small">
              Grain impurity screening with a phone, a precise scale and Claude.
              A screening and pre-check tool, not an official grading method
              unless validated and approved.
            </p>
          </div>
          <div className="site-footer-links">
            <strong>Product</strong>
            <Link to="/demo">Demo analysis</Link>
            <Link to="/roi">ROI calculator</Link>
            <Link to="/verify">Verify a report</Link>
          </div>
          <div className="site-footer-links">
            <strong>Resources</strong>
            <Link to="/hub?kind=guide">Guides</Link>
            <Link to="/hub?kind=glossary">Glossary</Link>
            <Link to="/hub?kind=news">News</Link>
            <Link to="/hub?kind=case_study">Case studies</Link>
          </div>
          <div className="site-footer-links">
            <strong>Contact</strong>
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
            <Link to="/contact">Send a message</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
