import { SOUND, UNCLEAR, type ClassDef } from "@ai-grain/core";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { common, useGrainLabels } from "../i18n/common";
import { defineMessages, locale, useT } from "../i18n";

const m = defineMessages({
  somethingWrong: { en: "Something went wrong", hi: "कुछ गड़बड़ हो गई" },
  imageUnavailable: { en: "Image unavailable", hi: "चित्र उपलब्ध नहीं" },
});

export function Spinner({ label }: { label?: string }) {
  const t = useT(common);
  return (
    <div className="spinner" role="status">
      <span className="spinner-dot" aria-hidden /> {label ?? t("loading")}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const t = useT(m);
  if (!error) return null;
  // Server messages are in English; the API has no translations.
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : t("somethingWrong");
  return (
    <p className="error" role="alert">
      {message}
    </p>
  );
}

export function Card({
  title,
  actions,
  children,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      {/* The hint sits outside the label so it doesn't become part of the input's accessible name. */}
      <label className="field">
        <span className="field-label">{label}</span>
        {children}
      </label>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "bad" | "info";
  children: ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function ClassBadge({
  cls,
  classes,
}: {
  cls: string | null;
  classes: readonly ClassDef[];
}) {
  const { classLabel } = useGrainLabels();
  if (!cls) return <Badge>{classLabel(classes, null)}</Badge>;
  const tone = cls === SOUND ? "good" : cls === UNCLEAR ? "warn" : "bad";
  return <Badge tone={tone}>{classLabel(classes, cls)}</Badge>;
}

export const CLASS_COLORS: Record<string, string> = {
  sound: "#43a047",
  unclear: "#ffb300",
  cluster: "#8e24aa",
  pending: "#90a4ae",
  defect: "#e53935",
};

/** An image behind authentication, loaded as a blob. */
export function AuthImage({
  path,
  alt,
  className,
}: {
  path: string;
  alt: string;
  className?: string;
}) {
  const t = useT(m);
  const [loaded, setLoaded] = useState<{
    path: string;
    url: string | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    api
      .blob(path)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ path, url: objectUrl });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ path, url: null });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  // Results for an earlier path don't count while the new one loads.
  const current = loaded?.path === path ? loaded : null;
  if (current && !current.url)
    return (
      <div className={`img-placeholder ${className ?? ""}`}>
        {t("imageUnavailable")}
      </div>
    );
  if (!current)
    return <div className={`img-placeholder ${className ?? ""}`} aria-busy />;
  return <img src={current.url ?? ""} alt={alt} className={className} />;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(locale(), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function pct(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined
    ? "—"
    : `${value.toFixed(digits)} %`;
}
