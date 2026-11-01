import {
  dehydrate,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { matchRoutes, Route, Routes, StaticRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { LangProvider } from "./i18n";
import { ContactPage } from "./pages/public/ContactPage";
import { DemoPage } from "./pages/public/DemoPage";
import { HomePage } from "./pages/public/home/HomePage";
import { ArticlePage, HUB_PAGE, HubPage } from "./pages/public/HubPage";
import { NotFoundPage } from "./pages/public/NotFoundPage";
import { PublicLayout } from "./pages/public/PublicLayout";
import { RoiPage } from "./pages/public/RoiPage";
import { VerifyPage } from "./pages/VerifyPage";
import {
  headTags,
  pageMeta,
  scriptJson,
  type ArticleInfo,
  type SiteInfo,
} from "./seo/meta";

/*
 * Server rendering for the public website. The API calls render() for
 * public URLs so crawlers and AI answer engines that don't run JavaScript
 * get the full page, with its own title, description and Schema.org data.
 * The browser then renders the same components over it (createRoot).
 */

/** Reads a public API endpoint in-process, e.g. "/public/site". */
export type ApiFetch = (
  path: string,
) => Promise<{ status: number; body: unknown }>;

export interface RenderResult {
  status: 200 | 404;
  title: string;
  head: string;
  html: string;
  /** Query cache for the browser, so it doesn't fetch the same data again. */
  state: string;
  /** Pages whose code loads lazily in the browser; their CSS goes in the head. */
  lazyModules: string[];
}

const ROUTES = [
  "/",
  "/demo",
  "/roi",
  "/contact",
  "/hub",
  "/hub/:slug",
  "/verify",
  "/verify/:code",
].map((path) => ({ path }));

export async function render(
  url: string,
  origin: string,
  fetchApi: ApiFetch,
): Promise<RenderResult> {
  const { pathname, search } = new URL(url, origin);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const load = async <T,>(key: unknown[], path: string): Promise<T | null> => {
    const res = await fetchApi(path);
    if (res.status !== 200) return null;
    queryClient.setQueryData(key, res.body);
    return res.body as T;
  };

  const match = matchRoutes(ROUTES, pathname)?.[0];
  let notFound = !match;
  const site = await load<SiteInfo>(["public-site"], "/public/site");
  let article: ArticleInfo | null = null;

  if (match?.route.path === "/") {
    await load(
      ["articles", "case_study"],
      "/public/articles?kind=case_study&limit=3",
    );
  } else if (match?.route.path === "/demo") {
    const demos = await load<{ id: string }[]>(["demos"], "/public/demos");
    const first = demos?.[0];
    if (first) await load(["demo", first.id], `/public/demos/${first.id}`);
  } else if (match?.route.path === "/hub") {
    const params = new URLSearchParams(search);
    const kind = params.get("kind");
    const page = Math.max(0, (Number(params.get("page")) || 1) - 1);
    await load(
      ["articles", kind, page],
      `/public/articles?${new URLSearchParams({
        limit: String(HUB_PAGE),
        offset: String(page * HUB_PAGE),
        ...(kind && { kind }),
      }).toString()}`,
    );
  } else if (match?.route.path === "/hub/:slug") {
    const slug = match.params.slug ?? "";
    article = await load<ArticleInfo>(
      ["article", slug],
      `/public/articles/${encodeURIComponent(slug)}`,
    );
    if (!article) notFound = true;
  }

  const html = renderToString(
    <LangProvider>
      <QueryClientProvider client={queryClient}>
        <StaticRouter location={url}>
          <AuthProvider>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route index element={<HomePage />} />
                <Route path="demo" element={<DemoPage />} />
                <Route path="roi" element={<RoiPage />} />
                <Route path="contact" element={<ContactPage />} />
                <Route path="hub" element={<HubPage />} />
                <Route
                  path="hub/:slug"
                  element={notFound ? <NotFoundPage /> : <ArticlePage />}
                />
                <Route path="verify" element={<VerifyPage />} />
                <Route path="verify/:code" element={<VerifyPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </AuthProvider>
        </StaticRouter>
      </QueryClientProvider>
    </LangProvider>,
  );

  const meta = pageMeta({
    path: pathname,
    search,
    origin,
    lang: "en",
    site,
    article,
    notFound,
  });
  return {
    status: notFound ? 404 : 200,
    title: meta.title,
    head: headTags(meta, origin),
    html,
    state: scriptJson(dehydrate(queryClient)),
    lazyModules: pathname === "/" ? ["src/pages/public/home/HomePage.tsx"] : [],
  };
}
