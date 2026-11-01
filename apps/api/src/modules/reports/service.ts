import { createHash } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import QRCode from "qrcode";
import sharp from "sharp";
import type { AppContext } from "../../context.js";
import { batches, kernels, organizations, users } from "../../db/schema.js";
import { BOARD_WIDTH } from "../../imaging/board.js";
import { annotateBoard, cropKernels } from "../../imaging/sheets.js";
import { mapLimit } from "../../lib/jobs.js";
import {
  aiVerdict,
  aiVerdictConfidence,
  batchPrefix,
  effectiveClass,
  kernelSummary,
  modelFor,
} from "../batches/service.js";
import { currentCertificate } from "../certificates/service.js";
import { ensureCrop } from "../crops/service.js";
import { loadSample, type SampleRow } from "../samples/service.js";
import { getStandard } from "../standards/routes.js";
import { renderReport } from "./pdf.js";

/** Gallery pages show at most this many kernels. */
const GALLERY_MAX = 240;

const samplePrefix = (s: { orgId: string; id: string }) =>
  `orgs/${s.orgId}/samples/${s.id}`;

/**
 * Where a completed sample's report is kept. The key changes with anything
 * the report shows that can change after completion (a new certificate on
 * re-completion, a rewritten summary), so a stored report is never stale.
 */
function cacheKey(
  sample: SampleRow,
  cert: { code: string; version: number },
): string {
  const hash = createHash("sha256")
    .update(
      JSON.stringify([
        cert.code,
        cert.version,
        sample.aiSummary,
        sample.updatedAt.toISOString(),
        sample.completedAt?.toISOString() ?? null,
      ]),
    )
    .digest("hex")
    .slice(0, 16);
  return `${samplePrefix(sample)}/reports/${hash}.pdf`;
}

/**
 * The sample's PDF report. A completed sample's report is built once and
 * kept in storage, so opening it again is instant; a sample in progress is
 * built fresh each time.
 */
export async function reportPdf(
  ctx: AppContext,
  sample: SampleRow,
): Promise<Buffer> {
  const cert =
    sample.status === "completed"
      ? await currentCertificate(ctx, sample.id)
      : null;
  if (!cert) return buildReport(ctx, sample, null);
  const key = cacheKey(sample, cert);
  try {
    return await ctx.storage.get(key);
  } catch {
    // Not built yet.
  }
  const pdf = await buildReport(ctx, sample, cert);
  // Older versions of this sample's report are of no further use.
  await ctx.storage.remove(`${samplePrefix(sample)}/reports`);
  await ctx.storage.put(key, pdf);
  return pdf;
}

/** Builds the report ahead of time (when a sample completes), so the first download is instant too. */
export async function prepareReport(
  ctx: AppContext,
  sampleId: string,
  orgId: string,
): Promise<void> {
  const sample = await loadSample(ctx, orgId, sampleId);
  if (sample.status === "completed") await reportPdf(ctx, sample);
}

async function buildReport(
  ctx: AppContext,
  sample: SampleRow,
  cert: Awaited<ReturnType<typeof currentCertificate>> | null,
): Promise<Buffer> {
  const id = sample.id;
  const [org] = await ctx.db
    .select()
    .from(organizations)
    .where(eq(organizations.id, sample.orgId));
  const standard = sample.standardId
    ? await getStandard(ctx, sample.orgId, sample.standardId)
    : null;
  const operatorIds = [sample.createdBy, sample.completedBy].filter(
    (v): v is string => !!v,
  );
  const names = operatorIds.length
    ? await ctx.db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, operatorIds))
    : [];
  const nameOf = (uid: string | null) =>
    names.find((n) => n.id === uid)?.name ?? null;

  const batchRows = await ctx.db
    .select()
    .from(batches)
    .where(eq(batches.sampleId, id))
    .orderBy(asc(batches.createdAt));
  const batchIndex = new Map(batchRows.map((b, i) => [b.id, i + 1]));

  // Every kernel not judged sound: rings on the board pictures, and the gallery.
  const notSound = sql`coalesce(${effectiveClass}, '') <> 'sound'`;
  const flaggedRows = await ctx.db
    .select({
      batchId: kernels.batchId,
      number: kernels.number,
      cell: kernels.cell,
      x: kernels.x,
      y: kernels.y,
      w: kernels.w,
      h: kernels.h,
      cls: effectiveClass,
      aiClass: aiVerdict,
      aiConfidence: aiVerdictConfidence,
      finalClass: kernels.finalClass,
      reviewStatus: kernels.reviewStatus,
    })
    .from(kernels)
    .where(and(eq(kernels.sampleId, id), notSound));
  const ordered = flaggedRows.sort(
    (a, b) =>
      (batchIndex.get(a.batchId) ?? 0) - (batchIndex.get(b.batchId) ?? 0) ||
      a.number - b.number,
  );
  const shown = ordered.slice(0, GALLERY_MAX);

  // One board image per photo gives both its annotated picture and the
  // gallery crops: far fewer storage reads than one per kernel.
  const crops = new Map<string, Buffer>();
  const boards = (
    await mapLimit(batchRows, 2, async (b) => {
      if (!b.boardKey) return null;
      const prefix = batchPrefix(b);
      const marks = ordered.filter((k) => k.batchId === b.id && k.cls);
      const preview = await ctx.storage.get(`${prefix}/preview.jpg`);
      const inGallery = shown.filter((k) => k.batchId === b.id);
      if (inGallery.length) {
        const { data, info } = await sharp(await ctx.storage.get(b.boardKey))
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const cut = await cropKernels(
          {
            data,
            width: info.width,
            height: info.height,
            channels: info.channels,
          },
          inGallery,
          b.cropWindowCm ?? 1.6,
        );
        for (const [n, jpeg] of cut) crops.set(`${b.id}:${n}`, jpeg);
      }
      return {
        side: b.side,
        image: await annotateBoard(
          preview,
          BOARD_WIDTH,
          marks.map((m) => ({
            ...m,
            color: m.cls === "unclear" ? "#ffb300" : "#ff1744",
          })),
        ),
      };
    })
  ).filter((b): b is NonNullable<typeof b> => b !== null);

  const gallery = shown.flatMap((k) => {
    const jpeg = crops.get(`${k.batchId}:${k.number}`);
    return jpeg
      ? [
          {
            jpeg,
            number: k.number,
            cell: k.cell,
            batch: batchIndex.get(k.batchId) ?? 0,
            finalClass: k.finalClass,
            aiClass: k.aiClass,
            aiConfidence: k.aiConfidence,
            reviewed: k.reviewStatus !== "pending",
          },
        ]
      : [];
  });

  const crop = await ensureCrop(ctx, sample.orgId, sample.crop);
  const verifyUrl = cert ? `${ctx.config.APP_URL}/verify/${cert.code}` : null;
  return renderReport({
    orgName: org?.name ?? "",
    sample,
    standard: standard
      ? { name: standard.name, grades: standard.grades }
      : null,
    createdByName: nameOf(sample.createdBy),
    completedByName: nameOf(sample.completedBy),
    cropLabel: crop.label,
    classes: crop.classes,
    model: await modelFor(ctx, id),
    kernels: await kernelSummary(ctx, { sampleId: id }),
    boards,
    certificate:
      cert && verifyUrl
        ? {
            code: cert.code,
            version: cert.version,
            hash: cert.payloadHash,
            url: verifyUrl,
            qr: await QRCode.toBuffer(verifyUrl, {
              type: "png",
              margin: 1,
              width: 300,
            }),
          }
        : null,
    gallery,
    galleryTotal: ordered.length,
  });
}
