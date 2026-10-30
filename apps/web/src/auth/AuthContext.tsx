import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  applySession,
  refreshSession,
  setSessionListener,
  type CurrentUser,
  type Session,
} from "../api/client";

interface AuthState {
  user: CurrentUser | null;
  /** True until the first refresh attempt has finished. */
  loading: boolean;
  signIn: (session: Session) => void;
  signOut: () => Promise<void>;
  setUser: (user: CurrentUser) => void;
}

const AuthContext = createContext<AuthState | null>(null);

/*
 * The signed-in user's profile (no tokens), so an installed app opened
 * without signal still shows its screens instead of the sign-in page.
 */
const USER_KEY = "ai-grain.user";

function rememberUser(user: CurrentUser | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // Without storage the app simply needs a connection to start.
  }
}

function rememberedUser(): CurrentUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    setSessionListener((session) => {
      setUser(session?.user ?? null);
      rememberUser(session?.user ?? null);
    });
    void refreshSession()
      // No network (not a rejected session): open with the remembered user.
      .catch(() => setUser(rememberedUser()))
      .finally(() => setLoading(false));
    // Back online: get a fresh session for the requests that follow.
    const onOnline = () => void refreshSession().catch(() => undefined);
    addEventListener("online", onOnline);
    return () => removeEventListener("online", onOnline);
  }, []);

  // Refresh well before the access token expires, so pages rarely see a 401 mid-task.
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => void refreshSession(), 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [user]);

  const signIn = useCallback((session: Session) => applySession(session), []);
  const signOut = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      applySession(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, setUser }),
    [user, loading, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function useCan() {
  const { user } = useAuth();
  return {
    write: user?.role === "admin" || user?.role === "grader",
    admin: user?.role === "admin",
  };
}
