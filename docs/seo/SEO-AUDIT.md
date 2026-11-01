# AI-Grain public website: SEO, AEO and GEO audit

Audit date: 1 November 2026. Method: the full-site audit process and checklists of
[claude-seo](https://github.com/AgricIDaniel/claude-seo) (`seo-audit`, `seo-technical`,
`seo-geo`, `seo-schema`, `seo-sitemap`, `seo-content`), applied to the code and to the
production build served locally. The site is not deployed yet, so live-only data
(Search Console, Core Web Vitals field data, backlinks, brand mentions) is **not
measured** and is listed under the action plan instead of being guessed.

Scope: the public website (`/`, `/demo`, `/roi`, `/contact`, `/hub`, `/hub/:slug`,
`/verify`). The signed-in app (`/app`) and sign-in pages are private and should not
rank; the audit checks that they stay out of search.

## Executive summary

|                                                                                                              | Before                  | After                                                                                        |
| ------------------------------------------------------------------------------------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------- |
| **SEO health score** (claude-seo weights; Performance not measured, so the other categories are re-weighted) | **25 / 100**            | **80 / 100**                                                                                 |
| Words a non-JavaScript crawler sees on the home page                                                         | ~26 (the `<head>` only) | 1,278                                                                                        |
| Distinct page titles                                                                                         | 1 for every URL         | 1 per page                                                                                   |
| Status for a page that doesn't exist                                                                         | 200 (soft 404)          | 404                                                                                          |
| `robots.txt` / `sitemap.xml` / `llms.txt`                                                                    | none / none / none      | all three, generated from published content                                                  |
| Structured data                                                                                              | none                    | Organization, WebSite, SoftwareApplication, Article/NewsArticle, DefinedTerm, BreadcrumbList |
| JavaScript on a public page (gzipped)                                                                        | 213 KB                  | 155 KB                                                                                       |

**The one finding that mattered most:** the public site was a client-rendered React
app. Every URL returned the same empty `<div id="root">` with one title. Google
renders JavaScript and would eventually have seen the pages, but the crawlers behind
ChatGPT Search (OAI-SearchBot), Perplexity and many other AI tools read raw HTML
without running scripts, so to them the site had no content at all. Public pages
are now server-rendered from the same React components, so every crawler reads the
full page, and visitors see content before the JavaScript loads.

## Scores by category

Scores follow claude-seo's rule: a category is scored only on checks actually run,
and the checks are listed below.

| Category                      | Weight | Before       | After        |
| ----------------------------- | ------ | ------------ | ------------ |
| Technical SEO                 | 22%    | 25           | 90           |
| Content quality               | 23%    | 45           | 60           |
| On-page SEO                   | 20%    | 15           | 90           |
| Schema / structured data      | 10%    | 0            | 85           |
| Performance (Core Web Vitals) | 10%    | not measured | not measured |
| AI search readiness (GEO/AEO) | 10%    | 15           | 80           |
| Images                        | 5%     | 40           | 85           |

Content quality is the category that code can't fix: it needs company facts,
named experts and more written material (see the action plan).

## Technical SEO

| Check                       | Before                                                                    | After                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Content in the initial HTML | Fail: empty app shell on every URL                                        | Pass: public pages server-rendered (`apps/web/src/entry-server.tsx`, served by `apps/api/src/web/serve.ts`) |
| `robots.txt`                | Missing (404)                                                             | Pass: public pages open; `/app/`, `/api/` and sign-in pages closed; sitemap declared                        |
| XML sitemap                 | Missing                                                                   | Pass: `/sitemap.xml`, 7 main pages plus every published article with `lastmod`                              |
| Canonical URLs              | None                                                                      | Pass: self-referencing on every indexable page; filtered and paginated hub pages canonical to themselves    |
| Unknown URLs                | 200 with the home shell (soft 404)                                        | Pass: 404 status and a "page not found" page, also for unknown articles                                     |
| Duplicate URLs              | `/hub/` and `/hub` both served                                            | Pass: trailing slash 301s to the one URL                                                                    |
| Private pages               | Indexable                                                                 | Pass: `X-Robots-Tag: noindex` on `/app/*` and sign-in pages; certificate pages `noindex`                    |
| Security headers            | Pass: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy | Pass, plus Permissions-Policy (camera for this site only)                                                   |
| HTTPS                       | Provided by Cloud Run (not measured locally)                              | Same; HSTS already sent                                                                                     |
| Mobile                      | Pass: responsive, viewport set, installable PWA                           | Same                                                                                                        |
| IndexNow (Bing, Yandex)     | Not supported                                                             | Not supported (low priority, see action plan)                                                               |
| Rendering fallback          | n/a                                                                       | If the server bundle can't load, pages fall back to client rendering and stay indexable                     |

## On-page SEO

| Check             | Before                                                     | After                                                                                                  |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Titles            | One title, "AI-Grain", on every URL                        | Unique per page, 40–60 characters, e.g. "AI-Grain: grain impurity analysis with a phone, scale and AI" |
| Meta descriptions | One generic description everywhere                         | Unique per page, 85–160 characters; articles use their summary                                         |
| H1                | Only after JavaScript                                      | One H1 per page in the HTML; 9 H2 sections on the home page                                            |
| Social previews   | No Open Graph or Twitter tags, no image                    | Open Graph and Twitter tags on every page, 1200×630 image (`/og-image.jpg`)                            |
| Internal links    | Only after JavaScript                                      | Navigation, footer and hub links in the HTML; breadcrumbs on articles                                  |
| Language          | English and Hindi share one URL; Hindi only after a toggle | Unchanged: search engines see English. See action plan                                                 |

## Schema / structured data

Validated as JSON-LD in the rendered HTML (unit tests in `apps/web/test/seo.test.ts`).

| Page                 | Types                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| Home                 | `Organization` (name, logo, contact details from Website → Contact details), `WebSite`, `SoftwareApplication` |
| Guides, case studies | `Article` (`NewsArticle` for news) with `datePublished`, `dateModified`, publisher; `BreadcrumbList`          |
| Glossary entries     | `DefinedTerm` in a `DefinedTermSet`; `BreadcrumbList`                                                         |

Deliberately not added: `FAQPage` markup (Google shows FAQ rich results only for
government and health sites; the FAQ text is still on the page for answer engines),
`HowTo` (retired), and prices or ratings in `SoftwareApplication` (none exist; making
them up would break Google's guidelines).

## AI search readiness (GEO / AEO)

Per claude-seo and Google's own guidance, optimising for AI answers is mostly the
same work as SEO: content visible in HTML, clear structure, trustworthy sources.

| Check                                                                                         | Before                                          | After                                                                                                                                                  |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Content readable without JavaScript                                                           | Fail                                            | Pass (all public pages)                                                                                                                                |
| AI search crawlers                                                                            | No `robots.txt` (allowed by default)            | Explicitly allowed: `OAI-SearchBot` (ChatGPT Search), `Claude-SearchBot`, `PerplexityBot`                                                              |
| AI training crawlers (`GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot`, `Applebot-Extended`) | Allowed by default                              | Still allowed: a licensing decision for you (see action plan); blocking them does not affect search citations                                          |
| Answer-ready passages                                                                         | Present but invisible to non-rendering crawlers | Visible: the home page's "how it works" steps, comparison, category definitions, equipment table and 8-question FAQ; 13 glossary definitions; 4 guides |
| Question-style headings and definitions                                                       | Partly                                          | FAQ questions and "X is …" glossary definitions in HTML                                                                                                |
| Dates on articles                                                                             | Updated date only                               | Published and updated dates, in `<time>` and in structured data                                                                                        |
| `llms.txt`                                                                                    | Missing                                         | Added (`/llms.txt`). Google says it ignores it; some other AI tools read it, so it carries no score weight                                             |
| Brand mentions (YouTube, Reddit, LinkedIn, Wikipedia)                                         | Not measured                                    | Not measured: the strongest AI-citation signal in third-party studies, and it's built off-site                                                         |

## Images

| Check        | Before                                                                          | After                                                                          |
| ------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Favicons     | SVG only                                                                        | `favicon.ico` (16/32/48), PNG 16/32, SVG, Apple touch icon, maskable PWA icons |
| Social image | None                                                                            | 1200×630 JPEG, 127 KB                                                          |
| Alt text     | Pass: kernel images and logos have alt text; decorative canvas is `aria-hidden` | Same                                                                           |

## Performance

Not measured: Core Web Vitals need field data (CrUX, after launch) or a Lighthouse
run on the deployed site. Changes that should help:

- Content arrives in the HTML, so the largest text block paints before JavaScript loads.
- The signed-in app now loads only when it's used: 27% less JavaScript on public pages.
- The 3D landing scene stays in its own lazily loaded file and pauses off screen.

Still worth checking after launch: the remaining 155 KB gzipped entry script (React,
router, Markdown renderer, demo page), and the landing page's 3D scene on low-end phones.

## Action plan

### Built in this audit

All of the "After" column above: server rendering, per-page metadata and structured
data, real 404s, trailing-slash redirects, `noindex` for private pages,
`robots.txt`, `sitemap.xml`, `llms.txt`, favicons, social image, breadcrumbs and
dates, Permissions-Policy, and lazy loading of the signed-in app. Covered by tests
in `apps/api/test/static.test.ts` and `apps/web/test/seo.test.ts`.

### Needs you

**Critical (at launch)**

1. Deploy, then set `APP_URL` to the final `https://` address (ideally your own
   domain): canonical URLs, the sitemap and link previews are built from it.
2. Verify the site in Google Search Console and Bing Webmaster Tools and submit
   `https://<your domain>/sitemap.xml`.

**High (first weeks)**

3. Fill in Website → Contact details (email, phone, address): they go into the
   `Organization` data that search and AI engines use to identify the business.
4. Add an About page with real company facts: who runs AI-Grain, where, since when,
   and the grain-quality experience behind it. Name an expert reviewer for the
   guides. These are the E-E-A-T signals the content score is missing. I didn't
   write this because it needs facts only you have.
5. Publish a privacy policy and terms (needs legal text).
6. Expand the glossary: entries are one or two sentences (thin content). Each term
   gains from a paragraph on how to recognise it, why it matters and typical limits
   by standard, with sources.

**Medium (first months)**

7. Publish case studies with real figures (with the customer's permission) and
   original data, such as agreement between the method and certified graders. AI
   engines cite unique numbers.
8. Build brand presence off the site: a short YouTube demo, a LinkedIn page, and
   answers in farming and milling communities. In third-party studies these
   correlate with AI citations far more than backlinks. Then add the profile URLs
   to the `Organization` data (`sameAs`); I can add a setting for that.
9. Decide on AI training crawlers. They're allowed now. To opt out of model
   training while staying citable in AI search, add `Disallow` groups for
   `GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot` and `Applebot-Extended`.
10. If Hindi search matters, give Hindi its own URLs (for example `/hi/...`) with
    `hreflang` links. Today search engines only see the English version.

**Low (backlog)**

11. IndexNow for faster indexing in Bing and Yandex.
12. Run PageSpeed Insights on the live site and check Core Web Vitals in Search
    Console after 28 days of traffic.

## How to re-check

```sh
curl -s https://<domain>/ | sed 's/<[^>]*>/ /g' | wc -w   # content in the raw HTML
curl -sI https://<domain>/no-such-page                    # expect 404
curl -s https://<domain>/robots.txt
curl -s https://<domain>/sitemap.xml
```

Google's Rich Results Test and the Schema.org validator check the structured data on
any live URL.
