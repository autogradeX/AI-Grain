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
import { LanguageSelect, useT, type Translate } from "../i18n";
import { common } from "../i18n/common";
import { m } from "./auth.i18n";

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
          <span style={{ marginLeft: "auto" }}>
            <LanguageSelect />
          </span>
        </div>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

/** The role name in the current language; unknown roles are shown as sent. */
function roleLabel(tc: Translate<keyof typeof common>, role: string): string {
  if (role === "admin") return tc("roleAdmin");
  if (role === "grader") return tc("roleGrader");
  if (role === "viewer") return tc("roleViewer");
  return role;
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

export function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [needsVerify, setNeedsVerify] = useState(false);
  const t = useT(m);
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
    <AuthFrame title={t("signIn")}>
      <form onSubmit={(e) => void run(e)} className="stack">
        <Field label={t("email")}>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t("password")}>
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
                .then(() => alert(t("confirmationSent")))
            }
          >
            {t("resendConfirmation")}
          </button>
        )}
        <button className="primary" disabled={busy}>
          {busy ? t("signingIn") : t("signIn")}
        </button>
      </form>
      <p className="auth-links">
        <Link to="/forgot-password">{t("forgotPassword")}</Link> ·{" "}
        <Link to="/register">{t("createOrg")}</Link>
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
  const t = useT(m);
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
      <AuthFrame title={t("checkEmail")}>
        <p>{t("sentConfirmation", { email: form.email })}</p>
        <Link to="/login">{t("backToSignIn")}</Link>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title={t("createOrg")}>
      <p className="muted">{t("youllBeAdmin")}</p>
      <form onSubmit={(e) => void run(e)} className="stack">
        <Field label={t("orgName")}>
          <input required value={form.orgName} onChange={set("orgName")} />
        </Field>
        <Field label={t("yourName")}>
          <input
            required
            autoComplete="name"
            value={form.name}
            onChange={set("name")}
          />
        </Field>
        <Field label={t("email")}>
          <input
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={set("email")}
          />
        </Field>
        <Field label={t("password")} hint={t("passwordHint")}>
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
          {busy ? t("creating") : t("createAccount")}
        </button>
      </form>
      <p className="auth-links">
        {t.rich("haveAccount", {
          link: <Link to="/login">{t("signIn")}</Link>,
        })}
      </p>
    </AuthFrame>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const t = useT(m);
  const { busy, error, run } = useAction(async () => {
    await api.post("/auth/password/forgot", { email });
    setSent(true);
  });
  return (
    <AuthFrame title={t("resetTitle")}>
      {sent ? (
        <p>{t("resetSent", { email })}</p>
      ) : (
        <form onSubmit={(e) => void run(e)} className="stack">
          <Field label={t("email")}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <ErrorNote error={error} />
          <button className="primary" disabled={busy}>
            {t("sendResetLink")}
          </button>
        </form>
      )}
      <p className="auth-links">
        <Link to="/login">{t("backToSignIn")}</Link>
      </p>
    </AuthFrame>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const t = useT(m);
  const { busy, error, run } = useAction(async () => {
    await api.post("/auth/password/reset", { token, password });
    setDone(true);
  });
  return (
    <AuthFrame title={t("newPasswordTitle")}>
      {done ? (
        <p>
          {t.rich("passwordChanged", {
            link: <Link to="/login">{t("signIn")}</Link>,
          })}
        </p>
      ) : (
        <form onSubmit={(e) => void run(e)} className="stack">
          <Field label={t("newPassword")} hint={t("passwordHint")}>
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
            {t("setPassword")}
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
  const t = useT(m);
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
    <AuthFrame title={t("confirmEmailTitle")}>
      {state === "working" && <Spinner label={t("confirming")} />}
      {state === "done" && <p>{t("emailConfirmed")}</p>}
      {state === "failed" && <ErrorNote error={error} />}
      <Link to={user ? "/app" : "/login"}>{t("continue")}</Link>
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
  const t = useT(m);
  const tc = useT(common);
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
    <AuthFrame title={t("joinTeam")}>
      {loadError ? <ErrorNote error={loadError} /> : null}
      {!invite && !loadError && <Spinner />}
      {invite && (
        <form onSubmit={(e) => void run(e)} className="stack">
          <p>
            {t.rich("invited", {
              org: <strong>{invite.orgName}</strong>,
              role: <strong>{roleLabel(tc, invite.role)}</strong>,
              email: invite.email,
            })}
          </p>
          <Field label={t("yourName")}>
            <input
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={t("password")} hint={t("passwordHint")}>
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
            {t("createAccount")}
          </button>
        </form>
      )}
    </AuthFrame>
  );
}
