import type { Db } from "../db/client.js";
import { auditLog } from "../db/schema.js";

export async function audit(
  db: Db,
  entry: {
    orgId?: string | null;
    userId?: string | null;
    action: string;
    detail?: Record<string, unknown>;
    ip?: string | null;
  },
): Promise<void> {
  await db.insert(auditLog).values({
    orgId: entry.orgId ?? null,
    userId: entry.userId ?? null,
    action: entry.action,
    detail: entry.detail ?? null,
    ip: entry.ip ?? null,
  });
}
