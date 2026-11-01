import type { Lang } from "../i18n";
import { m } from "./seo.i18n";

/*
 * What search engines, AI answer engines and link previews read about each
 * public page: title, description, canonical URL, robots rule and Schema.org
 * data. The server writes it into the HTML; the browser keeps the title in
 * step on client-side navigation.
 */

export interface SiteInfo {
  name: string;
  bookingUrl: string | null;
  contactEmail: string | null;
  phone: string | null;
  address: string | null;
}

export interface ArticleInfo {
  slug: string;
  kind: "guide" | "glossary" | "news" | "case_study";
  title: string;
  summary: string | null;
  body: string;
  publishedAt: string | null;
  updatedAt: string;
}

export interface PageMeta {
  title: string;
  description: string;
  /** Path and query of the canonical URL; null for pages not to index. */
  canonical: string | null;
  robots: "index,follow" | "noindex,follow";
  ogType: "website" | "article";
  jsonLd: Record<string, unknown>[];
}

const text = (key: keyof typeof m, lang: Lang) => m[key][lang];

/** Plain text from Markdown, for descriptions. */
function plain(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(s: string, max = 158): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,.;:]$/, "")}…`;
}

function organization(origin: string, site: SiteInfo | null) {
  return {
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: site?.name ?? "AI-Grain",
    url: `${origin}/`,
    logo: `${origin}/icons/icon-512.png`,
    ...(site?.address && { address: site.address }),
    ...((site?.contactEmail || site?.phone) && {
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "sales",
        ...(site.contactEmail && { email: site.contactEmail }),
        ...(site.phone && { telephone: site.phone }),
      },
    }),
  };
}

export interface MetaInput {
  path: string;
  search: string;
  origin: string;
  lang: Lang;
  site: SiteInfo | null;
  article: ArticleInfo | null;
  notFound: boolean;
}

export function pageMeta(input: MetaInput): PageMeta {
  const { path, origin, lang, site, article } = input;
  const params = new URLSearchParams(input.search);
  const base = {
    robots: "index,follow" as const,
    ogType: "website" as const,
    jsonLd: [] as Record<string, unknown>[],
  };
  const hidden = (title: string): PageMeta => ({
    ...base,
    title,
    description: text("homeDescription", lang),
    canonical: null,
    robots: "noindex,follow",
  });

  if (input.notFound) return hidden(text("notFoundTitle", lang));

  if (path === "/") {
    return {
      ...base,
      title: text("homeTitle", lang),
      description: text("homeDescription", lang),
      canonical: "/",
      jsonLd: [
        organization(origin, site),
        {
          "@type": "WebSite",
          "@id": `${origin}/#website`,
          name: "AI-Grain",
          url: `${origin}/`,
          inLanguage: ["en", "hi"],
          publisher: { "@id": `${origin}/#organization` },
        },
        {
          "@type": "SoftwareApplication",
          name: "AI-Grain",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web, Android, iOS",
          url: `${origin}/`,
          description: text("softwareDescription", lang),
          publisher: { "@id": `${origin}/#organization` },
        },
      ],
    };
  }
  if (path === "/demo")
    return {
      ...base,
      title: text("demoTitle", lang),
      description: text("demoDescription", lang),
      canonical: "/demo",
    };
  if (path === "/roi")
    return {
      ...base,
      title: text("roiTitle", lang),
      description: text("roiDescription", lang),
      canonical: "/roi",
    };
  if (path === "/contact")
    return {
      ...base,
      title: text("contactTitle", lang),
      description: text("contactDescription", lang),
      canonical: "/contact",
    };
  if (path === "/hub") {
    // A filtered or later page is its own page: canonical to itself.
    const query = new URLSearchParams();
    const kind = params.get("kind");
    const page = Number(params.get("page")) || 1;
    if (kind) query.set("kind", kind);
    if (page > 1) query.set("page", String(page));
    const qs = query.toString();
    return {
      ...base,
      title:
        kind === "glossary"
          ? text("glossaryTitle", lang)
          : text("hubTitle", lang),
      description: text("hubDescription", lang),
      canonical: `/hub${qs ? `?${qs}` : ""}`,
    };
  }
  if (path.startsWith("/hub/") && article) {
    const url = `${origin}/hub/${article.slug}`;
    const description = clip(article.summary ?? plain(article.body));
    const breadcrumbs = {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: text("home", lang),
          item: `${origin}/`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: text("hub", lang),
          item: `${origin}/hub`,
        },
        { "@type": "ListItem", position: 3, name: article.title, item: url },
      ],
    };
    const main =
      article.kind === "glossary"
        ? {
            "@type": "DefinedTerm",
            name: article.title,
            description,
            url,
            inDefinedTermSet: {
              "@type": "DefinedTermSet",
              name: "Grain quality glossary",
              url: `${origin}/hub?kind=glossary`,
            },
          }
        : {
            "@type": article.kind === "news" ? "NewsArticle" : "Article",
            headline: article.title,
            description,
            url,
            mainEntityOfPage: url,
            ...(article.publishedAt && { datePublished: article.publishedAt }),
            dateModified: article.updatedAt,
            inLanguage: "en",
            author: { "@id": `${origin}/#organization` },
            publisher: organization(origin, site),
            image: `${origin}/og-image.jpg`,
          };
    return {
      ...base,
      title: text("articleSuffix", lang).replace("{title}", article.title),
      description,
      canonical: `/hub/${article.slug}`,
      ogType: article.kind === "glossary" ? "website" : "article",
      jsonLd: [main, breadcrumbs],
    };
  }
  if (path === "/verify")
    return {
      ...base,
      title: text("verifyTitle", lang),
      description: text("verifyDescription", lang),
      canonical: "/verify",
    };
  // A certificate is shared by link, not something to find in search.
  if (path.startsWith("/verify/")) return hidden(text("verifyTitle", lang));
  return hidden(text("appTitle", lang));
}

const escapeAttr = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** JSON for a <script> data block: "</" can't close the element early. */
export const scriptJson = (value: unknown) =>
  JSON.stringify(value).replace(/</g, "\\u003c");

/** The <head> tags for a page (everything but <title>). */
export function headTags(meta: PageMeta, origin: string): string {
  const image = `${origin}/og-image.jpg`;
  const tags = [
    `<meta name="description" content="${escapeAttr(meta.description)}" />`,
    `<meta name="robots" content="${meta.robots}" />`,
    ...(meta.canonical
      ? [
          `<link rel="canonical" href="${escapeAttr(origin + meta.canonical)}" />`,
          `<meta property="og:url" content="${escapeAttr(origin + meta.canonical)}" />`,
        ]
      : []),
    `<meta property="og:site_name" content="AI-Grain" />`,
    `<meta property="og:type" content="${meta.ogType}" />`,
    `<meta property="og:title" content="${escapeAttr(meta.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="AI-Grain: grain impurity analysis" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ];
  if (meta.jsonLd.length) {
    tags.push(
      `<script type="application/ld+json">${scriptJson({
        "@context": "https://schema.org",
        "@graph": meta.jsonLd,
      })}</script>`,
    );
  }
  return tags.join("\n    ");
}

export { escapeAttr };
