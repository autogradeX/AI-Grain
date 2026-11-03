import { SOUND } from "@ai-grain/core";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import {
  kernels,
  localModels,
  networkExamples,
  organizations,
  samples,
} from "../../db/schema.js";
import { mapLimit } from "../../lib/jobs.js";
import { enqueue } from "../integration/outbox.js";
import { inputsFor, labelOf, REL } from "./service.js";

/*
 * One model for the whole network. Each station sends its checked kernels
 * (crop image, class, size and colour relative to the photo) to its central
 * server through the outbox; the central server trains on all of them; and
 * every station downloads the result, to classify offline with it.
 */

/** Kernels per outbox message (each carries its crop image). */
const PER_MESSAGE = 40;
/** Sound kernels nobody checked: at most this many per photo (there are plenty). */
const SOUND_PER_PHOTO = 40;
/** How often a station asks its central server for newer models. */
const CHECK_EVERY_MS = 30 * 60_000;

export const TrainingExamplesData = z.object({
  crop: z.string().min(1).max(60),
  examples: z
    .array(
      z.object({
        ref: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
        label: z.string().min(1).max(40),
        weight: z.number().min(0).max(1),
        batchRef: z.string().min(1).max(64),
        rel: z.array(z.number()).length(REL),
        /** The crop, JPEG in base64 (at most about 300 kB). */
        image: z.string().min(1).max(400_000),
      }),
    )
    .min(1)
    .max(100),
});

/**
 * Station: after a sample completes, queue its checked kernels for the
 * central server's network model. Nothing happens without a central server.
 */
export async function queueTrainingExamples(
  ctx: AppContext,
  sampleId: string,
): Promise<number> {
  const [sample] = await ctx.db
    .select({
      orgId: samples.orgId,
      crop: samples.crop,
      integration: organizations.integration,
    })
    .from(samples)
    .innerJoin(organizations, eq(organizations.id, samples.orgId))
    .where(eq(samples.id, sampleId));
  if (!sample?.integration.centralUrl || !sample.integration.centralKey)
    return 0;
  const rows = await ctx.db
    .select()
    .from(kernels)
    .where(and(eq(kernels.sampleId, sampleId), eq(kernels.isCluster, false)));
  const soundPerPhoto = new Map<string, number>();
  const chosen = rows.flatMap((k) => {
    const label = labelOf(k);
    if (!label) return [];
    // Sound kernels Model Orchestration settled are plenty: a sample of them.
    if (label.weight < 1 && label.label === SOUND) {
      const n = (soundPerPhoto.get(k.batchId) ?? 0) + 1;
      soundPerPhoto.set(k.batchId, n);
      if (n > SOUND_PER_PHOTO) return [];
    }
    return [{ kernel: k, ...label }];
  });
  if (!chosen.length) return 0;
  const inputs = await inputsFor(ctx, [
    ...new Set(chosen.map((c) => c.kernel.batchId)),
  ]);
  const examples = (
    await mapLimit(chosen, 8, async (c) => {
      const x = inputs.get(c.kernel.id);
      if (!x) return null;
      try {
        const image = await ctx.storage.get(c.kernel.cropKey);
        return {
          ref: c.kernel.id,
          label: c.label,
          weight: c.weight,
          batchRef: c.kernel.batchId,
          rel: x.slice(-REL),
          image: image.toString("base64"),
        };
      } catch {
        return null; // The crop is gone.
      }
    })
  ).filter((e) => e !== null);
  let sent = 0;
  for (let i = 0; i < examples.length; i += PER_MESSAGE) {
    const part = examples.slice(i, i + PER_MESSAGE);
    sent += part.length;
    await enqueue(ctx, sample.orgId, "training.examples", {
      central: { crop: sample.crop, examples: part },
    });
  }
  return sent;
}

/** Central server: keeps the kernels a station sent (a resent kernel replaces itself). */
export async function receiveTrainingExamples(
  ctx: AppContext,
  key: { id: string; orgId: string; name: string },
  data: z.infer<typeof TrainingExamplesData>,
): Promise<number> {
  const crop = data.crop.trim().toLowerCase();
  for (const e of data.examples) {
    const imageKey = `orgs/${key.orgId}/network/${key.id}/${e.ref}.jpg`;
    await ctx.storage.put(imageKey, Buffer.from(e.image, "base64"));
    const row = {
      orgId: key.orgId,
      keyId: key.id,
      station: key.name,
      ref: e.ref,
      crop,
      label: e.label,
      weight: e.weight,
      batchRef: e.batchRef,
      rel: e.rel,
      imageKey,
    };
    await ctx.db
      .insert(networkExamples)
      .values(row)
      .onConflictDoUpdate({
        target: [
          networkExamples.orgId,
          networkExamples.keyId,
          networkExamples.ref,
        ],
        set: { label: row.label, weight: row.weight, crop, rel: row.rel },
      });
  }
  return data.examples.length;
}

/** Central server: its current models, for its stations to download. */
export async function networkModels(ctx: AppContext, orgId: string) {
  return ctx.db
    .select({
      crop: localModels.crop,
      version: localModels.version,
      weights: localModels.weights,
      metrics: localModels.metrics,
      createdAt: localModels.createdAt,
    })
    .from(localModels)
    .where(
      and(
        eq(localModels.orgId, orgId),
        eq(localModels.active, true),
        eq(localModels.origin, "own"),
      ),
    );
}

const ModelList = z.object({
  items: z.array(
    z.object({
      crop: z.string(),
      version: z.number().int(),
    }),
  ),
});
const ModelOut = z.object({
  crop: z.string(),
  version: z.number().int(),
  weights: z.record(z.string(), z.unknown()),
  metrics: z.record(z.string(), z.unknown()),
});

/**
 * Station: downloads the central server's models that are newer than the
 * ones it has. Asks at most every half hour unless `force`; a failed
 * connection just waits for the next round. Returns how many it got.
 */
export async function pullNetworkModels(
  ctx: AppContext,
  options: { orgId?: string; force?: boolean } = {},
): Promise<number> {
  const orgs = await ctx.db
    .select({
      id: organizations.id,
      integration: organizations.integration,
      localModel: organizations.localModel,
    })
    .from(organizations)
    .where(options.orgId ? eq(organizations.id, options.orgId) : undefined);
  let pulled = 0;
  for (const org of orgs) {
    const { centralUrl, centralKey } = org.integration;
    if (!centralUrl || !centralKey) continue;
    const last = org.localModel.networkCheckedAt;
    if (
      !options.force &&
      last &&
      Date.now() - Date.parse(last) < CHECK_EVERY_MS
    )
      continue;
    const base = `${centralUrl.replace(/\/+$/, "")}/api/v1/local-models`;
    const get = async (url: string) => {
      const res = await (ctx.fetch ?? fetch)(url, {
        headers: {
          authorization: `Bearer ${centralKey}`,
          "user-agent": "AI-Grain/1",
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };
    try {
      const list = ModelList.parse(await get(base));
      for (const item of list.items) {
        const [have] = await ctx.db
          .select({ version: localModels.version })
          .from(localModels)
          .where(
            and(
              eq(localModels.orgId, org.id),
              eq(localModels.crop, item.crop),
              eq(localModels.origin, "network"),
            ),
          )
          .orderBy(desc(localModels.version))
          .limit(1);
        if (have && have.version >= item.version) continue;
        const model = ModelOut.parse(
          await get(`${base}/${encodeURIComponent(item.crop)}`),
        );
        await ctx.db.transaction(async (tx) => {
          await tx
            .update(localModels)
            .set({ active: false })
            .where(
              and(
                eq(localModels.orgId, org.id),
                eq(localModels.crop, model.crop),
                eq(localModels.origin, "network"),
              ),
            );
          await tx.insert(localModels).values({
            orgId: org.id,
            crop: model.crop,
            version: model.version,
            origin: "network",
            weights: model.weights as never,
            metrics: model.metrics as never,
          });
        });
        pulled++;
      }
      // Read again: a training may have started meanwhile.
      const [now] = await ctx.db
        .select({ localModel: organizations.localModel })
        .from(organizations)
        .where(eq(organizations.id, org.id));
      await ctx.db
        .update(organizations)
        .set({
          localModel: {
            ...now?.localModel,
            networkCheckedAt: new Date().toISOString(),
          },
        })
        .where(eq(organizations.id, org.id));
    } catch {
      // No connection, or the central server can't answer yet: next round.
    }
  }
  return pulled;
}
