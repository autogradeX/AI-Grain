import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useLang } from "../i18n";
import { pageMeta, type ArticleInfo, type SiteInfo } from "./meta";

function setTag(
  selector: string,
  create: () => HTMLElement,
  value: string | null,
) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (value === null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(el.tagName === "LINK" ? "href" : "content", value);
}

/**
 * Keeps the title, description, canonical and robots tags in step as the
 * visitor moves between public pages (the server set them for the first one).
 */
export function HeadSync() {
  const { pathname, search } = useLocation();
  const { lang } = useLang();
  const slug = /^\/hub\/([^/]+)$/.exec(pathname)?.[1] ?? "";
  // Read from the cache only: the pages themselves fetch this data.
  const site = useQuery<SiteInfo>({
    queryKey: ["public-site"],
    enabled: false,
  });
  const article = useQuery<ArticleInfo>({
    queryKey: ["article", decodeURIComponent(slug)],
    enabled: false,
  });
  useEffect(() => {
    const meta = pageMeta({
      path: pathname,
      search,
      origin: location.origin,
      lang,
      site: site.data ?? null,
      article: article.data ?? null,
      notFound: false,
    });
    document.title = meta.title;
    setTag(
      'meta[name="description"]',
      () =>
        Object.assign(document.createElement("meta"), { name: "description" }),
      meta.description,
    );
    setTag(
      'meta[name="robots"]',
      () => Object.assign(document.createElement("meta"), { name: "robots" }),
      meta.robots,
    );
    setTag(
      'link[rel="canonical"]',
      () => Object.assign(document.createElement("link"), { rel: "canonical" }),
      meta.canonical && location.origin + meta.canonical,
    );
  }, [pathname, search, lang, site.data, article.data]);
  return null;
}
