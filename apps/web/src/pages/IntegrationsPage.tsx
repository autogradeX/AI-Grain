import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Webhook } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";
import { Card, ErrorNote, Field, formatDate, Spinner } from "../components/ui";
import { useT } from "../i18n";
import { m } from "./IntegrationsPage.i18n";

interface Integration {
  keys: {
    id: string;
    name: string;
    prefix: string;
    createdAt: string;
    lastUsedAt: string | null;
  }[];
  webhookUrl: string | null;
  webhookSecret: string | null;
  schema: string;
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
  const create = useMutation({
    mutationFn: () =>
      api.post<{ key: string }>("/integration/keys", { name: name.trim() }),
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
