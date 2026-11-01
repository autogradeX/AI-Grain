import { describe, expect, it } from "vitest";
import { headTags, pageMeta, type MetaInput } from "../src/seo/meta";

const base: MetaInput = {
  path: "/",
  search: "",
  origin: "https://grain.example",
  lang: "en",
  site: null,
  article: null,
  notFound: false,
};

const article = {
  slug: "ergot",
  kind: "glossary" as const,
  title: "Ergot",
  summary: "The dark resting body of the fungus Claviceps purpurea.",
  body: "The dark resting body of the fungus Claviceps purpurea.",
  publishedAt: "2026-10-30T05:32:00Z",
  updatedAt: "2026-10-31T08:00:00Z",
};

describe("page metadata", () => {
  it("describes the home page as an organisation, website and product", () => {
    const meta = pageMeta(base);
    expect(meta.canonical).toBe("/");
    expect(meta.robots).toBe("index,follow");
    expect(meta.title.length).toBeLessThanOrEqual(65);
    expect(meta.description.length).toBeLessThanOrEqual(160);
    expect(meta.jsonLd.map((j) => j["@type"])).toEqual([
      "Organization",
      "WebSite",
      "SoftwareApplication",
    ]);
  });

  it("gives filtered and later hub pages their own canonical", () => {
    expect(
      pageMeta({ ...base, path: "/hub", search: "?page=1" }).canonical,
    ).toBe("/hub");
    expect(
      pageMeta({ ...base, path: "/hub", search: "?kind=glossary&page=2" })
        .canonical,
    ).toBe("/hub?kind=glossary&page=2");
  });

  it("marks glossary entries as defined terms and guides as articles", () => {
    const term = pageMeta({ ...base, path: "/hub/ergot", article });
    expect(term.title).toBe("Ergot | AI-Grain");
    expect(term.jsonLd[0]!["@type"]).toBe("DefinedTerm");
    expect(term.jsonLd[1]!["@type"]).toBe("BreadcrumbList");
    const guide = pageMeta({
      ...base,
      path: "/hub/setup",
      article: { ...article, slug: "setup", kind: "guide", title: "Setup" },
    });
    expect(guide.jsonLd[0]).toMatchObject({
      "@type": "Article",
      datePublished: article.publishedAt,
      dateModified: article.updatedAt,
    });
  });

  it("keeps certificates and missing pages out of search", () => {
    expect(pageMeta({ ...base, path: "/verify/ABCD-EFGH-JKLM" }).robots).toBe(
      "noindex,follow",
    );
    const missing = pageMeta({ ...base, path: "/nope", notFound: true });
    expect(missing.robots).toBe("noindex,follow");
    expect(missing.canonical).toBeNull();
  });

  it("escapes page text in tags and structured data", () => {
    const head = headTags(
      pageMeta({
        ...base,
        path: "/hub/x",
        article: {
          ...article,
          slug: "x",
          kind: "guide",
          title: 'Bad "quote" </script><script>alert(1)</script>',
        },
      }),
      base.origin,
    );
    expect(head).not.toContain("</script><script>");
    expect(head).toContain("&quot;quote&quot;");
  });
});
