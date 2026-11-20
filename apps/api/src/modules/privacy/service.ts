import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import type { AppContext } from "../../context.js";
import { organizations, outbox, samples } from "../../db/schema.js";
import { normaliseMobile } from "../integration/farmer.js";

/*
 * Farmers' personal data (India's Digital Personal Data Protection Act):
 * a sample keeps the farmer's name, ID and mobile only as long as needed.
 * An admin can give a farmer everything held about them, erase it on
 * request, and set how long it is kept. Results, grades and certificates
 * stay: they are about the grain, not the person. A certificate already
 * issued keeps the lot as it was signed (its public page never shows the
 * mobile, and only the last characters of the farmer ID).
 */

/** Who a request is about: their mobile, their farmer ID, or both. */
export interface FarmerRef {
  mobile?: string | undefined;
  farmerId?: string | undefined;
}

/** The organisation's samples with this farmer's details. */
export async function samplesOfFarmer(
  ctx: AppContext,
  orgId: string,
  ref: FarmerRef,
) {
  const rows = await ctx.db
    .select({
      id: samples.id,
      number: samples.number,
      crop: samples.crop,
      status: samples.status,
      createdAt: samples.createdAt,
      completedAt: samples.completedAt,
      enamLotId: samples.enamLotId,
      gateEntryNo: samples.gateEntryNo,
      farmerName: samples.farmerName,
      farmerId: samples.farmerId,
      farmerMobile: samples.farmerMobile,
      farmerConsent: samples.farmerConsent,
      result: samples.result,
    })
    .from(samples)
    .where(
      and(
        eq(samples.orgId, orgId),
        or(isNotNull(samples.farmerMobile), isNotNull(samples.farmerId)),
      ),
    );
  const mobile = ref.mobile ? normaliseMobile(ref.mobile) : null;
  const id = ref.farmerId?.trim().toLowerCase() || null;
  return rows.filter(
    (r) =>
      (mobile !== null &&
        r.farmerMobile !== null &&
        normaliseMobile(r.farmerMobile) === mobile) ||
      (id !== null && r.farmerId?.trim().toLowerCase() === id),
  );
}

const CLEARED = {
  farmerName: null,
  farmerId: null,
  farmerMobile: null,
  farmerConsent: false,
} as const;

/** Clears the farmer's details on these samples and drops messages not yet sent to them. */
async function clearFarmer(ctx: AppContext, orgId: string, ids: string[]) {
  if (!ids.length) return;
  await ctx.db
    .update(samples)
    .set(CLEARED)
    .where(and(eq(samples.orgId, orgId), inArray(samples.id, ids)));
  const pending = await ctx.db
    .select({ id: outbox.id, payload: outbox.payload })
    .from(outbox)
    .where(
      and(
        eq(outbox.orgId, orgId),
        eq(outbox.target, "farmer"),
        isNull(outbox.deliveredAt),
      ),
    );
  const gone = pending
    .filter((r) => ids.includes(String(r.payload.sampleId)))
    .map((r) => r.id);
  if (gone.length) await ctx.db.delete(outbox).where(inArray(outbox.id, gone));
}

/** Erases a farmer's details from every sample of the organisation. Returns how many. */
export async function eraseFarmer(
  ctx: AppContext,
  orgId: string,
  ref: FarmerRef,
): Promise<number> {
  const ids = (await samplesOfFarmer(ctx, orgId, ref)).map((r) => r.id);
  await clearFarmer(ctx, orgId, ids);
  return ids.length;
}

/**
 * Clears farmers' details on samples completed longer ago than each
 * organisation keeps them. Run by the sweeper; returns how many samples.
 */
export async function purgeExpiredFarmerData(ctx: AppContext): Promise<number> {
  const orgs = await ctx.db
    .select({ id: organizations.id, privacy: organizations.privacy })
    .from(organizations);
  let cleared = 0;
  for (const org of orgs) {
    const days = org.privacy.farmerRetentionDays;
    if (!days) continue;
    const before = new Date(Date.now() - days * 86_400_000);
    const rows = await ctx.db
      .select({ id: samples.id })
      .from(samples)
      .where(
        and(
          eq(samples.orgId, org.id),
          eq(samples.status, "completed"),
          lt(samples.completedAt, before),
          or(
            isNotNull(samples.farmerName),
            isNotNull(samples.farmerId),
            isNotNull(samples.farmerMobile),
          ),
        ),
      )
      .limit(500);
    await clearFarmer(
      ctx,
      org.id,
      rows.map((r) => r.id),
    );
    cleared += rows.length;
  }
  return cleared;
}
