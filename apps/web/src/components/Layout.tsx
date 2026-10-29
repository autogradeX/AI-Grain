import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth, useCan } from "../auth/AuthContext";

export function Layout() {
  const { user, signOut } = useAuth();
  const can = useCan();
  const navigate = useNavigate();

  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} /> AI-Grain
        </NavLink>
        <nav className="topnav" aria-label="Main">
          <NavLink to="/" end>
            Samples
          </NavLink>
          <NavLink to="/crops">Crops</NavLink>
          <NavLink to="/standards">Standards</NavLink>
          <NavLink to="/references">References</NavLink>
          <NavLink to="/validation">Validation</NavLink>
          <NavLink to="/prompt">Claude app prompt</NavLink>
          {can.admin && <NavLink to="/dataset">Dataset</NavLink>}
          {can.admin && <NavLink to="/users">Users</NavLink>}
          <NavLink to="/settings">Settings</NavLink>
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
        <NavLink to="/" end>
          Samples
        </NavLink>
        <NavLink to="/standards">Standards</NavLink>
        <NavLink to="/validation">Validation</NavLink>
        <NavLink to="/more">More</NavLink>
      </nav>
    </div>
  );
}

/** The mobile "More" page: links that don't fit the bottom bar. */
export function MorePage() {
  const can = useCan();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="stack">
      <h1>More</h1>
      <nav className="menu">
        <NavLink to="/crops">Crops and classes</NavLink>
        <NavLink to="/references">Reference images</NavLink>
        <NavLink to="/prompt">Claude app prompt (Level 1)</NavLink>
        {can.admin && <NavLink to="/dataset">Training dataset</NavLink>}
        {can.admin && <NavLink to="/users">Users and invites</NavLink>}
        <NavLink to="/settings">Settings</NavLink>
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
