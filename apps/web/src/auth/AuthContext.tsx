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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    setSessionListener((session) => setUser(session?.user ?? null));
    void refreshSession().finally(() => setLoading(false));
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
