import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Org } from "../api/types";
import { useAuth, useCan } from "../auth/AuthContext";
import { LanguageSelect, useT } from "../i18n";
import { m } from "./Layout.i18n";

/** Admins of the organisation that runs the public website also manage it. */
function useManagesWebsite(): boolean {
  const can = useCan();
  const org = useQuery({
    queryKey: ["org"],
    queryFn: () => api.get<Org>("/org"),
    enabled: can.admin,
  });
  return can.admin && !!org.data?.isSiteOwner;
}

export function Layout() {
  const { user, signOut } = useAuth();
  const can = useCan();
  const website = useManagesWebsite();
  const navigate = useNavigate();
  const t = useT(m);

  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/app" className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} /> AI-Grain
        </NavLink>
        <nav className="topnav" aria-label={t("mainNav")}>
          <NavLink to="/app" end>
            {t("samples")}
          </NavLink>
          <NavLink to="/app/analytics">{t("analytics")}</NavLink>
          <NavLink to="/app/crops">{t("crops")}</NavLink>
          <NavLink to="/app/standards">{t("standards")}</NavLink>
          <NavLink to="/app/references">{t("references")}</NavLink>
          <NavLink to="/app/validation">{t("validation")}</NavLink>
          <NavLink to="/app/prompt">{t("prompt")}</NavLink>
          {can.admin && <NavLink to="/app/dataset">{t("dataset")}</NavLink>}
          {can.admin && <NavLink to="/app/users">{t("users")}</NavLink>}
          {website && <NavLink to="/app/website">{t("website")}</NavLink>}
          <NavLink to="/app/settings">{t("settings")}</NavLink>
        </nav>
        <div className="topbar-user">
          <LanguageSelect />
          <span className="muted small">
            {user?.name} · {user?.org.name}
          </span>
          <button
            className="link"
            onClick={() => {
              void signOut().then(() => navigate("/login"));
            }}
          >
            {t("signOut")}
          </button>
        </div>
      </header>
      {user && !user.emailVerified && (
        <div className="banner">{t("confirmEmail", { email: user.email })}</div>
      )}
      <main className="content">
        <Outlet />
      </main>
      <nav className="bottomnav" aria-label={t("mainNav")}>
        <NavLink to="/app" end>
          {t("samples")}
        </NavLink>
        <NavLink to="/app/standards">{t("standards")}</NavLink>
        <NavLink to="/app/validation">{t("validation")}</NavLink>
        <NavLink to="/app/more">{t("more")}</NavLink>
      </nav>
    </div>
  );
}

/** The mobile "More" page: links that don't fit the bottom bar. */
export function MorePage() {
  const can = useCan();
  const website = useManagesWebsite();
  const t = useT(m);
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="stack">
      <h1>{t("more")}</h1>
      <nav className="menu">
        <NavLink to="/app/analytics">{t("analytics")}</NavLink>
        <NavLink to="/app/crops">{t("cropsAndClasses")}</NavLink>
        <NavLink to="/app/references">{t("referenceImages")}</NavLink>
        <NavLink to="/app/prompt">{t("claudePrompt")}</NavLink>
        {can.admin && (
          <NavLink to="/app/dataset">{t("trainingDataset")}</NavLink>
        )}
        {can.admin && <NavLink to="/app/users">{t("usersAndInvites")}</NavLink>}
        {website && <NavLink to="/app/website">{t("publicWebsite")}</NavLink>}
        <NavLink to="/">{t("openPublicSite")}</NavLink>
        <NavLink to="/app/settings">{t("settings")}</NavLink>
        <LanguageSelect />
        <button
          className="link"
          onClick={() => void signOut().then(() => navigate("/login"))}
        >
          {t("signOut")}
        </button>
      </nav>
    </div>
  );
}
