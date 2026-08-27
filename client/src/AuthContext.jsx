import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { applyTheme } from "./theme.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    if (token) {
      localStorage.setItem("token", token);
    } else {
      localStorage.removeItem("token");
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem("user", JSON.stringify(user));
    } else {
      localStorage.removeItem("user");
    }
    // Login/logout, AuthGate's /api/me refresh, and Settings.jsx saving a
    // new theme all flow through here -- one place to keep the painted
    // accent in sync with whatever the user object currently says.
    applyTheme(user?.theme);
  }, [user]);

  // Stable identities are load-bearing, not just tidiness: AccessSocket.jsx's
  // /ws connection effect lists updateUser/logout as dependencies, and
  // updateUser gets called on every route change (AuthGate.jsx's /api/me
  // refresh) and every preference save (theme, sound volume, voice
  // settings). Plain functions here would get a new identity on every one
  // of those, tearing the WebSocket down and reopening it each time -- fast
  // enough to be invisible on a local connection, but over a slower
  // connection (a tunnel, a friend on another network) each reconnect can
  // lose the race against the next teardown and never actually finish
  // establishing, which is exactly the failure this fixes.
  const login = useCallback((nextToken, nextUser) => {
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((nextUser) => {
    setUser(nextUser);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
