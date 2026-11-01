import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { Invite, Page, Role, UserRow } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Pager, useDebounced, usePage } from "../components/Pager";
import {
  Badge,
  Card,
  ErrorNote,
  Field,
  formatDate,
  Spinner,
} from "../components/ui";
import { useT } from "../i18n";
import { common } from "../i18n/common";
import { m } from "./UsersPage.i18n";

const ROLE_HELP = {
  admin: "helpAdmin",
  grader: "helpGrader",
  viewer: "helpViewer",
} as const satisfies Record<Role, keyof typeof m>;

const ROLE_NAME = {
  admin: "roleAdmin",
  grader: "roleGrader",
  viewer: "roleViewer",
} as const satisfies Record<Role, keyof typeof common>;

const USERS_PAGE = 25;

export function UsersPage() {
  const { user: me } = useAuth();
  const t = useT(m);
  const tc = useT(common);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());
  const [page, setPage] = usePage();
  const users = useQuery({
    queryKey: ["users", term, page],
    placeholderData: keepPreviousData,
    queryFn: () =>
      api.get<Page<UserRow>>(
        `/users?${new URLSearchParams({
          limit: String(USERS_PAGE),
          offset: String(page * USERS_PAGE),
          ...(term && { search: term }),
        }).toString()}`,
      ),
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
      <h1>{t("users")}</h1>
      <InviteForm />
      <Card title={t("pendingInvites")}>
        <ErrorNote error={invites.error ?? revoke.error} />
        {invites.data?.length === 0 && <p className="muted">{t("none")}</p>}
        <ul className="list">
          {invites.data?.map((i) => (
            <li key={i.id} className="list-item">
              <span>
                {i.email} · {tc(ROLE_NAME[i.role])}
                <div className="muted small">
                  {t("expires", { date: formatDate(i.expiresAt) })}
                </div>
              </span>
              <button className="link" onClick={() => revoke.mutate(i.id)}>
                {t("revoke")}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={t("members")}>
        {users.isPending && <Spinner />}
        <ErrorNote error={users.error ?? update.error} />
        <input
          type="search"
          placeholder={t("searchMembers")}
          aria-label={t("searchMembers")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <ul className={users.isPlaceholderData ? "list refetching" : "list"}>
          {users.data?.items.map((u) => (
            <li key={u.id} className="list-item wrap">
              <div>
                <strong>{u.name}</strong>{" "}
                {u.id === me?.id && <Badge>{t("you")}</Badge>}{" "}
                {!u.active && <Badge tone="bad">{t("disabled")}</Badge>}
                <div className="muted small">
                  {u.email}
                  {me?.emailEnabled &&
                    !u.emailVerified &&
                    t("unconfirmed")} ·{" "}
                  {t("lastSignIn", { date: formatDate(u.lastLoginAt) })}
                </div>
              </div>
              <div className="row">
                <select
                  aria-label={t("roleOf", { name: u.name })}
                  value={u.role}
                  onChange={(e) =>
                    update.mutate({ id: u.id, role: e.target.value as Role })
                  }
                >
                  <option value="admin">{tc("roleAdmin")}</option>
                  <option value="grader">{tc("roleGrader")}</option>
                  <option value="viewer">{tc("roleViewer")}</option>
                </select>
                {u.id !== me?.id && (
                  <button
                    onClick={() =>
                      update.mutate({ id: u.id, active: !u.active })
                    }
                  >
                    {u.active ? t("disable") : t("enable")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {users.data && (
          <Pager
            total={users.data.total}
            limit={USERS_PAGE}
            page={page}
            onPage={setPage}
          />
        )}
      </Card>
    </div>
  );
}

function InviteForm() {
  const qc = useQueryClient();
  const t = useT(m);
  const tc = useT(common);
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
    <Card title={t("inviteSomeone")}>
      <form
        className="grid-3"
        onSubmit={(e) => {
          e.preventDefault();
          invite.mutate();
        }}
      >
        <Field label={t("email")}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t("role")} hint={t(ROLE_HELP[role])}>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="grader">{tc("roleGrader")}</option>
            <option value="viewer">{tc("roleViewer")}</option>
            <option value="admin">{tc("roleAdmin")}</option>
          </select>
        </Field>
        <div className="field">
          <span className="field-label">&nbsp;</span>
          <button className="primary" disabled={invite.isPending}>
            {t("sendInvite")}
          </button>
        </div>
      </form>
      <ErrorNote error={invite.error} />
      {invite.data?.link && (
        <p className="small">
          {t.rich("inviteSent", {
            link: <code className="break">{invite.data.link}</code>,
          })}
        </p>
      )}
    </Card>
  );
}
