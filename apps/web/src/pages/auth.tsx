import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { api, ApiError, type Session } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ErrorNote, Field, Spinner } from "../components/ui";

function AuthFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="auth">
      <div className="auth-box">
        <div className="auth-brand">
          <img src="/icon.svg" alt="" width={40} height={40} />
          <span>AI-Grain</span>
        </div>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

/** Runs an async form action with busy and error state. */
function useAction<T>(action: () => Promise<T>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (err) {
      setError(err);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

const PASSWORD_HINT = "At least 10 characters. A short sentence works well.";

export function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [needsVerify, setNeedsVerify] = useState(false);
  const { busy, error, run } = useAction(async () => {
    try {
      signIn(await api.post<Session>("/auth/login", { email, password }));
      void navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_unverified")
        setNeedsVerify(true);
      throw err;
    }
  });
  if (user) return <Navigate to={from} replace />;
  return (
    <AuthFrame title="Sign in">
      <form onSubmit={(e) => void run(e)} className="stack">
        <Field label="Email">
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorNote error={error} />
        {needsVerify && (
          <button
            type="button"
            className="link"
            onClick={() =>
              void api
                .post("/auth/email/resend", { email })
                .then(() => alert("Confirmation email sent."))
            }
          >
            Resend the confirmation email
          </button>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="auth-links">
        <Link to="/forgot-password">Forgot password?</Link> ·{" "}
        <Link to="/register">Create an organisation</Link>
      </p>
    </AuthFrame>
  );
}

export function RegisterPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    orgName: "",
    name: "",
    email: "",
    password: "",
  });
  const [sentVerification, setSentVerification] = useState(false);
  const { busy, error, run } = useAction(async () => {
    const res = await api.post<Session | { verificationRequired: true }>(
      "/auth/register",
      form,
    );
    if ("accessToken" in res) {
      signIn(res);
      void navigate("/app/standards", { replace: true });
    } else {
      setSentVerification(true);
    }
  });
  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [k]: e.target.value });

  if (sentVerification) {
    return (
      <AuthFrame title="Check your email">
        <p>
          We sent a confirmation link to {form.email}. Open it, then sign in.
        </p>
        <Link to="/login">Back to sign in</Link>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="Create an organisation">
      <p className="muted">
        You'll be its admin and can invite graders and viewers.
      </p>
      <form onSubmit={(e) => void run(e)} className="stack">
        <Field label="Farm, company or lab name">
          <input required value={form.orgName} onChange={set("orgName")} />
        </Field>
        <Field label="Your name">
          <input
            required
            autoComplete="name"
            value={form.name}
            onChange={set("name")}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={set("email")}
          />
        </Field>
        <Field label="Password" hint={PASSWORD_HINT}>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={form.password}
            onChange={set("password")}
          />
        </Field>
        <ErrorNote error={error} />
        <button className="primary" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="auth-links">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthFrame>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction(async () => {
    await api.post("/auth/password/forgot", { email });
    setSent(true);
  });
  return (
    <AuthFrame title="Reset your password">
      {sent ? (
        <p>
          If an account exists for {email}, a reset link is on its way. It's
          valid for one hour.
        </p>
      ) : (
        <form onSubmit={(e) => void run(e)} className="stack">
          <Field label="Email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <ErrorNote error={error} />
          <button className="primary" disabled={busy}>
            Send reset link
          </button>
        </form>
      )}
      <p className="auth-links">
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthFrame>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const { busy, error, run } = useAction(async () => {
    await api.post("/auth/password/reset", { token, password });
    setDone(true);
  });
  return (
    <AuthFrame title="Choose a new password">
      {done ? (
        <p>
          Password changed, and you've been signed out everywhere.{" "}
          <Link to="/login">Sign in</Link>
        </p>
      ) : (
        <form onSubmit={(e) => void run(e)} className="stack">
          <Field label="New password" hint={PASSWORD_HINT}>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <ErrorNote error={error} />
          <button className="primary" disabled={busy || !token}>
            Set password
          </button>
        </form>
      )}
    </AuthFrame>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { user, setUser } = useAuth();
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    api
      .post("/auth/email/verify", { token })
      .then(() => setState("done"))
      .catch((err: unknown) => {
        setError(err);
        setState("failed");
      });
  }, [token]);
  useEffect(() => {
    if (state === "done" && user && !user.emailVerified)
      setUser({ ...user, emailVerified: true });
  }, [state, user, setUser]);
  return (
    <AuthFrame title="Confirm email">
      {state === "working" && <Spinner label="Confirming…" />}
      {state === "done" && <p>Your email address is confirmed.</p>}
      {state === "failed" && <ErrorNote error={error} />}
      <Link to={user ? "/app" : "/login"}>Continue</Link>
    </AuthFrame>
  );
}

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<{
    email: string;
    role: string;
    orgName: string;
  } | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  useEffect(() => {
    api
      .get<{ email: string; role: string; orgName: string }>(
        `/auth/invite/${encodeURIComponent(token)}`,
      )
      .then(setInvite)
      .catch(setLoadError);
  }, [token]);
  const { busy, error, run } = useAction(async () => {
    signIn(
      await api.post<Session>("/auth/invite/accept", { token, name, password }),
    );
    void navigate("/app", { replace: true });
  });
  return (
    <AuthFrame title="Join your team">
      {loadError ? <ErrorNote error={loadError} /> : null}
      {!invite && !loadError && <Spinner />}
      {invite && (
        <form onSubmit={(e) => void run(e)} className="stack">
          <p>
            You're invited to <strong>{invite.orgName}</strong> as{" "}
            <strong>{invite.role}</strong>, with the email {invite.email}.
          </p>
          <Field label="Your name">
            <input
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Password" hint={PASSWORD_HINT}>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <ErrorNote error={error} />
          <button className="primary" disabled={busy}>
            Create account
          </button>
        </form>
      )}
    </AuthFrame>
  );
}
