import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { Invite, Role, UserRow } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import {
  Badge,
  Card,
  ErrorNote,
  Field,
  formatDate,
  Spinner,
} from "../components/ui";

const ROLE_HELP: Record<Role, string> = {
  admin: "Everything, including users, standards and deleting samples",
  grader: "Create and grade samples, review kernels",
  viewer: "Read-only access to samples and reports",
};

export function UsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<UserRow[]>("/users"),
  });
  const invites = useQuery({
    queryKey: ["invites"],
    queryFn: () => api.get<Invite[]>("/users/invites"),
  });
  const update = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      role?: Role;
      active?: boolean;
    }) => api.patch(`/users/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["users"] }),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/users/invites/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["invites"] }),
  });

  return (
    <div className="stack">
      <h1>Users</h1>
      <InviteForm />
      <Card title="Pending invites">
        <ErrorNote error={invites.error ?? revoke.error} />
        {invites.data?.length === 0 && <p className="muted">None.</p>}
        <ul className="list">
          {invites.data?.map((i) => (
            <li key={i.id} className="list-item">
              <span>
                {i.email} · {i.role}
                <div className="muted small">
                  expires {formatDate(i.expiresAt)}
                </div>
              </span>
              <button className="link" onClick={() => revoke.mutate(i.id)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Members">
        {users.isPending && <Spinner />}
        <ErrorNote error={users.error ?? update.error} />
        <ul className="list">
          {users.data?.map((u) => (
            <li key={u.id} className="list-item wrap">
              <div>
                <strong>{u.name}</strong>{" "}
                {u.id === me?.id && <Badge>you</Badge>}{" "}
                {!u.active && <Badge tone="bad">disabled</Badge>}
                <div className="muted small">
                  {u.email}
                  {!u.emailVerified && " (unconfirmed)"} · last sign-in{" "}
                  {formatDate(u.lastLoginAt)}
                </div>
              </div>
              <div className="row">
                <select
                  aria-label={`Role of ${u.name}`}
                  value={u.role}
                  onChange={(e) =>
                    update.mutate({ id: u.id, role: e.target.value as Role })
                  }
                >
                  <option value="admin">Admin</option>
                  <option value="grader">Grader</option>
                  <option value="viewer">Viewer</option>
                </select>
                {u.id !== me?.id && (
                  <button
                    onClick={() =>
                      update.mutate({ id: u.id, active: !u.active })
                    }
                  >
                    {u.active ? "Disable" : "Enable"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function InviteForm() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("grader");
  const invite = useMutation({
    mutationFn: () => api.post<Invite>("/users/invites", { email, role }),
    onSuccess: () => {
      setEmail("");
      void qc.invalidateQueries({ queryKey: ["invites"] });
    },
  });
  return (
    <Card title="Invite someone">
      <form
        className="grid-3"
        onSubmit={(e) => {
          e.preventDefault();
          invite.mutate();
        }}
      >
        <Field label="Email">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Role" hint={ROLE_HELP[role]}>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="grader">Grader</option>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <div className="field">
          <span className="field-label">&nbsp;</span>
          <button className="primary" disabled={invite.isPending}>
            Send invite
          </button>
        </div>
      </form>
      <ErrorNote error={invite.error} />
      {invite.data?.link && (
        <p className="small">
          Invite sent. If email isn't set up on the server, share this link
          (valid 7 days): <code className="break">{invite.data.link}</code>
        </p>
      )}
    </Card>
  );
}
