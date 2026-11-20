import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClassifierUnavailableError } from "../src/ai/classifier.js";
import { batches } from "../src/db/schema.js";
import { resumeWaiting, sweep } from "../src/modules/station/sweeper.js";
import {
  bearer,
  createTestApp,
  multipart,
  register,
  syntheticBoard,
  tokenFromMail,
  type TestApp,
} from "./helpers.js";

type Method = "GET" | "POST" | "PUT" | "PATCH";
const client =
  (t: TestApp, token: string) =>
  <T = Record<string, unknown>>(
    method: Method,
    url: string,
    payload?: object,
  ) =>
    t.app
      .inject({
        method,
        url,
        headers: bearer(token),
        ...(payload && { payload }),
      })
      .then((r) => ({ status: r.statusCode, body: r.json<T>() }));

/** Uploads one photo as the last of a new sample; returns their ids. */
async function photographed(t: TestApp, token: string) {
  const api = client(t, token);
  const sample = await api<{ id: string }>("POST", "/api/samples", {
    crop: "wheat",
  });
  const photo = await syntheticBoard(20);
  const form = multipart(
    { finish: "true" },
    { name: "photo", data: photo.jpeg },
  );
  const up = await t.app.inject({
    method: "POST",
    url: `/api/samples/${sample.body.id}/batches`,
    headers: { ...bearer(token), ...form.headers },
    payload: form.payload,
  });
  await t.jobs.idle();
  return { sampleId: sample.body.id, batchId: up.json<{ id: string }>().id };
}

/** Confirms whatever waits for review, so Autopilot can finish. */
async function reviewAll(t: TestApp, token: string, sampleId: string) {
  const api = client(t, token);
  const pending = await api<{ id: string; aiClass: string }[]>(
    "GET",
    `/api/samples/${sampleId}/review`,
  );
  if (pending.body.length)
    await api("POST", "/api/kernels/review", {
      decisions: pending.body.map((k) => ({
        kernelId: k.id,
        finalClass: k.aiClass,
      })),
    });
  await t.jobs.idle();
}

describe("a station without internet", () => {
  let t: TestApp;
  let token: string;
  beforeAll(async () => {
    t = await createTestApp();
    ({ token } = await register(t, "station@mandi.test", "Mandi", {
      autopilot: true,
    }));
    await client(t, token)("PATCH", "/api/org", {
      autopilot: { spotCheckPct: 0 },
    });
  });
  afterAll(() => t.close());

  it("keeps photos waiting while Model Orchestration can't be reached, then carries on", async () => {
    const api = client(t, token);
    const original = t.classifier.classify.bind(t.classifier);
    t.classifier.classify = () =>
      Promise.reject(new ClassifierUnavailableError("offline"));
    const { sampleId, batchId } = await photographed(t, token);
    let batch = await api<{
      status: string;
      error: string;
      kernelCount: number;
    }>("GET", `/api/batches/${batchId}`);
    // Counted offline; classification waits.
    expect(batch.body).toMatchObject({ status: "waiting", kernelCount: 20 });
    expect(batch.body.error).toMatch(/Waiting for internet/);
    const finish = await api<{ waitingFor: string[] }>(
      "POST",
      `/api/samples/${sampleId}/finish`,
    );
    expect(finish.body.waitingFor.join(" ")).toMatch(/wait for internet/);

    // Still offline at the next try: it waits again, with a later retry.
    await t.ctx.db.update(batches).set({ retryAt: new Date(0) });
    expect(await resumeWaiting(t.ctx)).toBe(0);
    batch = await api("GET", `/api/batches/${batchId}`);
    expect(batch.body.status).toBe("waiting");

    // Back online: the sweeper classifies it and Autopilot goes on.
    t.classifier.classify = original;
    await t.ctx.db.update(batches).set({ retryAt: new Date(0) });
    expect(await resumeWaiting(t.ctx)).toBe(1);
    await t.jobs.idle();
    batch = await api("GET", `/api/batches/${batchId}`);
    expect(batch.body.status).toBe("classified");
    expect(batch.body.error).toBeNull();
    await reviewAll(t, token, sampleId);
    const done = await api<{ status: string }>(
      "GET",
      `/api/samples/${sampleId}`,
    );
    expect(done.body.status).toBe("completed");
  });

  it("waits too when the connection drops between the first and second look", async () => {
    const api = client(t, token);
    const original = t.classifier.classify.bind(t.classifier);
    t.classifier.classify = (req) =>
      req.side === "auto" || req.expert
        ? original(req)
        : Promise.reject(new ClassifierUnavailableError("offline"));
    try {
      const { batchId } = await photographed(t, token);
      const batch = await api<{ status: string }>(
        "GET",
        `/api/batches/${batchId}`,
      );
      expect(batch.body.status).toBe("waiting");
      // Nothing was sent to a person for lack of a second look.
      const kernels = await api<{ kernels: { flagReason: string | null }[] }>(
        "GET",
        `/api/batches/${batchId}`,
      );
      expect(
        kernels.body.kernels.filter((k) => k.flagReason === "defect"),
      ).toHaveLength(0);
    } finally {
      t.classifier.classify = original;
    }
  });
});

describe("a station sending results to its central server", () => {
  let central: TestApp;
  let station: TestApp;
  let centralToken: string;
  let stationToken: string;

  beforeAll(async () => {
    central = await createTestApp();
    station = await createTestApp();
    ({ token: centralToken } = await register(
      central,
      "hq@board.test",
      "State Board",
    ));
    ({ token: stationToken } = await register(
      station,
      "raipur@mandi.test",
      "APMC Raipur",
      { autopilot: true },
    ));
    await client(station, stationToken)("PATCH", "/api/org", {
      autopilot: { spotCheckPct: 0 },
    });
    // The station's outgoing requests reach the central app.
    station.webhooks.handler = async (url, init) => {
      const path = new URL(url).pathname;
      const res = await central.app.inject({
        method: (init.method ?? "POST") as "GET" | "POST",
        url: path,
        headers: init.headers as Record<string, string>,
        ...(init.body !== undefined && { payload: init.body as string }),
      });
      return new Response(res.body, { status: res.statusCode });
    };
  });
  afterAll(async () => {
    await station.close();
    await central.close();
  });

  it("sends certificates the central site can verify, after the connection comes back", async () => {
    const hq = client(central, centralToken);
    const raipur = client(station, stationToken);
    // The central server issues a station key; read keys can't send.
    const readKey = await hq<{ key: string }>("POST", "/api/integration/keys", {
      name: "reader",
    });
    const refused = await central.app.inject({
      method: "POST",
      url: "/api/v1/ingest",
      headers: { authorization: `Bearer ${readKey.body.key}` },
      payload: { id: "x", event: "test", data: {} },
    });
    expect(refused.statusCode).toBe(403);
    const key = await hq<{ key: string }>("POST", "/api/integration/keys", {
      name: "APMC Raipur station",
      scope: "station",
    });
    const saved = await raipur("PUT", "/api/integration/central", {
      url: "https://central.test/",
      key: key.body.key,
    });
    expect(saved.status).toBe(200);
    const check = await raipur<{ ok: boolean }>(
      "POST",
      "/api/integration/central/test",
    );
    expect(check.body.ok).toBe(true);

    // No internet while the sample is done.
    station.webhooks.offline = true;
    const { sampleId } = await photographed(station, stationToken);
    await reviewAll(station, stationToken, sampleId);
    const result = await raipur<{
      certificate: { code: string; verifyUrl: string };
    }>("GET", `/api/samples/${sampleId}/result.json`);
    const code = result.body.certificate.code;
    // The QR on the report points to the central site.
    expect(result.body.certificate.verifyUrl).toBe(
      `https://central.test/verify/${code}`,
    );
    const verify = () =>
      central.app.inject({ method: "GET", url: `/api/public/verify/${code}` });
    expect((await verify()).statusCode).toBe(404);
    let status = await raipur<{ outbox: { waiting: number } }>(
      "GET",
      "/api/integration",
    );
    // The result, and its checked kernels for the network's model.
    expect(status.body.outbox.waiting).toBe(2);

    // Connection back: the next sweep delivers it.
    station.webhooks.offline = false;
    const { outbox } = await import("../src/db/schema.js");
    await station.ctx.db.update(outbox).set({ nextAttemptAt: new Date(0) });
    expect((await sweep(station.ctx)).delivered).toBe(2);
    const ok = (await verify()).json<{
      status: string;
      intact: boolean;
      station: string;
      payload: { sampleNumber: number };
    }>();
    expect(ok).toMatchObject({
      status: "valid",
      intact: true,
      station: "APMC Raipur",
    });
    status = await raipur("GET", "/api/integration");
    expect(status.body.outbox.waiting).toBe(0);

    // Reopened at the station: withdrawn on the central site too.
    await raipur("POST", `/api/samples/${sampleId}/reopen`);
    await station.jobs.idle();
    expect((await verify()).json<{ status: string }>().status).toBe(
      "withdrawn",
    );
  });

  it("sends the operator's help report to the central server", async () => {
    const raipur = client(station, stationToken);
    const hq = client(central, centralToken);
    const health = await raipur<{
      orchestration: boolean;
      photosWaitingForInternet: number;
      outbox: { waiting: number };
    }>("GET", "/api/station/health");
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({
      photosWaitingForInternet: 0,
      outbox: { waiting: 0 },
    });

    const tooBig = await raipur("POST", "/api/station/help", {
      diagnostics: { log: "x".repeat(60_000) },
    });
    expect(tooBig.status).toBe(400);
    const sent = await raipur<{ id: string }>("POST", "/api/station/help", {
      note: "The bottom camera shows grey",
      diagnostics: { cameras: ["USB2.0 Camera", "USB2.0 Camera"] },
    });
    expect(sent.status).toBe(201);
    const { outbox } = await import("../src/db/schema.js");
    await station.ctx.db.update(outbox).set({ nextAttemptAt: new Date(0) });
    expect((await sweep(station.ctx)).delivered).toBe(1);

    const here = await raipur<{ items: { note: string }[] }>(
      "GET",
      "/api/station/help",
    );
    expect(here.body.items[0]?.note).toBe("The bottom camera shows grey");
    const there = await hq<{
      items: { note: string; diagnostics: Record<string, unknown> }[];
    }>("GET", "/api/station/help");
    expect(there.body.items).toHaveLength(1);
    expect(there.body.items[0]).toMatchObject({
      note: "The bottom camera shows grey",
      diagnostics: {
        station: "APMC Raipur",
        cameras: ["USB2.0 Camera", "USB2.0 Camera"],
      },
    });
    // Delivered twice (a retry after a lost answer): still one report.
    await sweep(station.ctx);
    expect(
      (await hq<{ items: unknown[] }>("GET", "/api/station/help")).body.items,
    ).toHaveLength(1);
  });

  it("takes the central server's shared standards and reports its health", async () => {
    const raipur = client(station, stationToken);
    const hq = client(central, centralToken);
    const body = {
      name: "State FAQ wheat",
      crop: "wheat",
      grades: [{ grade: "FAQ", maxDefectPct: { broken: 6 } }],
      allowEstimate: true,
      pricing: {
        currency: "INR",
        unit: "quintal",
        basePrice: 2425,
        deductions: [],
      },
      shared: true,
    };
    const shared = await hq<{ id: string }>("POST", "/api/standards", body);
    expect(shared.status).toBe(201);
    await hq("POST", "/api/standards", {
      ...body,
      name: "HQ internal",
      shared: false,
    });

    const sync = await raipur<{ standardsChanged: number; syncedAt: string }>(
      "POST",
      "/api/integration/central/sync",
    );
    expect(sync.body.standardsChanged).toBe(1);
    expect(sync.body.syncedAt).toBeTruthy();
    type Std = {
      id: string;
      name: string;
      networkId: string | null;
      archived: boolean;
      pricing: { basePrice: number } | null;
    };
    let list = await raipur<Std[]>(
      "GET",
      "/api/standards?includeArchived=true",
    );
    const copy = list.body.find((x) => x.networkId === shared.body.id)!;
    expect(copy).toMatchObject({
      name: "State FAQ wheat",
      pricing: { basePrice: 2425 },
    });
    expect(list.body.some((x) => x.name === "HQ internal")).toBe(false);
    // Changed only on the central server.
    const edit = await raipur("PUT", `/api/standards/${copy.id}`, {
      ...body,
      shared: undefined,
    });
    expect(edit.status).toBe(409);

    // A change and then the end of sharing reach the station.
    await hq("PUT", `/api/standards/${shared.body.id}`, {
      ...body,
      name: "State FAQ wheat 2027",
    });
    await raipur("POST", "/api/integration/central/sync");
    list = await raipur<Std[]>("GET", "/api/standards?includeArchived=true");
    expect(list.body.find((x) => x.id === copy.id)?.name).toBe(
      "State FAQ wheat 2027",
    );
    await hq("PUT", `/api/standards/${shared.body.id}`, {
      ...body,
      shared: false,
    });
    await raipur("POST", "/api/integration/central/sync");
    list = await raipur<Std[]>("GET", "/api/standards?includeArchived=true");
    expect(list.body.find((x) => x.id === copy.id)?.archived).toBe(true);

    // The central server sees the station, how it is doing and its results.
    const stations = await hq<{
      items: {
        name: string;
        health: {
          completed7d: number;
          outboxWaiting: number;
          helpReports7d: number;
        };
        results7d: number;
      }[];
    }>("GET", "/api/integration/stations");
    expect(stations.body.items).toHaveLength(1);
    expect(stations.body.items[0]).toMatchObject({
      name: "APMC Raipur",
      // Its one sample was reopened above: started today, not completed.
      health: {
        samplesToday: 1,
        completed7d: 0,
        outboxWaiting: 0,
        helpReports7d: 1,
      },
      results7d: 1,
    });
    // Stations' own pages are for admins of the central server only.
    const refused = await central.app.inject({
      method: "GET",
      url: "/api/v1/standards",
      headers: { authorization: "Bearer agk_not_a_key" },
    });
    expect(refused.statusCode).toBe(401);
  });

  it("refuses a certificate whose contents don't match its hash", async () => {
    const hq = client(central, centralToken);
    const key = await hq<{ key: string }>("POST", "/api/integration/keys", {
      name: "tampering station",
      scope: "station",
    });
    const res = await central.app.inject({
      method: "POST",
      url: "/api/v1/ingest",
      headers: { authorization: `Bearer ${key.body.key}` },
      payload: {
        id: "x",
        event: "sample.completed",
        data: {
          result: { sampleId: "s1", organisation: "Fake" },
          certificate: {
            code: "AAAA-BBBB-CCCC",
            version: 1,
            payload: { grade: "1" },
            payloadHash: "0".repeat(64),
            issuedAt: new Date().toISOString(),
          },
        },
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("station mode", () => {
  it("tells phones where to open the app", async () => {
    const t = await createTestApp({
      STATION_MODE: "true",
      STATION_ADDRESS: "http://192.168.1.20:3000",
    });
    const { token } = await register(t, "s@m.test", "M");
    const res = await client(t, token)<{
      station: boolean;
      addresses: string[];
      qr: string;
    }>("GET", "/api/station");
    expect(res.body).toMatchObject({
      station: true,
      addresses: ["http://192.168.1.20:3000"],
    });
    expect(res.body.qr).toMatch(/^data:image\/png;base64,/);
    await t.close();
  });
});

describe("simple mode", () => {
  it("is set up by an admin and keeps operators on the simple screen", async () => {
    const t = await createTestApp();
    const { token } = await register(t, "admin@fpo.test", "Kisan FPO");
    const admin = client(t, token);
    const saved = await admin("PATCH", "/api/org", {
      simpleMode: {
        locked: true,
        crops: ["wheat", "paddy"],
        capture: "two",
        weigh: true,
        autoPrint: true,
        language: "hi",
      },
    });
    expect(saved.status).toBe(200);
    const org = await admin<{ simpleMode: Record<string, unknown> }>(
      "GET",
      "/api/org",
    );
    expect(org.body.simpleMode).toEqual({
      locked: true,
      crops: ["wheat", "paddy"],
      capture: "two",
      weigh: true,
      autoPrint: true,
      language: "hi",
    });
    const bad = await admin("PATCH", "/api/org", {
      simpleMode: { capture: "three" },
    });
    expect(bad.status).toBe(400);

    // Operators can send help but can't read other people's reports.
    await admin("POST", "/api/users/invites", {
      email: "op@fpo.test",
      role: "grader",
    });
    const accept = await t.app.inject({
      method: "POST",
      url: "/api/auth/invite/accept",
      payload: {
        token: tokenFromMail(t.mailer, "op@fpo.test"),
        name: "Operator",
        password: "operator password 1",
      },
    });
    const op = client(t, accept.json<{ accessToken: string }>().accessToken);
    expect(
      (await op("POST", "/api/station/help", { diagnostics: {} })).status,
    ).toBe(201);
    expect((await op("GET", "/api/station/help")).status).toBe(403);
    expect((await op("PATCH", "/api/org", { simpleMode: {} })).status).toBe(
      403,
    );
    await t.close();
  });
});
