import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, getToken, setToken } from "../api/client";
import type { SelfProfile } from "../types";

interface AuthContextValue {
  user: SelfProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    name: string;
    dateOfBirth: string;
    gender: string;
  }) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setUser: (user: SelfProfile) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<SelfProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!getToken()) {
      setUserState(null);
      return;
    }
    try {
      const { user } = await api.get<{ user: SelfProfile }>("/auth/me");
      setUserState(user);
    } catch {
      setToken(null);
      setUserState(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await api.post<{ token: string; user: SelfProfile }>(
      "/auth/login",
      { email, password }
    );
    setToken(token);
    setUserState(user);
  }, []);

  const register = useCallback(
    async (data: { email: string; password: string; name: string; dateOfBirth: string; gender: string }) => {
      const { token, user } = await api.post<{ token: string; user: SelfProfile }>(
        "/auth/register",
        data
      );
      setToken(token);
      setUserState(user);
    },
    []
  );

  const logout = useCallback(() => {
    setToken(null);
    setUserState(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshUser, setUser: setUserState }),
    [user, loading, login, register, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
