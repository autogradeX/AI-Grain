import { SOUND, UNCLEAR, classLabel, type ClassDef } from "@ai-grain/core";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner-dot" aria-hidden /> {label}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Something went wrong";
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
  if (!cls) return <Badge>not classified</Badge>;
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
        Image unavailable
      </div>
    );
  if (!current)
    return <div className={`img-placeholder ${className ?? ""}`} aria-busy />;
  return <img src={current.url ?? ""} alt={alt} className={className} />;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function pct(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined
    ? "—"
    : `${value.toFixed(digits)} %`;
}
