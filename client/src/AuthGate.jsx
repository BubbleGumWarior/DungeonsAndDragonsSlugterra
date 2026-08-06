import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import "./Gate.css";

export default function AuthGate() {
  const { token, updateUser, logout } = useAuth();
  const location = useLocation();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error("unauthorized");
        const data = await res.json();
        if (cancelled) return;
        setMe(data.user);
        updateUser(data.user);
        setFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, location.pathname]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (failed) {
    logout();
    return <Navigate to="/login" replace />;
  }

  if (loading || !me) {
    return (
      <div className="gate-loading">
        <div className="gate-loading-card">Loading&hellip;</div>
      </div>
    );
  }

  const path = location.pathname;

  if (me.mustChangePassword && path !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  if (!me.mustChangePassword) {
    const needsApproval = me.role !== "Dungeon Master" && me.status !== "approved";
    if (needsApproval && path !== "/request-access") {
      return <Navigate to="/request-access" replace />;
    }
    if (!needsApproval && path === "/request-access") {
      return <Navigate to="/dashboard" replace />;
    }
  }

  if (path === "/admin" && me.role !== "Dungeon Master") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
