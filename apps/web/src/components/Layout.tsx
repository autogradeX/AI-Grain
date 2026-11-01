import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  ChartColumn,
  ChevronLeft,
  Database,
  ExternalLink,
  Globe,
  Images,
  LogOut,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Ruler,
  ScanSearch,
  Settings,
  Users,
  Wheat,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { api } from "../api/client";
import type { Org } from "../api/types";
import { useAuth, useCan } from "../auth/AuthContext";
import { LanguageSelect, useT } from "../i18n";
import { common } from "../i18n/common";
import { InstallButton, OfflineBanner } from "../pwa/Pwa";
import { usePhoneView } from "../pwa/pwa";
import { m } from "./Layout.i18n";

type Key = keyof typeof m;

interface Item {
  to: string;
  key: Key;
  icon: LucideIcon;
  end?: boolean;
  show?: "admin" | "website";
}

const SECTIONS: { key: Key; items: Item[] }[] = [
  {
    key: "workspace",
    items: [
      { to: "/app", key: "samples", icon: ScanSearch, end: true },
      { to: "/app/analytics", key: "analytics", icon: ChartColumn },
    ],
  },
  {
    key: "setup",
    items: [
      { to: "/app/crops", key: "crops", icon: Wheat },
      { to: "/app/standards", key: "standards", icon: Ruler },
      { to: "/app/references", key: "references", icon: Images },
    ],
  },
  {
    key: "quality",
    items: [
      { to: "/app/validation", key: "validation", icon: BadgeCheck },
      { to: "/app/dataset", key: "dataset", icon: Database, show: "admin" },
      { to: "/app/prompt", key: "prompt", icon: MessageSquareText },
    ],
  },
  {
    key: "organisation",
    items: [
      { to: "/app/users", key: "users", icon: Users, show: "admin" },
      { to: "/app/website", key: "website", icon: Globe, show: "website" },
      { to: "/app/settings", key: "settings", icon: Settings },
    ],
  },
];

/** Which section a path belongs to, and where "back" goes from a detail page. */
const ROUTES: [RegExp, Key, string?][] = [
  [/^\/app\/(samples|batches)\/[^/]+/, "samples", "/app"],
  [/^\/app\/crops\/[^/]+/, "crops", "/app/crops"],
  [/^\/app\/standards\/[^/]+/, "standards", "/app/standards"],
  [/^\/app\/analytics/, "analytics"],
  [/^\/app\/crops/, "crops"],
  [/^\/app\/standards/, "standards"],
  [/^\/app\/references/, "references"],
  [/^\/app\/validation/, "validation"],
  [/^\/app\/dataset/, "dataset"],
  [/^\/app\/prompt/, "prompt"],
  [/^\/app\/users/, "users"],
  [/^\/app\/website/, "website"],
  [/^\/app\/settings/, "settings"],
];

function routeInfo(path: string): { key: Key; parent?: string } {
  for (const [re, key, parent] of ROUTES)
    if (re.test(path)) return parent ? { key, parent } : { key };
  return { key: "samples" };
}

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

const DRAWER_QUERY = "(max-width: 1023px)";

/** Below the desktop breakpoint the sidebar becomes a drawer. */
function useIsDrawer(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = matchMedia(DRAWER_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => matchMedia(DRAWER_QUERY).matches,
  );
}

const COLLAPSE_KEY = "ai-grain.sidebar-collapsed";

function initialCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function Brand({ onClick }: { onClick?: (() => void) | undefined }) {
  return (
    <Link to="/app" className="side-brand" onClick={onClick}>
      <img src="/icon.svg" alt="" width={30} height={30} />
      <span className="side-label">AI-Grain</span>
    </Link>
  );
}

/** The navigation itself: the same in the desktop sidebar and the phone drawer. */
function Navigation({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const t = useT(m);
  const can = useCan();
  const website = useManagesWebsite();
  return (
    <nav className="side-nav" aria-label={t("mainNav")}>
      {SECTIONS.map((section) => {
        const items = section.items.filter(
          (i) =>
            !i.show ||
            (i.show === "admin" && can.admin) ||
            (i.show === "website" && website),
        );
        if (!items.length) return null;
        return (
          <div key={section.key} className="side-section">
            <div className="side-heading" aria-hidden={collapsed}>
              {t(section.key)}
            </div>
            <ul>
              {items.map(({ to, key, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end ?? false}
                    className="side-link"
                    title={collapsed ? t(key) : undefined}
                    onClick={onNavigate}
                  >
                    <Icon size={18} strokeWidth={1.9} aria-hidden />
                    <span className="side-label">{t(key)}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Account({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const t = useT(m);
  const tc = useT(common);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const role = {
    admin: "roleAdmin",
    grader: "roleGrader",
    viewer: "roleViewer",
  } as const;
  return (
    <div className="side-account">
      <div className="side-tools">
        <LanguageSelect className="side-label" />
        <InstallButton className="side-link" />
        <Link
          to="/"
          className="side-link"
          title={collapsed ? t("publicSite") : undefined}
          onClick={onNavigate}
        >
          <ExternalLink size={18} strokeWidth={1.9} aria-hidden />
          <span className="side-label">{t("publicSite")}</span>
        </Link>
      </div>
      <div className="side-user">
        <Link
          to="/app/settings"
          className="avatar"
          title={collapsed ? `${user.name} · ${user.org.name}` : t("account")}
          aria-label={t("account")}
          onClick={onNavigate}
        >
          {initials(user.name)}
        </Link>
        <div className="side-user-text side-label">
          <strong>{user.name}</strong>
          <span>
            {user.org.name} · {tc(role[user.role])}
          </span>
        </div>
        <button
          className="icon-button side-label"
          title={t("signOut")}
          aria-label={t("signOut")}
          onClick={() => void signOut().then(() => navigate("/login"))}
        >
          <LogOut size={18} strokeWidth={1.9} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Keeps keyboard focus inside the open drawer, and closes it with Escape. */
function useDrawerFocus(
  open: boolean,
  panel: RefObject<HTMLElement | null>,
  opener: RefObject<HTMLElement | null>,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const el = panel.current!;
    const back = opener.current;
    const focusables = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>("a[href], button, select"),
      ).filter((f) => !f.hasAttribute("disabled"));
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key !== "Tab") return;
      const list = focusables();
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      back?.focus();
    };
  }, [open, panel, opener, close]);
}

export function Layout() {
  const t = useT(m);
  const { user } = useAuth();
  const drawer = useIsDrawer();
  const [open, setOpen] = useState(false);
  const [collapsedPref, setCollapsed] = useState(initialCollapsed);
  const panel = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const drawerOpen = drawer && open;
  // The drawer always shows labels; only the desktop sidebar collapses.
  const collapsed = !drawer && collapsedPref;
  useDrawerFocus(drawerOpen, panel, opener, close);

  const toggleCollapsed = () => {
    const next = !collapsedPref;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      // Not remembered; still collapses now.
    }
  };
  const onNavigate = drawer ? close : undefined;
  const can = useCan();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [view] = usePhoneView();
  // On phones: a native-style app with bottom tabs, unless switched to classic.
  const appView = drawer && view === "app";
  const here = routeInfo(pathname);
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) void navigate(-1);
    else void navigate(here.parent ?? "/app");
  };

  return (
    <div
      className={`app-shell ${collapsed ? "is-collapsed" : ""} ${drawerOpen ? "drawer-open" : ""} ${appView ? "app-view" : ""}`}
    >
      <header className="app-bar">
        {appView ? (
          <>
            {here.parent ? (
              <button
                className="icon-button"
                aria-label={t("back")}
                onClick={goBack}
              >
                <ChevronLeft size={24} aria-hidden />
              </button>
            ) : (
              <img src="/icon.svg" alt="" width={30} height={30} />
            )}
            <div className="app-bar-title">{t(here.key)}</div>
          </>
        ) : (
          <>
            <button
              ref={opener}
              className="icon-button"
              aria-label={t("openMenu")}
              aria-expanded={drawerOpen}
              aria-controls="app-sidebar"
              onClick={() => setOpen(true)}
            >
              <Menu size={22} aria-hidden />
            </button>
            <Brand />
          </>
        )}
        {user && (
          <Link
            to="/app/settings"
            className="avatar app-bar-avatar"
            aria-label={t("account")}
          >
            {initials(user.name)}
          </Link>
        )}
      </header>

      {drawerOpen && (
        <div className="scrim" aria-hidden onClick={() => setOpen(false)} />
      )}

      <aside
        id="app-sidebar"
        ref={panel}
        className="sidebar"
        role={drawer ? "dialog" : undefined}
        aria-modal={drawerOpen || undefined}
        aria-label={drawer ? t("mainNav") : undefined}
        // Off screen and out of the tab order while the drawer is closed.
        inert={drawer && !open}
      >
        <div className="side-top">
          <Brand onClick={onNavigate} />
          {drawer ? (
            <button
              className="icon-button"
              aria-label={t("closeMenu")}
              onClick={() => setOpen(false)}
            >
              <X size={20} aria-hidden />
            </button>
          ) : (
            <button
              className="icon-button collapse-toggle"
              aria-label={collapsed ? t("expand") : t("collapse")}
              title={collapsed ? t("expand") : t("collapse")}
              aria-pressed={collapsed}
              onClick={toggleCollapsed}
            >
              {collapsed ? (
                <PanelLeftOpen size={18} aria-hidden />
              ) : (
                <PanelLeftClose size={18} aria-hidden />
              )}
            </button>
          )}
        </div>
        <Navigation collapsed={collapsed} onNavigate={onNavigate} />
        <Account collapsed={collapsed} onNavigate={onNavigate} />
      </aside>

      <div className="app-main">
        <OfflineBanner />
        {user && user.emailEnabled && !user.emailVerified && (
          <div className="banner">
            {t("confirmEmail", { email: user.email })}
          </div>
        )}
        <main
          // In the app view each screen slides in, like a native app.
          key={appView ? pathname : undefined}
          className={appView ? "content page-enter" : "content"}
        >
          <Outlet />
        </main>
      </div>

      {appView && (
        <nav className="tab-bar" aria-label={t("mainNav")}>
          <TabLink to="/app" icon={ScanSearch} active={here.key === "samples"}>
            {t("samplesTab")}
          </TabLink>
          <TabLink
            to="/app/analytics"
            icon={ChartColumn}
            active={here.key === "analytics"}
          >
            {t("analyticsTab")}
          </TabLink>
          {can.write && (
            <Link
              to="/app?new=1"
              className="tab-new"
              aria-label={t("newSample")}
            >
              <Plus size={26} strokeWidth={2.4} aria-hidden />
            </Link>
          )}
          <TabLink
            to="/app/standards"
            icon={Ruler}
            active={here.key === "standards"}
          >
            {t("standardsTab")}
          </TabLink>
          <button
            ref={opener}
            className={`tab ${drawerOpen ? "active" : ""}`}
            aria-expanded={drawerOpen}
            aria-controls="app-sidebar"
            onClick={() => setOpen(true)}
          >
            <Menu size={22} strokeWidth={1.9} aria-hidden />
            <span>{t("menuTab")}</span>
          </button>
        </nav>
      )}
    </div>
  );
}

function TabLink({
  to,
  icon: Icon,
  active,
  children,
}: {
  to: string;
  icon: LucideIcon;
  active: boolean;
  children: string;
}) {
  return (
    <Link
      to={to}
      className={`tab ${active ? "active" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={22} strokeWidth={active ? 2.2 : 1.9} aria-hidden />
      <span>{children}</span>
    </Link>
  );
}
