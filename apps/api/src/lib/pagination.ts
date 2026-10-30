import { z } from "zod";

/**
 * Server-side pagination for list endpoints: `?limit=&offset=` in, and
 * `{ items, total, limit, offset }` out, so a client can show "21–40 of 312"
 * and page without loading everything.
 */
export function pageQuery(defaultLimit = 25, maxLimit = 100) {
  return {
    limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
    offset: z.coerce.number().int().min(0).default(0),
  };
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export function page<T>(
  items: T[],
  total: number | undefined,
  q: { limit: number; offset: number },
): Page<T> {
  return { items, total: total ?? 0, limit: q.limit, offset: q.offset };
}

/** A search term as an ILIKE pattern, with the wildcard characters escaped. */
export function likePattern(term: string): string {
  return `%${term.replace(/[%_\\]/g, "\\$&")}%`;
}
