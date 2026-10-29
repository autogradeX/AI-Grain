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
let token: string;
let sampleId: string;
let batchId: string;

beforeAll(async () => {
  t = await createTestApp();
  ({ token } = await register(t));
  const sample = await t.app.inject({
    method: "POST",
    url: "/api/samples",
    headers: bearer(token),
    payload: { crop: "wheat", sampleMassG: 25 },
  });
  sampleId = sample.json<{ id: string }>().id;
  const photo = await syntheticBoard(5);
  const form = multipart(
    {
      corners: JSON.stringify(photo.corners),
      imageWidth: String(photo.width),
      imageHeight: String(photo.height),
    },
    { name: "photo", data: photo.jpeg },
  );
  const res = await t.app.inject({
    method: "POST",
    url: `/api/samples/${sampleId}/batches`,
    headers: { ...bearer(token), ...form.headers },
    payload: form.payload,
  });
  batchId = res.json<{ id: string }>().id;
  await t.jobs.idle();
});
afterAll(async () => {
  await t.close();
});

const getBatch = () =>
  t.app
    .inject({
      method: "GET",
      url: `/api/batches/${batchId}`,
      headers: bearer(token),
    })
    .then((r) => r.json<{ status: string; error: string | null }>());

describe("jobs cut off by a restart", () => {
  it("leaves a recently active job alone", async () => {
    await t.ctx.db.execute(
      `update batches set status = 'classifying' where id = '${batchId}'`,
    );
    expect((await getBatch()).status).toBe("classifying");
  });

  it("marks a job with no progress for 10 minutes as failed, so it can be retried", async () => {
    await t.ctx.db.execute(
      `update batches set status = 'classifying', updated_at = now() - interval '11 minutes' where id = '${batchId}'`,
    );
    const batch = await getBatch();
    expect(batch.status).toBe("failed");
    expect(batch.error).toMatch(/Retry/);

    const retry = await t.app.inject({
      method: "POST",
      url: `/api/batches/${batchId}/classify`,
      headers: bearer(token),
    });
    expect(retry.statusCode).toBe(202);
    await t.jobs.idle();
    expect((await getBatch()).status).toBe("classified");
  });
});
