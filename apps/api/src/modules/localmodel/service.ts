import { kernelClassIds, SOUND, UNCLEAR } from "@ai-grain/core";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { AppContext } from "../../context.js";
import {
  analysisRuns,
  batches,
  crops,
  kernels,
  localModels,
  networkExamples,
  organizations,
  samples,
  type LocalModelMetrics,
  type LocalModelSettings,
} from "../../db/schema.js";
import { augment, variantsFor } from "../../imaging/embedder.js";
import {
  CROP_FEATURES,
  cropFeatures,
  MODEL_FEATURES,
  modelFeatures,
  type KernelForModel,
} from "../../imaging/features.js";
import { mapLimit } from "../../lib/jobs.js";
import { mix } from "../batches/service.js";
import { ensureCrop } from "../crops/service.js";
import { evaluate, verdictOf, type Example } from "./model.js";
import { trainOffThread } from "./thread.js";

/** A class needs this many labelled kernels to be learned; fewer are left out. */
export const MIN_PER_CLASS = 12;
/** And the model needs this many labelled kernels in all. */
export const MIN_TOTAL = 100;
/** An AI verdict nobody checked counts this much, against 1 for a person's decision. */
const AI_LABEL_WEIGHT = 0.5;

export class NotEnoughDataError extends Error {}

/**
 * The bar a model must clear, on photos it didn't learn from, before it
 * classifies anything: it catches most defects, and its confident verdicts
 * are nearly always right (those are the ones no person checks).
 */
export const QUALITY_BAR = {
  defectRecall: 0.8,
  highAccuracy: 0.95,
  validatedOn: 20,
  /** A confident verdict for a class it gets right less often is checked by a person. */
  classPrecision: 0.9,
};

/** Why a model isn't good enough to use yet; empty when it is. */
export function shortfalls(metrics: LocalModelMetrics): string[] {
  const out: string[] = [];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  if (metrics.validatedOn < QUALITY_BAR.validatedOn)
    out.push(
      `checked on only ${metrics.validatedOn} kernels (needs ${QUALITY_BAR.validatedOn})`,
    );
  if (metrics.defectRecall < QUALITY_BAR.defectRecall)
    out.push(
      `catches ${pct(metrics.defectRecall)} of defects (needs ${pct(QUALITY_BAR.defectRecall)})`,
    );
  if (metrics.highAccuracy < QUALITY_BAR.highAccuracy)
    out.push(
      `confident verdicts ${pct(metrics.highAccuracy)} right (needs ${pct(QUALITY_BAR.highAccuracy)})`,
    );
  return out;
}

export async function localModelSettings(
  ctx: AppContext,
  orgId: string,
): Promise<{ mode: NonNullable<LocalModelSettings["mode"]> }> {
  const [org] = await ctx.db
    .select({ localModel: organizations.localModel })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  return { mode: org?.localModel.mode ?? "offline" };
}

/** The active model of each origin for a crop (this organisation's own, and the network's). */
export async function activeModels(
  ctx: AppContext,
  orgId: string,
  crop: string,
) {
  return ctx.db
    .select()
    .from(localModels)
    .where(
      and(
        eq(localModels.orgId, orgId),
        eq(localModels.crop, crop),
        eq(localModels.active, true),
      ),
    )
    .orderBy(desc(localModels.version));
}

/** Whether this machine can run a model: its image model must be installed. */
export const canRun = (
  ctx: AppContext,
  weights: { input?: string | undefined },
) =>
  !weights.input ||
  weights.input === FEATURES ||
  weights.input === ctx.embedder?.name;

/**
 * The model that classifies a crop's kernels here: the network's when it
 * clears the bar (trained on every station's kernels), else this
 * organisation's own; null when neither does.
 */
export async function usableModel(
  ctx: AppContext,
  orgId: string,
  crop: string,
) {
  const models = await activeModels(ctx, orgId, crop);
  const order = [
    ...models.filter((m) => m.origin === "network"),
    ...models.filter((m) => m.origin !== "network"),
  ];
  return (
    order.find(
      (m) => canRun(ctx, m.weights) && shortfalls(m.metrics).length === 0,
    ) ?? null
  );
}

type KernelRow = typeof kernels.$inferSelect;

/** Measures crops detected before features existed, and saves them. */
async function backfill(ctx: AppContext, rows: KernelRow[]) {
  const missing = rows.filter((k) => !k.features);
  await mapLimit(missing, 8, async (k) => {
    try {
      const f = await cropFeatures(await ctx.storage.get(k.cropKey));
      k.features = f;
      await ctx.db
        .update(kernels)
        .set({ features: f })
        .where(eq(kernels.id, k.id));
    } catch {
      // The crop is gone: the kernel is left out.
    }
  });
}

/** Model inputs for every kernel of these batches, by kernel id. */
export async function inputsFor(
  ctx: AppContext,
  batchIds: string[],
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  for (let i = 0; i < batchIds.length; i += 50) {
    const rows = await ctx.db
      .select()
      .from(kernels)
      .where(inArray(kernels.batchId, batchIds.slice(i, i + 50)));
    await backfill(ctx, rows);
    const byBatch = new Map<string, KernelRow[]>();
    for (const r of rows)
      byBatch.set(r.batchId, [...(byBatch.get(r.batchId) ?? []), r]);
    for (const list of byBatch.values()) {
      const usable = list.filter((k) => k.features);
      const x = modelFeatures(
        usable.map((k): KernelForModel => ({
          features: k.features!,
          area: k.area,
          lengthMm: k.lengthMm,
          widthMm: k.widthMm,
          isCluster: k.isCluster,
        })),
      );
      usable.forEach((k, n) => out.set(k.id, x[n]!));
    }
  }
  return out;
}

/** The label a kernel teaches the model, and how much it counts; null when it teaches nothing. */
export function labelOf(
  k: KernelRow,
): { label: string; weight: number } | null {
  if (k.isCluster) return null;
  if (k.reviewStatus !== "pending") {
    const label = k.finalClass ?? k.expertClass ?? k.aiClass;
    return label && label !== UNCLEAR ? { label, weight: 1 } : null;
  }
  // Settled by Model Orchestration without a person (never the local model's own verdicts).
  if (k.flagReason === null && k.aiClass && k.aiSource !== "local") {
    const label = k.expertClass ?? k.aiClass;
    return label !== UNCLEAR ? { label, weight: AI_LABEL_WEIGHT } : null;
  }
  return null;
}

/** The organisation's labelled kernels of a crop, and how many per class. */
export async function dataset(ctx: AppContext, orgId: string, crop: string) {
  const rows = await ctx.db
    .select({ kernel: kernels })
    .from(kernels)
    .innerJoin(samples, eq(samples.id, kernels.sampleId))
    .where(
      and(
        eq(kernels.orgId, orgId),
        eq(samples.crop, crop),
        eq(kernels.isCluster, false),
        sql`${kernels.aiClass} is not null or ${kernels.finalClass} is not null`,
      ),
    );
  const labelled = rows
    .map((r) => ({ kernel: r.kernel, label: labelOf(r.kernel) }))
    .filter(
      (
        r,
      ): r is { kernel: KernelRow; label: { label: string; weight: number } } =>
        r.label !== null,
    );
  const counts: Record<
    string,
    { reviewed: number; settled: number; network: number }
  > = {};
  const count = (label: string) =>
    (counts[label] ??= { reviewed: 0, settled: 0, network: 0 });
  for (const { label } of labelled) {
    const c = count(label.label);
    if (label.weight === 1) c.reviewed++;
    else c.settled++;
  }
  // Kernels the network's stations sent (on a central server).
  const network = await ctx.db
    .select()
    .from(networkExamples)
    .where(
      and(eq(networkExamples.orgId, orgId), eq(networkExamples.crop, crop)),
    );
  for (const n of network) count(n.label).network++;
  return { labelled, network, counts };
}

/** All labelled kernels of a crop, own and from stations, by class. */
export const totalOf = (c: {
  reviewed: number;
  settled: number;
  network: number;
}) => c.reviewed + c.settled + c.network;

/** One labelled kernel for training, from this organisation or a station. */
interface Item {
  id: string;
  label: string;
  weight: number;
  /** Photo it came from (whole photos are held back for checking). */
  batchId: string;
  human: boolean;
  image: () => Promise<Buffer>;
  /** Measurement inputs (crop and photo-relative), when known. */
  measured?: number[];
  /** Size and colour relative to its photo. */
  rel?: number[];
}

/** Model inputs for kernel measurements; the image model's name otherwise. */
export const FEATURES = "features";
/** The last values of the measurement inputs: size and colour relative to the photo. */
export const REL = MODEL_FEATURES.length - CROP_FEATURES.length;

/** At most this many real kernels of a class take part in one training. */
const PER_CLASS_CAP = 1000;

/**
 * Trains a new version of the crop's local model on the organisation's
 * labelled kernels (and, on a central server, those its stations sent),
 * checks it on a fifth of the photos it didn't train on, and makes it the
 * active one.
 *
 * With the image model installed, each crop is described by MobileNetV2 and
 * rare classes are filled up to about 1000 training examples with turned,
 * mirrored and relit copies of their real crops. Checking uses real,
 * unaltered crops only.
 */
export async function trainLocalModel(
  ctx: AppContext,
  orgId: string,
  crop: string,
  by: string | null,
) {
  const { labelled, network } = await dataset(ctx, orgId, crop);
  // The crop's classes here (from its preset when nothing was assayed here yet).
  const cropRow = await ensureCrop(ctx, orgId, crop);
  const known = new Set(kernelClassIds(cropRow.classes));
  const items: Item[] = [
    ...labelled.map((r): Item => ({
      id: r.kernel.id,
      label: r.label.label,
      weight: r.label.weight,
      batchId: r.kernel.batchId,
      human: r.label.weight === 1,
      image: () => ctx.storage.get(r.kernel.cropKey),
    })),
    // From stations: only classes this crop has here.
    ...network
      .filter((n) => known.has(n.label))
      .map((n): Item => ({
        id: n.id,
        label: n.label,
        weight: n.weight,
        batchId: `${n.keyId}:${n.batchRef}`,
        human: n.weight === 1,
        image: () => ctx.storage.get(n.imageKey),
        rel: n.rel,
      })),
  ];
  const perClass = new Map<string, number>();
  for (const r of items)
    perClass.set(r.label, (perClass.get(r.label) ?? 0) + 1);
  const kept = new Set(
    [...perClass].filter(([, n]) => n >= MIN_PER_CLASS).map(([c]) => c),
  );
  const leftOut = Object.fromEntries(
    [...perClass].filter(([c]) => !kept.has(c)),
  );
  // At most so many real kernels per class (sound kernels can be many
  // thousands): keeps training to about a minute, every class well seen.
  const cap = new Map<string, number>();
  const usable = items
    .filter((r) => kept.has(r.label))
    .sort((a, b) => mix(a.id) - mix(b.id))
    .filter((r) => {
      const n = (cap.get(r.label) ?? 0) + 1;
      cap.set(r.label, n);
      return n <= PER_CLASS_CAP;
    });
  if (usable.length < MIN_TOTAL || kept.size < 2) {
    throw new NotEnoughDataError(
      `Not enough checked kernels yet: ${usable.length} of at least ${MIN_TOTAL}, in at least 2 classes with ${MIN_PER_CLASS} or more each.`,
    );
  }
  // This organisation's kernels: measured on their own photo.
  const own = new Set(labelled.map((r) => r.kernel.id));
  const inputs = await inputsFor(ctx, [
    ...new Set(usable.filter((r) => own.has(r.id)).map((r) => r.batchId)),
  ]);
  for (const r of usable) {
    const x = inputs.get(r.id);
    if (x) {
      r.measured = x;
      r.rel = x.slice(-REL);
    }
  }

  // Checking: whole photos the model never saw (a fifth), so its score
  // reflects new photos, and preferably kernels a person decided.
  const batchIds = [...new Set(usable.map((e) => e.batchId))];
  const held =
    batchIds.length >= 5
      ? new Set(batchIds.filter((id) => mix(`${id}:val`) < 0.2))
      : new Set<string>();
  const isHeld = (e: Item) =>
    held.size ? held.has(e.batchId) : mix(`${e.id}:val`) < 0.2;
  const trainItems = usable.filter((e) => !isHeld(e));
  let checkItems = usable.filter((e) => isHeld(e) && e.human);
  if (checkItems.length < 20) checkItems = usable.filter(isHeld);

  const embedder = ctx.embedder ?? null;
  const input = embedder?.name ?? FEATURES;
  const trainCount = new Map<string, number>();
  for (const r of trainItems)
    trainCount.set(r.label, (trainCount.get(r.label) ?? 0) + 1);

  /** Model inputs for an item: the original and `variants - 1` altered copies. */
  const inputsOf = async (r: Item, variants: number): Promise<number[][]> => {
    if (!r.rel) return [];
    let image: Buffer;
    try {
      image = await r.image();
    } catch {
      return []; // The crop is gone.
    }
    if (!embedder) {
      const x = r.measured ?? [...(await cropFeatures(image)), ...r.rel];
      return [x];
    }
    const copies = await Promise.all(
      Array.from({ length: variants }, (_, v) => augment(image, v)),
    );
    const vectors = await embedder.embed(copies);
    return vectors.map((e) => [...e, ...r.rel!]);
  };
  const toExamples = async (list: Item[], augmented: boolean) =>
    (
      await mapLimit(list, 4, async (r) => {
        const variants =
          augmented && embedder
            ? variantsFor(trainCount.get(r.label) ?? 1, PER_CLASS_CAP)
            : 1;
        return (await inputsOf(r, variants)).map((x): Example => ({
          x,
          label: r.label,
          weight: r.weight,
        }));
      })
    ).flat();
  const trainSet = await toExamples(trainItems, true);
  const validation = await toExamples(checkItems, false);
  if (!trainSet.length)
    throw new NotEnoughDataError("The kernels' crop images couldn't be read.");
  const weights = {
    ...(await trainOffThread(trainSet, { validation, seed: 7 })),
    input,
  };
  const metrics = {
    ...evaluate(weights, validation, SOUND),
    trainedOn: trainSet.length,
    validatedOn: validation.length,
    leftOut,
    realKernels: trainItems.length,
    fromStations: usable.filter((r) => !own.has(r.id)).length,
    stations: new Set(network.map((n) => n.keyId)).size,
  };
  const [last] = await ctx.db
    .select({ version: localModels.version })
    .from(localModels)
    .where(
      and(
        eq(localModels.orgId, orgId),
        eq(localModels.crop, crop),
        eq(localModels.origin, "own"),
      ),
    )
    .orderBy(desc(localModels.version))
    .limit(1);
  await ctx.db
    .update(localModels)
    .set({ active: false })
    .where(
      and(
        eq(localModels.orgId, orgId),
        eq(localModels.crop, crop),
        eq(localModels.origin, "own"),
      ),
    );
  const [row] = await ctx.db
    .insert(localModels)
    .values({
      orgId,
      crop,
      version: (last?.version ?? 0) + 1,
      weights,
      metrics,
      createdBy: by,
    })
    .returning();
  return row!;
}

/**
 * Classifies a batch's unclassified kernels with the crop's local model, on
 * this machine. Returns false when there is no model for the crop.
 */
export async function classifyLocally(
  ctx: AppContext,
  batchId: string,
): Promise<boolean> {
  const [row] = await ctx.db
    .select({ batch: batches, sample: samples })
    .from(batches)
    .innerJoin(samples, eq(samples.id, batches.sampleId))
    .where(eq(batches.id, batchId));
  if (!row) return false;
  // None good enough yet: the photo waits for Model Orchestration instead.
  const model = await usableModel(ctx, row.sample.orgId, row.sample.crop);
  if (!model) return false;
  const started = Date.now();
  const measured = await inputsFor(ctx, [batchId]);
  const todo = await ctx.db
    .select({ id: kernels.id, cropKey: kernels.cropKey })
    .from(kernels)
    .where(and(eq(kernels.batchId, batchId), isNull(kernels.aiClass)));
  let inputs = measured;
  const embedder = ctx.embedder;
  if (model.weights.input && model.weights.input !== FEATURES && embedder) {
    // The image model's description of each crop, then size and colour.
    inputs = new Map();
    const ready = todo.filter((k) => measured.has(k.id));
    const images = await mapLimit(ready, 8, (k) =>
      ctx.storage.get(k.cropKey).catch(() => null),
    );
    const present = ready.filter((_, i) => images[i]);
    const vectors = await embedder.embed(
      images.filter((b): b is Buffer => b !== null),
    );
    present.forEach((k, i) =>
      inputs.set(k.id, [...vectors[i]!, ...measured.get(k.id)!.slice(-REL)]),
    );
  }
  const pct = (p: number) => Math.round(p * 100);
  // A network model may know classes this organisation doesn't use here.
  const [cropRow] = await ctx.db
    .select({ classes: crops.classes })
    .from(crops)
    .where(
      and(eq(crops.orgId, row.sample.orgId), eq(crops.key, row.sample.crop)),
    );
  const known = new Set(kernelClassIds(cropRow?.classes ?? []));
  await ctx.db.transaction(async (tx) => {
    for (const k of todo) {
      const x = inputs.get(k.id);
      let v = x
        ? verdictOf(model.weights, x)
        : { cls: UNCLEAR, p: 0, confidence: "low" as const };
      if (!known.has(v.cls)) v = { cls: UNCLEAR, p: 0, confidence: "low" };
      // A class it often gets wrong isn't settled on its word, however sure it is.
      const precision = model.metrics.perClass[v.cls]?.precision ?? 0;
      if (v.confidence === "high" && precision < QUALITY_BAR.classPrecision)
        v.confidence = "medium";
      await tx
        .update(kernels)
        .set({
          aiClass: v.cls,
          aiConfidence: v.confidence,
          aiSource: "local",
          aiReason: x
            ? `${model.origin === "network" ? "Network" : "Local"} model v${model.version} (offline), ${pct(v.p)}% sure`
            : "Local model: the crop couldn't be measured",
        })
        .where(eq(kernels.id, k.id));
    }
  });
  await ctx.db.insert(analysisRuns).values({
    orgId: row.sample.orgId,
    sampleId: row.sample.id,
    batchId,
    kind: "local",
    model: `${model.origin === "network" ? "network" : "local"}-v${model.version}`,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    durationMs: Date.now() - started,
  });
  return true;
}

/** What the Local model page shows for a crop. */
export async function localModelStatus(
  ctx: AppContext,
  orgId: string,
  crop: string,
) {
  const { counts } = await dataset(ctx, orgId, crop);
  const select = {
    id: localModels.id,
    version: localModels.version,
    metrics: localModels.metrics,
    active: localModels.active,
    createdAt: localModels.createdAt,
    input: sql<string>`coalesce(${localModels.weights} ->> 'input', 'features')`,
  };
  const versions = await ctx.db
    .select(select)
    .from(localModels)
    .where(
      and(
        eq(localModels.orgId, orgId),
        eq(localModels.crop, crop),
        eq(localModels.origin, "own"),
      ),
    )
    .orderBy(desc(localModels.version))
    .limit(10);
  // The network's model, downloaded from the central server.
  const [network] = await ctx.db
    .select(select)
    .from(localModels)
    .where(
      and(
        eq(localModels.orgId, orgId),
        eq(localModels.crop, crop),
        eq(localModels.origin, "network"),
        eq(localModels.active, true),
      ),
    )
    .limit(1);
  const inUse = await usableModel(ctx, orgId, crop);
  const [org] = await ctx.db
    .select({ integration: organizations.integration })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  const [used] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(kernels)
    .innerJoin(samples, eq(samples.id, kernels.sampleId))
    .where(
      and(
        eq(kernels.orgId, orgId),
        eq(samples.crop, crop),
        eq(kernels.aiSource, "local"),
        ne(kernels.reviewStatus, "pending"),
      ),
    );
  return {
    settings: await localModelSettings(ctx, orgId),
    // For each version: why it can't be used yet (empty: it can).
    versions: versions.map((v) => ({
      ...v,
      shortfalls: shortfalls(v.metrics),
    })),
    network: network
      ? {
          ...network,
          shortfalls: [
            ...shortfalls(network.metrics),
            ...(canRun(ctx, { input: network.input })
              ? []
              : ["the image model isn't installed on this machine"]),
          ],
        }
      : null,
    /** Which model classifies here: "network", "own", or none. */
    inUse: inUse ? inUse.origin : null,
    /** Connected to a central server: its network model is downloaded. */
    connected: !!(org?.integration.centralUrl && org.integration.centralKey),
    /** The image model (MobileNetV2) is installed here. */
    imageModel: ctx.embedder?.name ?? null,
    counts,
    minimum: { perClass: MIN_PER_CLASS, total: MIN_TOTAL },
    reviewedLocalVerdicts: used?.n ?? 0,
  };
}
