import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bearer,
  createTestApp,
  multipart,
  register,
  syntheticBoard,
  type TestApp,
} from "./helpers.js";

let t: TestApp;
let owner: string;
let other: string;
let sampleId: string;

beforeAll(async () => {
  t = await createTestApp();
  // The first organisation runs the website.
  owner = (await register(t, "site@owner.test", "Owner")).token;
  other = (await register(t, "admin@other.test", "Other")).token;
});
afterAll(async () => {
  await t.close();
});

const call = <T = Record<string, unknown>>(
  token: string | null,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  payload?: object,
) =>
  t.app
    .inject({
      method,
      url,
      ...(token && { headers: bearer(token) }),
      ...(payload && { payload }),
    })
    .then((r) => ({ status: r.statusCode, body: r.json<T>() }));

describe("public demo", () => {
  beforeAll(async () => {
    const s = await call<{ id: string }>(owner, "POST", "/api/samples", {
      crop: "wheat",
      sampleMassG: 20,
    });
    sampleId = s.body.id;
    const photo = await syntheticBoard(10);
    const form = multipart(
      {
        corners: JSON.stringify(photo.corners),
        imageWidth: String(photo.width),
        imageHeight: String(photo.height),
      },
      { name: "photo", data: photo.jpeg },
    );
    const up = await t.app.inject({
      method: "POST",
      url: `/api/samples/${sampleId}/batches`,
      headers: { ...bearer(owner), ...form.headers },
      payload: form.payload,
    });
    await t.jobs.idle();
    await call(
      owner,
      "POST",
      `/api/batches/${up.json<{ id: string }>().id}/classify`,
    );
    await t.jobs.idle();
    const pending = await call<{ id: string; aiClass: string }[]>(
      owner,
      "GET",
      `/api/samples/${sampleId}/review`,
    );
    await call(owner, "POST", "/api/kernels/review", {
      decisions: pending.body.map((k) => ({
        kernelId: k.id,
        finalClass: k.aiClass,
      })),
    });
    await call(owner, "PUT", `/api/samples/${sampleId}/weights`, {
      cupMassG: { broken: 0.3 },
    });
  });

  it("only shows completed samples the site owner published", async () => {
    expect(
      (await call<unknown[]>(null, "GET", "/api/public/demos")).body,
    ).toEqual([]);
    const early = await call(
      owner,
      "POST",
      `/api/samples/${sampleId}/publish`,
      { publicDemo: true },
    );
    expect(early.status).toBe(400);
    await call(owner, "POST", `/api/samples/${sampleId}/complete`);
    const ok = await call(owner, "POST", `/api/samples/${sampleId}/publish`, {
      publicDemo: true,
      demoTitle: "Wheat with broken kernels",
    });
    expect(ok.status).toBe(200);

    const list = await call<
      { id: string; title: string; cropLabel: string; kernels: number }[]
    >(null, "GET", "/api/public/demos");
    expect(list.body).toEqual([
      expect.objectContaining({
        id: sampleId,
        title: "Wheat with broken kernels",
        cropLabel: "Wheat",
        kernels: 10,
      }),
    ]);
  });

  it("serves the demo's kernels, photos and crops without signing in", async () => {
    const demo = await call<{
      batches: { id: string; kernels: { id: string; cls: string }[] }[];
      estimate: { counted: number };
      certificate: string;
      crop: { classes: unknown[] };
    }>(null, "GET", `/api/public/demos/${sampleId}`);
    expect(demo.status).toBe(200);
    expect(demo.body.batches[0]?.kernels).toHaveLength(10);
    expect(demo.body.estimate.counted).toBe(10);
    expect(demo.body.certificate).toMatch(/-/);
    const batch = demo.body.batches[0]!;
    const img = await t.app.inject({
      method: "GET",
      url: `/api/public/demos/${sampleId}/batches/${batch.id}/image`,
    });
    expect(img.headers["content-type"]).toBe("image/jpeg");
    const crop = await t.app.inject({
      method: "GET",
      url: `/api/public/demos/${sampleId}/kernels/${batch.kernels[0]!.id}/crop`,
    });
    expect(crop.statusCode).toBe(200);
  });

  it("keeps unpublished samples and other organisations private", async () => {
    await call(owner, "POST", `/api/samples/${sampleId}/publish`, {
      publicDemo: false,
    });
    expect(
      (await call(null, "GET", `/api/public/demos/${sampleId}`)).status,
    ).toBe(404);
    // An admin of another organisation can't publish, even their own samples.
    const theirs = await call<{ id: string }>(other, "POST", "/api/samples", {
      crop: "wheat",
    });
    expect(
      (
        await call(other, "POST", `/api/samples/${theirs.body.id}/publish`, {
          publicDemo: true,
        })
      ).status,
    ).toBe(403);
    expect((await call(other, "GET", "/api/site/leads")).status).toBe(403);
  });
});

describe("contact form", () => {
  it("stores the enquiry and emails the site owner's admins", async () => {
    const res = await call(null, "POST", "/api/public/contact", {
      name: "Grace Buyer",
      email: "grace@mill.test",
      company: "North Mill",
      message: "Can we try it on rapeseed?",
      consent: true,
    });
    expect(res.status).toBe(200);
    expect(t.mailer.sent.at(-1)).toMatchObject({
      to: "site@owner.test",
      subject: "Website enquiry from Grace Buyer",
    });
    const leads = await call<{ id: string; name: string; status: string }[]>(
      owner,
      "GET",
      "/api/site/leads",
    );
    expect(leads.body[0]).toMatchObject({ name: "Grace Buyer", status: "new" });
    const updated = await call(
      owner,
      "PATCH",
      `/api/site/leads/${leads.body[0]!.id}`,
      { status: "contacted" },
    );
    expect(updated.body).toMatchObject({ status: "contacted" });
  });

  it("sends to the configured contact address when there is one", async () => {
    await call(owner, "PUT", "/api/site/settings", {
      contactEmail: "sales@owner.test",
      bookingUrl: "https://cal.example/owner",
    });
    await call(null, "POST", "/api/public/contact", {
      name: "Ian",
      email: "ian@x.test",
      message: "Hi",
      consent: true,
    });
    expect(t.mailer.sent.at(-1)?.to).toBe("sales@owner.test");
    const site = await call<{ bookingUrl: string; contactEmail: string }>(
      null,
      "GET",
      "/api/public/site",
    );
    expect(site.body).toMatchObject({
      bookingUrl: "https://cal.example/owner",
      contactEmail: "sales@owner.test",
    });
  });

  it("rejects bots and missing consent", async () => {
    const bot = await call(null, "POST", "/api/public/contact", {
      name: "x",
      email: "x@x.test",
      message: "spam",
      consent: true,
      website: "http://spam.test",
    });
    expect(bot.status).toBe(400);
    const noConsent = await call(null, "POST", "/api/public/contact", {
      name: "x",
      email: "x@x.test",
      message: "hi",
    });
    expect(noConsent.status).toBe(400);
  });
});

describe("knowledge hub", () => {
  it("starts with published guides and glossary terms", async () => {
    const list = await call<{ slug: string; kind: string }[]>(
      null,
      "GET",
      "/api/public/articles",
    );
    expect(list.body.some((a) => a.kind === "guide")).toBe(true);
    expect(list.body.some((a) => a.slug === "ergot")).toBe(true);
    // Nothing invented: no seeded news or case studies.
    expect(
      list.body.some((a) => a.kind === "news" || a.kind === "case_study"),
    ).toBe(false);
    const ergot = await call<{ body: string }>(
      null,
      "GET",
      "/api/public/articles/ergot",
    );
    expect(ergot.body.body).toMatch(/Claviceps/);
  });

  it("lets the site admin write, publish and remove articles", async () => {
    const draft = await call<{ id: string }>(
      owner,
      "POST",
      "/api/site/articles",
      {
        slug: "harvest-2026",
        kind: "news",
        title: "Harvest 2026 notes",
        body: "# Notes",
        published: false,
      },
    );
    expect(draft.status).toBe(201);
    expect(
      (await call(null, "GET", "/api/public/articles/harvest-2026")).status,
    ).toBe(404);
    await call(owner, "PUT", `/api/site/articles/${draft.body.id}`, {
      slug: "harvest-2026",
      kind: "news",
      title: "Harvest 2026 notes",
      body: "# Notes",
      published: true,
    });
    expect(
      (await call(null, "GET", "/api/public/articles/harvest-2026")).status,
    ).toBe(200);
    const bad = await call(owner, "POST", "/api/site/articles", {
      slug: "Not A Slug",
      kind: "guide",
      title: "x",
      body: "",
      published: false,
    });
    expect(bad.status).toBe(400);
    await call(owner, "DELETE", `/api/site/articles/${draft.body.id}`);
    expect(
      (await call(null, "GET", "/api/public/articles/harvest-2026")).status,
    ).toBe(404);
  });
});
