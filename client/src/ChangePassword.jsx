import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DiceFiveIcon, SignOutIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { landingPathFor } from "./authRouting.js";
import "./AuthForm.css";
import "./Gate.css";

export default function ChangePassword() {
  const { token, user, updateUser, logout } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not change password.");
        return;
      }

      const nextUser = { ...user, mustChangePassword: false };
      updateUser(nextUser);
      navigate(landingPathFor(nextUser));
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="auth-page">
      <div className="auth-brand-mark">
        <DiceFiveIcon weight="duotone" />
        Dungeon Lair
      </div>
      <div className="auth-viewport" style={{ animation: "none" }}>
        <div className="auth-card" style={{ animation: "gate-rise 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
          <h1 className="auth-title">Set a New Password</h1>
          <p className="auth-subtitle">
            You&rsquo;re signing in with a temporary password. Choose a new one to continue.
          </p>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <label htmlFor="current-password">Temporary Password</label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="new-password">New Password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="confirm-new-password">Confirm New Password</label>
              <input
                id="confirm-new-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>

          <div className="auth-switch">
            <button type="button" onClick={handleLogout}>
              <SignOutIcon weight="bold" style={{ verticalAlign: "-2px", marginRight: "4px" }} />
              Log out instead
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
