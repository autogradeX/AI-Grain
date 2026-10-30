import { noteNetwork } from "../pwa/pwa";

/**
 * Fetch wrapper for the API. The access token lives only in memory; the
 * refresh token is an httpOnly cookie the browser sends to /api/auth. On a
 * 401 the client refreshes once (shared between concurrent requests) and
 * retries.
 */

/** fetch that tells the offline banner whether the server was reachable. */
async function trackedFetch(
  input: string,
  init: RequestInit,
): Promise<Response> {
  try {
    const res = await fetch(input, init);
    noteNetwork(true);
    return res;
  } catch (err) {
    noteNetwork(false);
    throw err;
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export interface Session {
  accessToken: string;
  expiresIn: number;
  user: CurrentUser;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "grader" | "viewer";
  emailVerified: boolean;
  org: { id: string; name: string };
}

let accessToken: string | null = null;
let refreshing: Promise<Session | null> | null = null;
let onSessionChange: (session: Session | null) => void = () => {};

export function setSessionListener(
  listener: (session: Session | null) => void,
) {
  onSessionChange = listener;
}

export function applySession(session: Session | null) {
  accessToken = session?.accessToken ?? null;
  onSessionChange(session);
}

async function parseError(res: Response): Promise<ApiError> {
  let body: {
    error?: string;
    code?: string;
    issues?: { path: string; message: string }[];
  } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // Not JSON: fall back to the status text.
  }
  const detail = body.issues
    ?.map((i) => `${i.path || "request"}: ${i.message}`)
    .join("; ");
  return new ApiError(
    res.status,
    detail
      ? `${body.error ?? "Invalid request"}: ${detail}`
      : (body.error ?? res.statusText),
    body.code,
    body.issues,
  );
}

/** Gets a new access token from the refresh cookie. Resolves to null when signed out. */
export function refreshSession(): Promise<Session | null> {
  refreshing ??= (async () => {
    try {
      // A just-rotated cookie is still accepted for a short grace period, so
      // a parallel refresh from another tab doesn't sign this one out.
      const res = await trackedFetch("/api/auth/refresh", {
        method: "POST",
        credentials: "same-origin",
      });
      if (res.ok) {
        const session = (await res.json()) as Session;
        applySession(session);
        return session;
      }
      applySession(null);
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function send(
  path: string,
  init: RequestInit,
  retry: boolean,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  const res = await trackedFetch(`/api${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    const session = await refreshSession();
    if (session) return send(path, init, false);
  }
  return res;
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await send(path, init, true);
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined && {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }),
});

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, json("POST", body ?? {})),
  put: <T>(path: string, body: unknown) => request<T>(path, json("PUT", body)),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, json("PATCH", body)),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) =>
    request<T>(path, { method: "POST", body: form }),
  /** Fetches a binary resource (image, PDF, ZIP) with the session's credentials. */
  async blob(path: string): Promise<Blob> {
    const res = await send(path, {}, true);
    if (!res.ok) throw await parseError(res);
    return res.blob();
  },
};

/** Downloads a protected file by turning it into a temporary link. */
export async function download(path: string, filename: string) {
  const blob = await api.blob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Opens a protected file (a PDF report) in a new tab. */
export async function openFile(path: string) {
  const win = window.open("", "_blank");
  const blob = await api.blob(path);
  const url = URL.createObjectURL(blob);
  if (win) win.location.href = url;
  else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
