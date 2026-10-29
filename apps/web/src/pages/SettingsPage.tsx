import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type CurrentUser, type Session } from "../api/client";
import {
  MODEL_LABELS,
  type AuditEntry,
  type ClaudeModel,
  type Org,
} from "../api/types";
import { useAuth, useCan } from "../auth/AuthContext";
import { Badge, Card, ErrorNote, Field, formatDate } from "../components/ui";

export function SettingsPage() {
  const can = useCan();
  return (
    <div className="stack">
      <h1>Settings</h1>
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
  const [name, setName] = useState(user?.name ?? "");
  const save = useMutation({
    mutationFn: () => api.patch<CurrentUser>("/auth/me", { name }),
    onSuccess: setUser,
  });
  const resend = useMutation({
    mutationFn: () => api.post("/auth/email/resend", { email: user?.email }),
  });
  return (
    <Card title="Profile">
      <form
        className="grid-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Email">
          <input value={user?.email ?? ""} disabled />
        </Field>
        <div className="row">
          <Badge>{user?.role}</Badge>
          {user?.emailVerified ? (
            <Badge tone="good">email confirmed</Badge>
          ) : (
            <button
              type="button"
              className="link"
              disabled={resend.isPending || resend.isSuccess}
              onClick={() => resend.mutate()}
            >
              {resend.isSuccess
                ? "Confirmation email sent"
                : "Resend confirmation email"}
            </button>
          )}
        </div>
        <button
          className="primary"
          disabled={save.isPending || name === user?.name}
        >
          Save
        </button>
      </form>
      <ErrorNote error={save.error ?? resend.error} />
    </Card>
  );
}

function PasswordCard() {
  const { signIn } = useAuth();
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
    <Card title="Password">
      <form
        className="grid-2"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
      >
        <Field label="Current password">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field
          label="New password"
          hint="At least 10 characters. Other devices will be signed out."
        >
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
          Change password
        </button>
      </form>
      <ErrorNote error={change.error} />
      {change.isSuccess && <p className="good">Password changed.</p>}
    </Card>
  );
}

function SessionsCard() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const all = useMutation({
    mutationFn: () => api.post("/auth/logout-all"),
    onSuccess: () => void signOut().then(() => navigate("/login")),
  });
  return (
    <Card title="Sessions">
      <p className="muted small">
        Lost a phone? Sign out every device, including this one.
      </p>
      <button
        className="danger"
        disabled={all.isPending}
        onClick={() => all.mutate()}
      >
        Sign out everywhere
      </button>
      <ErrorNote error={all.error} />
    </Card>
  );
}

function OrgCard() {
  const can = useCan();
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
    <Card title="Organisation">
      {!o.claudeConfigured && (
        <p className="warn small">
          Claude is not configured on the server (ANTHROPIC_API_KEY).
          Classification will fail.
        </p>
      )}
      <div className="grid-2">
        <Field label="Name">
          <input
            disabled={!can.admin}
            value={name ?? o.name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field
          label="Default AI model"
          hint="Sonnet is the default. Haiku costs least. Opus is for difficult samples. A sample can override this."
        >
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
              Server default ({MODEL_LABELS[o.effectiveModel]})
            </option>
            {o.models.map((m) => (
              <option key={m} value={m}>
                {MODEL_LABELS[m]}
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
          Save name
        </button>
      )}
      <ErrorNote error={save.error} />
    </Card>
  );
}

function AuditCard() {
  const audit = useQuery({
    queryKey: ["audit"],
    queryFn: () => api.get<AuditEntry[]>("/audit"),
  });
  return (
    <Card title="Activity log">
      <ErrorNote error={audit.error} />
      <div className="table-scroll">
        <table className="table small">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>IP</th>
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
