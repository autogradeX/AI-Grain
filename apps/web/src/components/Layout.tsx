import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Org } from "../api/types";
import { useAuth, useCan } from "../auth/AuthContext";

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

  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/app" className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} /> AI-Grain
        </NavLink>
        <nav className="topnav" aria-label="Main">
          <NavLink to="/app" end>
            Samples
          </NavLink>
          <NavLink to="/app/analytics">Analytics</NavLink>
          <NavLink to="/app/crops">Crops</NavLink>
          <NavLink to="/app/standards">Standards</NavLink>
          <NavLink to="/app/references">References</NavLink>
          <NavLink to="/app/validation">Validation</NavLink>
          <NavLink to="/app/prompt">Prompt</NavLink>
          {can.admin && <NavLink to="/app/dataset">Dataset</NavLink>}
          {can.admin && <NavLink to="/app/users">Users</NavLink>}
          {website && <NavLink to="/app/website">Website</NavLink>}
          <NavLink to="/app/settings">Settings</NavLink>
        </nav>
        <div className="topbar-user">
          <span className="muted small">
            {user?.name} · {user?.org.name}
          </span>
          <button
            className="link"
            onClick={() => {
              void signOut().then(() => navigate("/login"));
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      {user && !user.emailVerified && (
        <div className="banner">
          Check your inbox to confirm your email address ({user.email}).
        </div>
      )}
      <main className="content">
        <Outlet />
      </main>
      <nav className="bottomnav" aria-label="Main">
        <NavLink to="/app" end>
          Samples
        </NavLink>
        <NavLink to="/app/standards">Standards</NavLink>
        <NavLink to="/app/validation">Validation</NavLink>
        <NavLink to="/app/more">More</NavLink>
      </nav>
    </div>
  );
}

/** The mobile "More" page: links that don't fit the bottom bar. */
export function MorePage() {
  const can = useCan();
  const website = useManagesWebsite();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="stack">
      <h1>More</h1>
      <nav className="menu">
        <NavLink to="/app/analytics">Analytics</NavLink>
        <NavLink to="/app/crops">Crops and classes</NavLink>
        <NavLink to="/app/references">Reference images</NavLink>
        <NavLink to="/app/prompt">Claude app prompt (Level 1)</NavLink>
        {can.admin && <NavLink to="/app/dataset">Training dataset</NavLink>}
        {can.admin && <NavLink to="/app/users">Users and invites</NavLink>}
        {website && <NavLink to="/app/website">Public website</NavLink>}
        <NavLink to="/">Open the public site</NavLink>
        <NavLink to="/app/settings">Settings</NavLink>
        <button
          className="link"
          onClick={() => void signOut().then(() => navigate("/login"))}
        >
          Sign out
        </button>
      </nav>
    </div>
  );
}
