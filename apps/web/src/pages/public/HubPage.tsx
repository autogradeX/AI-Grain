import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Link, useParams, useSearchParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { api } from "../../api/client";
import { ErrorNote, formatDate, Spinner } from "../../components/ui";

export const KIND_LABELS = {
  guide: "Guides",
  glossary: "Glossary",
  news: "News",
  case_study: "Case studies",
} as const;
export type Kind = keyof typeof KIND_LABELS;

export interface ArticleItem {
  slug: string;
  kind: Kind;
  title: string;
  summary: string | null;
  publishedAt: string | null;
}

export function HubPage() {
  const [params, setParams] = useSearchParams();
  const kind = (params.get("kind") as Kind | null) ?? null;
  const list = useQuery({
    queryKey: ["articles", kind],
    queryFn: () =>
      api.get<ArticleItem[]>(`/public/articles${kind ? `?kind=${kind}` : ""}`),
  });
  const shown = list.data ?? [];

  return (
    <div className="site-page">
      <section className="hero compact">
        <span className="eyebrow">Knowledge hub</span>
        <h1>Guides and glossary for grain screening</h1>
      </section>
      <section className="site-section">
        <div className="segmented" role="tablist">
          <button
            role="tab"
            aria-selected={!kind}
            className={!kind ? "active" : ""}
            onClick={() => setParams({})}
          >
            All
          </button>
          {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              className={kind === k ? "active" : ""}
              onClick={() => setParams({ kind: k })}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        {list.isPending && <Spinner />}
        <ErrorNote error={list.error} />
        {list.data && shown.length === 0 && (
          <p className="muted">Nothing here yet.</p>
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
                <span className="eyebrow">{KIND_LABELS[a.kind]}</span>
                <strong>{a.title}</strong>
                {a.summary && <span className="muted small">{a.summary}</span>}
              </Link>
            ))}
          </div>
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
  return (
    <div className="site-page">
      <section className="site-section narrow">
        <Link to="/hub" className="muted small">
          ← Knowledge hub
        </Link>
        {article.isPending && <Spinner />}
        <ErrorNote error={article.error} />
        {a && (
          <article className="article">
            <span className="eyebrow">{KIND_LABELS[a.kind]}</span>
            <h1>{a.title}</h1>
            {a.summary && <p className="hero-lead">{a.summary}</p>}
            {/* Markdown without raw HTML: article text can't inject markup or scripts. */}
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{a.body}</ReactMarkdown>
            <p className="muted small">Updated {formatDate(a.updatedAt)}</p>
          </article>
        )}
      </section>
    </div>
  );
}
