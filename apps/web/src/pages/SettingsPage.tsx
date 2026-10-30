import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type CurrentUser, type Session } from "../api/client";
import { type AuditEntry, type ClaudeModel, type Org } from "../api/types";
import { useAuth, useCan } from "../auth/AuthContext";
import { Badge, Card, ErrorNote, Field, formatDate } from "../components/ui";
import { LanguageSelect, useT } from "../i18n";
import { common } from "../i18n/common";
import { useModelLabel } from "../i18n/models";
import { m } from "./SettingsPage.i18n";

const ROLE_NAME = {
  admin: "roleAdmin",
  grader: "roleGrader",
  viewer: "roleViewer",
} as const satisfies Record<CurrentUser["role"], keyof typeof common>;

export function SettingsPage() {
  const can = useCan();
  const t = useT(m);
  return (
    <div className="stack">
      <h1>{t("settings")}</h1>
      <Card title={t("language")}>
        <Field label={t("language")} hint={t("languageHint")}>
          <LanguageSelect />
        </Field>
      </Card>
      <ProfileCard />
      <PasswordCard />
      <SessionsCard />
      <OrgCard />
      {can.admin && <AuditCard />}
    </div>
  );
}

function ProfileCard() {
  const { user, setUser } = useAuth();
  const t = useT(m);
  const tc = useT(common);
  const [name, setName] = useState(user?.name ?? "");
  const save = useMutation({
    mutationFn: () => api.patch<CurrentUser>("/auth/me", { name }),
    onSuccess: setUser,
  });
  const resend = useMutation({
    mutationFn: () => api.post("/auth/email/resend", { email: user?.email }),
  });
  return (
    <Card title={t("profile")}>
      <form
        className="grid-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("name")}>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t("email")}>
          <input value={user?.email ?? ""} disabled />
        </Field>
        <div className="row">
          {user && <Badge>{tc(ROLE_NAME[user.role])}</Badge>}
          {user?.emailVerified ? (
            <Badge tone="good">{t("emailConfirmed")}</Badge>
          ) : (
            <button
              type="button"
              className="link"
              disabled={resend.isPending || resend.isSuccess}
              onClick={() => resend.mutate()}
            >
              {resend.isSuccess
                ? t("confirmationSent")
                : t("resendConfirmation")}
            </button>
          )}
        </div>
        <button
          className="primary"
          disabled={save.isPending || name === user?.name}
        >
          {tc("save")}
        </button>
      </form>
      <ErrorNote error={save.error ?? resend.error} />
    </Card>
  );
}

function PasswordCard() {
  const { signIn } = useAuth();
  const t = useT(m);
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const change = useMutation({
    mutationFn: () =>
      api.post<Session>("/auth/password/change", {
        currentPassword,
        newPassword,
      }),
    onSuccess: (session) => {
      signIn(session);
      setCurrent("");
      setNew("");
    },
  });
  return (
    <Card title={t("password")}>
      <form
        className="grid-2"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
      >
        <Field label={t("currentPassword")}>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label={t("newPassword")} hint={t("newPasswordHint")}>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
          />
        </Field>
        <button className="primary" disabled={change.isPending}>
          {t("changePassword")}
        </button>
      </form>
      <ErrorNote error={change.error} />
      {change.isSuccess && <p className="good">{t("passwordChanged")}</p>}
    </Card>
  );
}

function SessionsCard() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const t = useT(m);
  const all = useMutation({
    mutationFn: () => api.post("/auth/logout-all"),
    onSuccess: () => void signOut().then(() => navigate("/login")),
  });
  return (
    <Card title={t("sessions")}>
      <p className="muted small">{t("lostPhone")}</p>
      <button
        className="danger"
        disabled={all.isPending}
        onClick={() => all.mutate()}
      >
        {t("signOutEverywhere")}
      </button>
      <ErrorNote error={all.error} />
    </Card>
  );
}

function OrgCard() {
  const can = useCan();
  const t = useT(m);
  const modelLabel = useModelLabel();
  const qc = useQueryClient();
  const org = useQuery({
    queryKey: ["org"],
    queryFn: () => api.get<Org>("/org"),
  });
  const [name, setName] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: { name?: string; defaultModel?: ClaudeModel | null }) =>
      api.patch("/org", body),
    onSuccess: () => {
      setName(null);
      void qc.invalidateQueries({ queryKey: ["org"] });
    },
  });
  if (!org.data) return <ErrorNote error={org.error} />;
  const o = org.data;
  return (
    <Card title={t("organisation")}>
      {!o.claudeConfigured && (
        <p className="warn small">{t("claudeMissing")}</p>
      )}
      <div className="grid-2">
        <Field label={t("name")}>
          <input
            disabled={!can.admin}
            value={name ?? o.name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t("defaultModel")} hint={t("defaultModelHint")}>
          <select
            disabled={!can.admin}
            value={o.defaultModel ?? ""}
            onChange={(e) =>
              save.mutate({
                defaultModel: (e.target.value || null) as ClaudeModel | null,
              })
            }
          >
            <option value="">
              {t("serverDefault", { model: modelLabel(o.effectiveModel) })}
            </option>
            {o.models.map((model) => (
              <option key={model} value={model}>
                {modelLabel(model)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {can.admin && name !== null && name !== o.name && (
        <button
          className="primary"
          disabled={save.isPending}
          onClick={() => save.mutate({ name })}
        >
          {t("saveName")}
        </button>
      )}
      <ErrorNote error={save.error} />
    </Card>
  );
}

function AuditCard() {
  const t = useT(m);
  const audit = useQuery({
    queryKey: ["audit"],
    queryFn: () => api.get<AuditEntry[]>("/audit"),
  });
  return (
    <Card title={t("activityLog")}>
      <ErrorNote error={audit.error} />
      <div className="table-scroll">
        <table className="table small">
          <thead>
            <tr>
              <th>{t("when")}</th>
              <th>{t("who")}</th>
              <th>{t("what")}</th>
              <th>{t("ip")}</th>
            </tr>
          </thead>
          <tbody>
            {audit.data?.map((a) => (
              <tr key={a.id}>
                <td>{formatDate(a.createdAt)}</td>
                <td>{a.user?.name ?? "—"}</td>
                <td>
                  {a.action}
                  {a.detail && (
                    <span className="muted"> {JSON.stringify(a.detail)}</span>
                  )}
                </td>
                <td>{a.ip ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
