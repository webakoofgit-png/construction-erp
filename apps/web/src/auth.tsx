import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./lib/api";
import type { AppRole } from "./lib/permissions";

type Session = { token: string; user: { id: string; name: string; email: string }; organizationId: string; role: AppRole };
type AuthContextValue = { session: Session | null; signIn: (email: string, password: string) => Promise<void>; register: (name: string, organizationName: string, email: string, password: string) => Promise<void>; signOut: () => void };
const AuthContext = createContext<AuthContextValue | null>(null);
const sessionKey = "kravient-session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    const saved = localStorage.getItem(sessionKey);
    if (saved) { try { setSession(JSON.parse(saved) as Session); } catch { localStorage.removeItem(sessionKey); } }
    const expireSession = () => { localStorage.removeItem(sessionKey); setSession(null); };
    window.addEventListener("kravient-session-expired", expireSession);
    return () => window.removeEventListener("kravient-session-expired", expireSession);
  }, []);
  const saveSession = (nextSession: Session) => { localStorage.setItem(sessionKey, JSON.stringify(nextSession)); setSession(nextSession); };
  const value = useMemo(() => ({
    session,
    signIn: async (email: string, password: string) => saveSession(await api<Session>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) })),
    register: async (name: string, organizationName: string, email: string, password: string) => saveSession(await api<Session>("/auth/register", { method: "POST", body: JSON.stringify({ name, organizationName, email, password }) })),
    signOut: () => { localStorage.removeItem(sessionKey); setSession(null); }
  }), [session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
