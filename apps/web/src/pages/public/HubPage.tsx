import { keepPreviousData, useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Link, useParams, useSearchParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { api } from "../../api/client";
import type { Page } from "../../api/types";
import { Pager, usePage } from "../../components/Pager";
import { ErrorNote, formatDate, Spinner } from "../../components/ui";
import { useLang, useT } from "../../i18n";
import { m } from "./HubPage.i18n";

export const KIND_LABELS = {
  guide: "Guides",
  glossary: "Glossary",
  news: "News",
  case_study: "Case studies",
} as const;
export type Kind = keyof typeof KIND_LABELS;

const KIND_KEYS = {
  guide: "kindGuide",
  glossary: "kindGlossary",
  news: "kindNews",
  case_study: "kindCaseStudy",
} as const;

/** Article kind names in the current language. KIND_LABELS stays English for code that needs it. */
export function useKindLabels(): Record<Kind, string> {
  const t = useT(m);
  return {
    guide: t(KIND_KEYS.guide),
    glossary: t(KIND_KEYS.glossary),
    news: t(KIND_KEYS.news),
    case_study: t(KIND_KEYS.case_study),
  };
}

export interface ArticleItem {
  slug: string;
  kind: Kind;
  title: string;
  summary: string | null;
  publishedAt: string | null;
}

const HUB_PAGE = 24;

export function HubPage() {
  const [params, setParams] = useSearchParams();
  const kind = (params.get("kind") as Kind | null) ?? null;
  const [page, setPage] = usePage();
  const list = useQuery({
    queryKey: ["articles", kind, page],
    placeholderData: keepPreviousData,
    queryFn: () =>
      api.get<Page<ArticleItem>>(
        `/public/articles?${new URLSearchParams({
          limit: String(HUB_PAGE),
          offset: String(page * HUB_PAGE),
          ...(kind && { kind }),
        }).toString()}`,
      ),
  });
  const shown = list.data?.items ?? [];
  const t = useT(m);
  const kinds = useKindLabels();
  const { lang } = useLang();

  return (
    <div className="site-page">
      <section className="hero compact">
        <span className="eyebrow">{t("eyebrow")}</span>
        <h1>{t("title")}</h1>
        {lang !== "en" && <p className="muted small">{t("contentNote")}</p>}
      </section>
      <section className="site-section">
        <div className="segmented" role="tablist">
          <button
            role="tab"
            aria-selected={!kind}
            className={!kind ? "active" : ""}
            onClick={() => setParams({})}
          >
            {t("all")}
          </button>
          {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              className={kind === k ? "active" : ""}
              onClick={() => setParams({ kind: k })}
            >
              {kinds[k]}
            </button>
          ))}
        </div>
        {list.isPending && <Spinner />}
        <ErrorNote error={list.error} />
        {list.data && shown.length === 0 && (
          <p className="muted">{t("empty")}</p>
        )}
        {kind === "glossary" ? (
          <dl className="glossary">
            {shown.map((a) => (
              <div key={a.slug} id={a.slug}>
                <dt>{a.title}</dt>
                <dd>{a.summary}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="feature-grid">
            {shown.map((a) => (
              <Link
                key={a.slug}
                to={`/hub/${a.slug}`}
                className="card article-card"
              >
                <span className="eyebrow">{kinds[a.kind]}</span>
                <strong>{a.title}</strong>
                {a.summary && <span className="muted small">{a.summary}</span>}
              </Link>
            ))}
          </div>
        )}
        {list.data && (
          <Pager
            total={list.data.total}
            limit={HUB_PAGE}
            page={page}
            onPage={setPage}
          />
        )}
      </section>
    </div>
  );
}

export function ArticlePage() {
  const { slug = "" } = useParams();
  const article = useQuery({
    queryKey: ["article", slug],
    queryFn: () =>
      api.get<ArticleItem & { body: string; updatedAt: string }>(
        `/public/articles/${encodeURIComponent(slug)}`,
      ),
  });
  const a = article.data;
  const t = useT(m);
  const kinds = useKindLabels();
  return (
    <div className="site-page">
      <section className="site-section narrow">
        <Link to="/hub" className="muted small">
          {t("back")}
        </Link>
        {article.isPending && <Spinner />}
        <ErrorNote error={article.error} />
        {a && (
          <article className="article">
            <span className="eyebrow">{kinds[a.kind]}</span>
            <h1>{a.title}</h1>
            {a.summary && <p className="hero-lead">{a.summary}</p>}
            {/* Markdown without raw HTML: article text can't inject markup or scripts. */}
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{a.body}</ReactMarkdown>
            <p className="muted small">
              {t("updated", { date: formatDate(a.updatedAt) })}
            </p>
          </article>
        )}
      </section>
    </div>
  );
}
