import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProhibitIcon, HourglassMediumIcon, ArrowsClockwiseIcon, SignOutIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import "./Gate.css";

export default function RequestAccess() {
  const { user, token, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);

  const revoked = user?.status === "revoked";

  async function checkAgain() {
    setChecking(true);
    try {
      const res = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        updateUser(data.user);
        if (data.user.status === "approved") {
          navigate("/dashboard");
        }
      }
    } finally {
      setChecking(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="status-page">
      <div className="status-card">
        <div className={`status-icon ${revoked ? "status-icon--danger" : ""}`}>
          {revoked ? <ProhibitIcon weight="bold" /> : <HourglassMediumIcon weight="bold" />}
        </div>
        <h1>{revoked ? "Access Revoked" : "Awaiting Approval"}</h1>
        <p>
          {revoked
            ? "The Dungeon Master has revoked your access to this campaign."
            : "Your account is waiting for the Dungeon Master to grant you access."}
        </p>
        <span className="status-badge">{user?.status}</span>
        <div className="status-actions">
          <button className="status-button status-button--primary" onClick={checkAgain} disabled={checking}>
            <ArrowsClockwiseIcon weight="bold" className={checking ? "spin" : ""} />
            {checking ? "Checking..." : "Check Again"}
          </button>
          <button className="status-button" onClick={handleLogout}>
            <SignOutIcon weight="bold" />
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
