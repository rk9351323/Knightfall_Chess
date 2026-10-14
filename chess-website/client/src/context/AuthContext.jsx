import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../lib/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  const register = async (values) => {
    const { data } = await api.post("/auth/register", values);
    setUser(data.user);
    return data.user;
  };
  const login = async (values) => {
    const { data } = await api.post("/auth/login", values);
    setUser(data.user);
    return data.user;
  };
  const logout = async () => {
    try { await api.post("/auth/logout"); }
    finally { setUser(null); }
  };

  const value = useMemo(() => ({ user, loading, register, login, logout, refreshUser }), [user, loading, refreshUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
