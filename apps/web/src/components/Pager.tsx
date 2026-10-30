import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useT } from "../i18n";
import { m } from "./Pager.i18n";

/**
 * The current page of a server-paginated list, kept in the URL (?page=2) so
 * links, reloads and the back button keep the place. Page 0 is the first.
 */
export function usePage(param = "page"): [number, (page: number) => void] {
  const [params, setParams] = useSearchParams();
  const page = Math.max(0, (Number(params.get(param)) || 1) - 1);
  const setPage = useCallback(
    (next: number) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next > 0) p.set(param, String(next + 1));
          else p.delete(param);
          return p;
        },
        { preventScrollReset: true },
      ),
    [param, setParams],
  );
  return [page, setPage];
}

/** A value that follows `value` once it has stopped changing, e.g. a search box. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Page numbers to show: first, last, and a window around the current page. */
function pageSlots(current: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const start = Math.max(1, Math.min(current - 1, count - 5));
  const end = Math.min(count - 2, Math.max(current + 1, 4));
  const slots: (number | null)[] = [0];
  if (start > 1) slots.push(null);
  for (let i = start; i <= end; i++) slots.push(i);
  if (end < count - 2) slots.push(null);
  slots.push(count - 1);
  return slots;
}

/** Previous / numbered pages / next, with "21–40 of 312". Hidden for a single page. */
export function Pager({
  total,
  limit,
  page,
  onPage,
}: {
  total: number;
  limit: number;
  page: number;
  onPage: (page: number) => void;
}) {
  const t = useT(m);
  const count = Math.ceil(total / limit);
  if (count <= 1) return null;
  const go = (p: number) => {
    onPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <nav className="pager" aria-label={t("pagination")}>
      <span className="pager-range muted small">
        {t("range", {
          from: page * limit + 1,
          to: Math.min(total, (page + 1) * limit),
          total,
        })}
      </span>
      <div className="pager-buttons">
        <button
          className="pager-step"
          disabled={page === 0}
          onClick={() => go(page - 1)}
        >
          <ChevronLeft size={16} aria-hidden />
          <span>{t("previous")}</span>
        </button>
        <ol className="pager-pages">
          {pageSlots(page, count).map((p, i) =>
            p === null ? (
              <li key={`gap${i}`} className="pager-gap" aria-hidden>
                …
              </li>
            ) : (
              <li key={p}>
                <button
                  className={p === page ? "active" : ""}
                  aria-current={p === page ? "page" : undefined}
                  aria-label={t("page", { page: p + 1 })}
                  onClick={() => go(p)}
                >
                  {p + 1}
                </button>
              </li>
            ),
          )}
        </ol>
        <button
          className="pager-step"
          disabled={page >= count - 1}
          onClick={() => go(page + 1)}
        >
          <span>{t("next")}</span>
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
    </nav>
  );
}
