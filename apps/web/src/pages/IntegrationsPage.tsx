import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudUpload, KeyRound, Landmark, Server, Webhook } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";
import {
  Badge,
  Card,
  ErrorNote,
  Field,
  formatDate,
  Spinner,
} from "../components/ui";
import { useT } from "../i18n";
import { m } from "./IntegrationsPage.i18n";

interface Integration {
  keys: {
    id: string;
    name: string;
    scope: "read" | "station";
    prefix: string;
    createdAt: string;
    lastUsedAt: string | null;
  }[];
  webhookUrl: string | null;
  webhookSecret: string | null;
  centralUrl: string | null;
  centralKeySet: boolean;
  enamUrl: string | null;
  enamHeaderName: string | null;
  enamHeaderValueSet: boolean;
  outbox: OutboxStatus;
  schema: string;
}

interface OutboxStatus {
  waiting: number;
  failing: number;
  oldestWaiting: string | null;
  sentLastDay: number;
  lastSentAt: string | null;
  recent: {
    id: string;
    target: "webhook" | "central" | "enam";
    event: string;
    attempts: number;
    lastError: string | null;
    nextAttemptAt: string;
    deliveredAt: string | null;
    createdAt: string;
    sampleNumber: number | null;
  }[];
}

/** A station's central server: results and certificates go there when online. */
function CentralCard({ data }: { data: Integration }) {
  const t = useT(m);
  const qc = useQueryClient();
  const [url, setUrl] = useState(data.centralUrl ?? "");
  const [key, setKey] = useState("");
  const save = useMutation({
    mutationFn: (body: { url: string | null; key?: string }) =>
      api.put("/integration/central", body),
    onSuccess: () => {
      setKey("");
      void qc.invalidateQueries({ queryKey: ["integration"] });
    },
  });
  const test = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; status: number | null; error?: string }>(
        "/integration/central/test",
      ),
  });
  return (
    <Card
      title={
        <span className="row">
          <Server size={18} aria-hidden /> {t("central")}
        </span>
      }
    >
      <p className="muted small">{t("centralHint")}</p>
      <form
        className="stack-sm"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({
            url: url.trim() || null,
            ...(key.trim() && { key: key.trim() }),
          });
        }}
      >
        <div className="grid-2">
          <Field label={t("centralUrl")}>
            <input
              type="url"
              placeholder="https://grain.example.org"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
          <Field
            label={t("centralKey")}
            hint={data.centralKeySet ? t("centralKeySet") : t("centralKeyHint")}
          >
            <input
              className="mono"
              placeholder="agk_…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </Field>
        </div>
        <ErrorNote error={save.error ?? test.error} />
        {test.data && (
          <p className={test.data.ok ? "good small" : "error small"}>
            {test.data.ok
              ? t("centralOk")
              : t("testFailed", {
                  reason: test.data.error ?? `HTTP ${test.data.status}`,
                })}
          </p>
        )}
        <div className="row wrap">
          <button className="primary" disabled={save.isPending}>
            {t("saveCentral")}
          </button>
          {data.centralUrl && (
            <>
              <button
                type="button"
                disabled={test.isPending}
                onClick={() => test.mutate()}
              >
                {t("test")}
              </button>
              <button
                type="button"
                className="danger"
                disabled={save.isPending}
                onClick={() => {
                  setUrl("");
                  save.mutate({ url: null });
                }}
              >
                {t("removeWebhook")}
              </button>
            </>
          )}
        </div>
      </form>
    </Card>
  );
}

/** The e-NAM connection: results of samples with an e-NAM lot ID go there. */
function EnamCard({ data }: { data: Integration }) {
  const t = useT(m);
  const qc = useQueryClient();
  const [url, setUrl] = useState(data.enamUrl ?? "");
  const [headerName, setHeaderName] = useState(
    data.enamHeaderName ?? "Authorization",
  );
  const [value, setValue] = useState("");
  const save = useMutation({
    mutationFn: (body: {
      url: string | null;
      headerName?: string;
      headerValue?: string;
    }) => api.put("/integration/enam", body),
    onSuccess: () => {
      setValue("");
      void qc.invalidateQueries({ queryKey: ["integration"] });
    },
  });
  const test = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; status: number | null; error?: string }>(
        "/integration/enam/test",
      ),
  });
  return (
    <Card
      title={
        <span className="row">
          <Landmark size={18} aria-hidden /> {t("enam")}
        </span>
      }
    >
      <p className="muted small">{t("enamHint")}</p>
      <form
        className="stack-sm"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({
            url: url.trim() || null,
            headerName: headerName.trim() || "Authorization",
            ...(value.trim() && { headerValue: value.trim() }),
          });
        }}
      >
        <div className="grid-3">
          <Field label={t("enamUrl")}>
            <input
              type="url"
              placeholder="https://enam-bridge.example.gov.in/assaying"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
          <Field label={t("enamHeaderName")}>
            <input
              className="mono"
              value={headerName}
              onChange={(e) => setHeaderName(e.target.value)}
            />
          </Field>
          <Field
            label={t("enamHeaderValue")}
            hint={
              data.enamHeaderValueSet
                ? t("enamHeaderValueSet")
                : t("enamHeaderValueHint")
            }
          >
            <input
              className="mono"
              type="password"
              autoComplete="off"
              placeholder="Bearer …"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
        </div>
        <ErrorNote error={save.error ?? test.error} />
        {test.data && (
          <p className={test.data.ok ? "good small" : "error small"}>
            {test.data.ok
              ? t("enamOk")
              : t("testFailed", {
                  reason: test.data.error ?? `HTTP ${test.data.status}`,
                })}
          </p>
        )}
        <div className="row wrap">
          <button className="primary" disabled={save.isPending}>
            {t("saveEnam")}
          </button>
          {data.enamUrl && (
            <>
              <button
                type="button"
                disabled={test.isPending}
                onClick={() => test.mutate()}
              >
                {t("test")}
              </button>
              <button
                type="button"
                className="danger"
                disabled={save.isPending}
                onClick={() => {
                  setUrl("");
                  save.mutate({ url: null });
                }}
              >
                {t("removeWebhook")}
              </button>
            </>
          )}
        </div>
      </form>
    </Card>
  );
}

/** Results waiting to go out, and what went out lately. */
function OutboxCard({ data }: { data: Integration }) {
  const t = useT(m);
  const qc = useQueryClient();
  const send = useMutation({
    mutationFn: () => api.post("/integration/outbox/send"),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["integration"] }),
  });
  const o = data.outbox;
  if (
    !data.webhookUrl &&
    !data.centralUrl &&
    !data.enamUrl &&
    o.recent.length === 0
  )
    return null;
  return (
    <Card
      title={
        <span className="row">
          <CloudUpload size={18} aria-hidden /> {t("outbox")}
        </span>
      }
      actions={
        o.waiting > 0 && (
          <button disabled={send.isPending} onClick={() => send.mutate()}>
            {t("sendNow")}
          </button>
        )
      }
    >
      <p className="small">
        {o.waiting > 0 ? t.n("waiting", o.waiting) : t("allSent")}{" "}
        <span className="muted">
          {o.lastSentAt
            ? t("lastSent", {
                date: formatDate(o.lastSentAt),
                count: o.sentLastDay,
              })
            : t("neverSent")}
        </span>
      </p>
      <ErrorNote error={send.error} />
      {o.recent.length > 0 && (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t("what")}</th>
                <th>{t("to")}</th>
                <th>{t("state")}</th>
              </tr>
            </thead>
            <tbody>
              {o.recent.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.sampleNumber !== null ? `#${r.sampleNumber} · ` : ""}
                    {r.event}
                  </td>
                  <td>
                    {r.target === "central"
                      ? t("central")
                      : r.target === "enam"
                        ? t("enam")
                        : t("webhook")}
                  </td>
                  <td>
                    {r.deliveredAt ? (
                      <Badge tone="good">
                        {t("sentAt", { date: formatDate(r.deliveredAt) })}
                      </Badge>
                    ) : (
                      <span className="small">
                        <Badge tone={r.attempts ? "warn" : "info"}>
                          {t("queued")}
                        </Badge>{" "}
                        {r.lastError && (
                          <span className="muted">
                            {t("retry", {
                              date: formatDate(r.nextAttemptAt),
                              error: r.lastError,
                            })}
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function WebhookCard({ data }: { data: Integration }) {
  const t = useT(m);
  const qc = useQueryClient();
  const [url, setUrl] = useState(data.webhookUrl ?? "");
  const save = useMutation({
    mutationFn: (body: { url: string | null; rotateSecret?: boolean }) =>
      api.put("/integration/webhook", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["integration"] }),
  });
  const test = useMutation({
    mutationFn: () =>
      api.post<{ delivered: boolean; status: number | null; error?: string }>(
        "/integration/webhook/test",
      ),
  });
  return (
    <Card
      title={
        <span className="row">
          <Webhook size={18} aria-hidden /> {t("webhook")}
        </span>
      }
    >
      <p className="muted small">{t("webhookHint")}</p>
      <form
        className="stack-sm"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ url: url.trim() || null });
        }}
      >
        <Field label={t("url")}>
          <input
            type="url"
            placeholder="https://erp.example.org/hooks/assaying"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        {data.webhookSecret && (
          <Field label={t("secret")}>
            <input readOnly className="mono" value={data.webhookSecret} />
          </Field>
        )}
        <ErrorNote error={save.error ?? test.error} />
        {test.data && (
          <p className={test.data.delivered ? "good small" : "error small"}>
            {test.data.delivered
              ? t("testOk", { status: test.data.status ?? "" })
              : t("testFailed", {
                  reason: test.data.error ?? `HTTP ${test.data.status}`,
                })}
          </p>
        )}
        <div className="row wrap">
          <button className="primary" disabled={save.isPending}>
            {t("saveWebhook")}
          </button>
          {data.webhookUrl && (
            <>
              <button
                type="button"
                disabled={test.isPending}
                onClick={() => test.mutate()}
              >
                {t("test")}
              </button>
              <button
                type="button"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({ url: data.webhookUrl, rotateSecret: true })
                }
              >
                {t("rotate")}
              </button>
              <button
                type="button"
                className="danger"
                disabled={save.isPending}
                onClick={() => {
                  setUrl("");
                  save.mutate({ url: null });
                }}
              >
                {t("removeWebhook")}
              </button>
            </>
          )}
        </div>
      </form>
    </Card>
  );
}

function KeysCard({ data }: { data: Integration }) {
  const t = useT(m);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "station">("read");
  const create = useMutation({
    mutationFn: () =>
      api.post<{ key: string }>("/integration/keys", {
        name: name.trim(),
        scope,
      }),
    onSuccess: () => {
      setName("");
      void qc.invalidateQueries({ queryKey: ["integration"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/integration/keys/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["integration"] }),
  });
  return (
    <Card
      title={
        <span className="row">
          <KeyRound size={18} aria-hidden /> {t("keys")}
        </span>
      }
    >
      <p className="muted small">{t("keysHint")}</p>
      {create.data && (
        <div className="suggestion small">
          <span>
            <strong>{t("newKey")}</strong>
            <br />
            <code className="mono">{create.data.key}</code>
          </span>
        </div>
      )}
      {data.keys.length === 0 ? (
        <p className="muted small">{t("noKeys")}</p>
      ) : (
        <ul className="list">
          {data.keys.map((k) => (
            <li key={k.id} className="list-item">
              <div>
                <strong>{k.name}</strong>{" "}
                <Badge>
                  {k.scope === "station" ? t("scopeStation") : t("scopeRead")}
                </Badge>{" "}
                <span className="muted small mono">{k.prefix}…</span>
                <div className="muted small">
                  {k.lastUsedAt
                    ? t("lastUsed", { date: formatDate(k.lastUsedAt) })
                    : t("neverUsed")}
                </div>
              </div>
              <button
                className="danger"
                disabled={revoke.isPending}
                onClick={() =>
                  confirm(t("confirmRevoke", { name: k.name })) &&
                  revoke.mutate(k.id)
                }
              >
                {t("revoke")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="row wrap"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input
          required
          maxLength={80}
          placeholder={t("keyName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <select
          aria-label={t("scope")}
          value={scope}
          onChange={(e) => setScope(e.target.value as "read" | "station")}
          style={{ maxWidth: 260 }}
        >
          <option value="read">{t("scopeRead")}</option>
          <option value="station">{t("scopeStation")}</option>
        </select>
        <button className="primary" disabled={create.isPending || !name.trim()}>
          {t("createKey")}
        </button>
      </form>
      <ErrorNote error={create.error ?? revoke.error} />
    </Card>
  );
}

/** Admins connect APMC, eNAM bridge and ERP systems: webhook and API keys. */
export function IntegrationsPage() {
  const t = useT(m);
  const data = useQuery({
    queryKey: ["integration"],
    queryFn: () => api.get<Integration>("/integration"),
  });
  return (
    <div className="stack">
      <h1>{t("title")}</h1>
      <p className="muted small">{t("intro")}</p>
      {data.isPending && <Spinner />}
      <ErrorNote error={data.error} />
      {data.data && (
        <>
          <OutboxCard data={data.data} />
          <EnamCard key={data.data.enamUrl ?? ""} data={data.data} />
          <CentralCard key={data.data.centralUrl ?? ""} data={data.data} />
          <WebhookCard key={data.data.webhookUrl ?? ""} data={data.data} />
          <KeysCard data={data.data} />
          <Card title={t("format")}>
            <p className="muted small">
              {t("formatHint", { schema: data.data.schema })}
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
