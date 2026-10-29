import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { api } from "../api/client";
import type { Org } from "../api/types";
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
import { m } from "./WebsitePage.i18n";

interface SiteSettings {
  bookingUrl?: string;
  contactEmail?: string;
  phone?: string;
  address?: string;
}

interface Lead {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  message: string;
  status: "new" | "contacted" | "closed";
  createdAt: string;
}

const KINDS = ["guide", "glossary", "news", "case_study"] as const;
type Kind = (typeof KINDS)[number];

interface Article {
  id: string;
  slug: string;
  kind: Kind;
  title: string;
  summary: string | null;
  body: string;
  published: boolean;
  publishedAt: string | null;
  updatedAt: string;
}

type Tab = "leads" | "articles" | "settings";

/** Admin page for the public website: enquiries, knowledge-hub articles and contact details. */
export function WebsitePage() {
  const org = useQuery({
    queryKey: ["org"],
    queryFn: () => api.get<Org>("/org"),
  });
  const [tab, setTab] = useState<Tab>("leads");
  const t = useT(m);
  if (org.isPending) return <Spinner />;
  if (!org.data?.isSiteOwner) {
    return (
      <div className="stack">
        <h1>{t("website")}</h1>
        <ErrorNote error={org.error} />
        <p className="muted">{t("notOwner")}</p>
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{t("website")}</h1>
          <div className="muted small">
            {t.rich("intro", {
              link: <Link to="/">{t("publicSite")}</Link>,
            })}
          </div>
        </div>
      </div>
      <div className="segmented" role="tablist">
        {(
          [
            ["leads", t("enquiries")],
            ["articles", t("articles")],
            ["settings", t("contactDetails")],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "leads" && <Leads />}
      {tab === "articles" && <Articles />}
      {tab === "settings" && <Settings />}
    </div>
  );
}

const LEAD_TONE = {
  new: "info",
  contacted: "warn",
  closed: "neutral",
} as const;

function Leads() {
  const qc = useQueryClient();
  const t = useT(m);
  const leads = useQuery({
    queryKey: ["site-leads"],
    queryFn: () => api.get<Lead[]>("/site/leads"),
  });
  const update = useMutation({
    mutationFn: (d: { id: string; status: Lead["status"] }) =>
      api.patch(`/site/leads/${d.id}`, { status: d.status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["site-leads"] }),
  });
  if (leads.isPending) return <Spinner />;
  if (leads.error) return <ErrorNote error={leads.error} />;
  if (!leads.data.length) return <p className="muted">{t("noEnquiries")}</p>;
  return (
    <div className="stack-sm">
      <ErrorNote error={update.error} />
      {leads.data.map((l) => (
        <Card
          key={l.id}
          title={
            <>
              {l.name}{" "}
              {l.company && <span className="muted small">· {l.company}</span>}
            </>
          }
          actions={
            <Badge tone={LEAD_TONE[l.status]}>{t(`status_${l.status}`)}</Badge>
          }
        >
          <div className="small muted">
            <a href={`mailto:${l.email}`}>{l.email}</a>
            {l.phone && (
              <>
                {" · "}
                <a href={`tel:${l.phone.replace(/\s/g, "")}`}>{l.phone}</a>
              </>
            )}{" "}
            · {formatDate(l.createdAt)}
          </div>
          <p style={{ whiteSpace: "pre-wrap" }}>{l.message}</p>
          <div className="row wrap">
            {(["new", "contacted", "closed"] as const)
              .filter((s) => s !== l.status)
              .map((s) => (
                <button
                  key={s}
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: l.id, status: s })}
                >
                  {t(`mark_${s}`)}
                </button>
              ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

const EMPTY: Omit<Article, "id" | "publishedAt" | "updatedAt"> = {
  slug: "",
  kind: "guide",
  title: "",
  summary: "",
  body: "",
  published: false,
};

function slugify(title: string) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function Articles() {
  const t = useT(m);
  const articles = useQuery({
    queryKey: ["site-articles"],
    queryFn: () => api.get<Article[]>("/site/articles"),
  });
  const [editing, setEditing] = useState<Article | "new" | null>(null);
  if (editing)
    return (
      <ArticleEditor
        article={editing === "new" ? null : editing}
        onDone={() => setEditing(null)}
      />
    );
  if (articles.isPending) return <Spinner />;
  if (articles.error) return <ErrorNote error={articles.error} />;
  return (
    <div className="stack-sm">
      <div>
        <button className="primary" onClick={() => setEditing("new")}>
          {t("newArticle")}
        </button>
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>{t("title")}</th>
              <th>{t("kind")}</th>
              <th>{t("status")}</th>
              <th>{t("updated")}</th>
            </tr>
          </thead>
          <tbody>
            {articles.data.map((a) => (
              <tr key={a.id}>
                <td>
                  <button className="link" onClick={() => setEditing(a)}>
                    {a.title}
                  </button>
                </td>
                <td>{t(`kind_${a.kind}`)}</td>
                <td>
                  {a.published ? (
                    <Badge tone="good">{t("published")}</Badge>
                  ) : (
                    <Badge>{t("draft")}</Badge>
                  )}
                </td>
                <td className="small muted">{formatDate(a.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ArticleEditor({
  article,
  onDone,
}: {
  article: Article | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const t = useT(m);
  const tc = useT(common);
  const [form, setForm] = useState(() =>
    article ? { ...article, summary: article.summary ?? "" } : EMPTY,
  );
  const [slugTouched, setSlugTouched] = useState(!!article);
  const [preview, setPreview] = useState(false);
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["site-articles"] });
    void qc.invalidateQueries({ queryKey: ["articles"] });
    onDone();
  };
  const save = useMutation({
    mutationFn: () => {
      const body = {
        slug: form.slug,
        kind: form.kind,
        title: form.title,
        summary: form.summary || null,
        body: form.body,
        published: form.published,
      };
      return article
        ? api.put(`/site/articles/${article.id}`, body)
        : api.post("/site/articles", body);
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/site/articles/${article!.id}`),
    onSuccess: done,
  });
  return (
    <Card
      title={
        article ? t("editArticle", { title: article.title }) : t("newArticle")
      }
    >
      <div className="grid-2">
        <Field label={t("title")}>
          <input
            value={form.title}
            maxLength={200}
            onChange={(e) =>
              setForm({
                ...form,
                title: e.target.value,
                slug: slugTouched ? form.slug : slugify(e.target.value),
              })
            }
          />
        </Field>
        <Field label={t("address")} hint={`/hub/${form.slug || "…"}`}>
          <input
            value={form.slug}
            maxLength={80}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            onChange={(e) => {
              setSlugTouched(true);
              setForm({ ...form, slug: e.target.value });
            }}
          />
        </Field>
        <Field label={t("kind")}>
          <select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kind_${k}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("summary")} hint={t("summaryHint")}>
          <input
            value={form.summary ?? ""}
            maxLength={500}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
        </Field>
      </div>
      <div className="segmented">
        <button
          className={!preview ? "active" : ""}
          onClick={() => setPreview(false)}
        >
          {t("write")}
        </button>
        <button
          className={preview ? "active" : ""}
          onClick={() => setPreview(true)}
        >
          {t("preview")}
        </button>
      </div>
      {preview ? (
        <div className="article">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {form.body || t("nothingToPreview")}
          </ReactMarkdown>
        </div>
      ) : (
        <Field label={t("body")} hint={t("bodyHint")}>
          <textarea
            rows={16}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
        </Field>
      )}
      <label className="row small">
        <input
          type="checkbox"
          checked={form.published}
          onChange={(e) => setForm({ ...form, published: e.target.checked })}
        />
        {t("publishedOnHub")}
      </label>
      <ErrorNote error={save.error ?? remove.error} />
      <div className="row wrap">
        <button onClick={onDone}>{tc("cancel")}</button>
        <button
          className="primary"
          disabled={save.isPending || !form.title.trim() || !form.slug}
          onClick={() => save.mutate()}
        >
          {tc("save")}
        </button>
        {article && (
          <button
            className="danger"
            disabled={remove.isPending}
            onClick={() =>
              confirm(t("confirmDelete", { title: article.title })) &&
              remove.mutate()
            }
          >
            {tc("delete")}
          </button>
        )}
      </div>
    </Card>
  );
}

function Settings() {
  const qc = useQueryClient();
  const t = useT(m);
  const tc = useT(common);
  const settings = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => api.get<SiteSettings>("/site/settings"),
  });
  const [form, setForm] = useState<SiteSettings | null>(null);
  const save = useMutation({
    mutationFn: (body: SiteSettings) =>
      api.put<SiteSettings>("/site/settings", body),
    onSuccess: () => {
      setForm(null);
      void qc.invalidateQueries({ queryKey: ["site-settings"] });
      void qc.invalidateQueries({ queryKey: ["public-site"] });
    },
  });
  if (settings.isPending) return <Spinner />;
  if (settings.error) return <ErrorNote error={settings.error} />;
  const f = form ?? settings.data;
  const field = (key: keyof SiteSettings) => ({
    value: f[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...f, [key]: e.target.value }),
  });
  return (
    <Card title={t("contactDetails")}>
      <p className="muted small">{t("contactIntro")}</p>
      <div className="grid-2">
        <Field label={t("contactEmail")}>
          <input type="email" {...field("contactEmail")} />
        </Field>
        <Field label={t("phone")}>
          <input type="tel" {...field("phone")} />
        </Field>
        <Field label={t("postalAddress")}>
          <input {...field("address")} />
        </Field>
        <Field label={t("bookingLink")} hint={t("bookingHint")}>
          <input type="url" {...field("bookingUrl")} />
        </Field>
      </div>
      <ErrorNote error={save.error} />
      <div className="row">
        <button
          className="primary"
          disabled={!form || save.isPending}
          onClick={() => save.mutate(f)}
        >
          {tc("save")}
        </button>
      </div>
    </Card>
  );
}
