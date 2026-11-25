import { useEffect, useState } from "react";
import { CheckCircleIcon, ProhibitIcon, KeyReturnIcon, TrashIcon, UserSwitchIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { ROLE_ASSISTANT, ROLE_DM, ROLE_PLAYER } from "./roles.js";
import NavBar from "./NavBar.jsx";
import "./Panel.css";
import "./Admin.css";

// What each role can do, shown in the Change Role dialog.
const ROLE_OPTIONS = [
  { role: ROLE_PLAYER, blurb: "Plays their own character, votes on travel, trades and shops." },
  {
    role: ROLE_ASSISTANT,
    blurb:
      "Sees everything you see but changes nothing. No character, no votes. Can join voice, and plays any NPCs you hand them in combat.",
  },
  { role: ROLE_DM, blurb: "Full control, same as you." },
];

export default function Admin() {
  const { token, user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [tempPassword, setTempPassword] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [roleDialog, setRoleDialog] = useState(null); // { user, role } while picking a new role

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load users.");
      setUsers(data.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAction(userId, action) {
    setBusyId(userId);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${userId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed.");

      if (action === "reset-password") {
        setTempPassword({ username: data.username, password: data.tempPassword });
        await loadUsers();
      } else {
        setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(userId) {
    setBusyId(userId);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete user.");
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setPendingDelete(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleChangeRole() {
    const { user: target, role } = roleDialog;
    setBusyId(target.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${target.id}/role`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not change the role.");
      setUsers((prev) => prev.map((u) => (u.id === target.id ? data.user : u)));
    } catch (err) {
      setError(err.message);
    } finally {
      setRoleDialog(null);
      setBusyId(null);
    }
  }

  const changeRoleButton = (u) => (
    <button
      className="admin-action-btn"
      disabled={busyId === u.id}
      onClick={() => setRoleDialog({ user: u, role: u.role })}
    >
      <UserSwitchIcon weight="bold" />
      Change Role
    </button>
  );

  const roleTarget = roleDialog?.user;
  const roleUnchanged = Boolean(roleDialog) && roleDialog.role === roleTarget.role;
  // A character stays where it is when its player stops being a Player --
  // it just sits out (no turns, no votes) until they're a Player again.
  const parksCharacter = Boolean(roleDialog) && Boolean(roleTarget.characterName) && roleDialog.role !== ROLE_PLAYER;

  return (
    <div className="dashboard-page">
      <NavBar />

      <div className="admin-body">
        <div className="admin-card">
          <h1>Admin</h1>
          <p className="admin-subtitle">Manage player access and credentials.</p>

          {error && <div className="admin-error">{error}</div>}

          {loading ? (
            <p className="admin-loading">Loading users&hellip;</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Character</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.username}</td>
                      <td>
                        {u.characterName || <span className="admin-muted">&mdash;</span>}
                      </td>
                      <td>{u.role}</td>
                      <td>
                        <span className={`admin-status admin-status--${u.status}`}>
                          {u.status}
                        </span>
                        {u.mustChangePassword && (
                          <span className="admin-status admin-status--pending-pw">
                            temp password
                          </span>
                        )}
                      </td>
                      <td>
                        {u.id === me?.id ? (
                          <span className="admin-muted">You</span>
                        ) : u.role === ROLE_DM ? (
                          <div className="admin-actions">{changeRoleButton(u)}</div>
                        ) : (
                          <div className="admin-actions">
                            {u.status !== "approved" && (
                              <button
                                className="admin-action-btn"
                                disabled={busyId === u.id}
                                onClick={() => handleAction(u.id, "approve")}
                              >
                                <CheckCircleIcon weight="bold" />
                                Grant Access
                              </button>
                            )}
                            {u.status !== "revoked" && (
                              <button
                                className="admin-action-btn admin-action-btn--danger"
                                disabled={busyId === u.id}
                                onClick={() => handleAction(u.id, "revoke")}
                              >
                                <ProhibitIcon weight="bold" />
                                Revoke Access
                              </button>
                            )}
                            <button
                              className="admin-action-btn"
                              disabled={busyId === u.id}
                              onClick={() => handleAction(u.id, "reset-password")}
                            >
                              <KeyReturnIcon weight="bold" />
                              Reset Password
                            </button>
                            {changeRoleButton(u)}
                            <button
                              className="admin-action-btn admin-action-btn--danger"
                              disabled={busyId === u.id}
                              onClick={() => setPendingDelete({ id: u.id, username: u.username })}
                            >
                              <TrashIcon weight="bold" />
                              Delete User
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {tempPassword && (
        <div className="admin-modal-backdrop" onClick={() => setTempPassword(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Temporary Password</h2>
            <p>
              Send this password to <strong>{tempPassword.username}</strong> manually. They will
              be asked to set a new password on their next sign in.
            </p>
            <div className="admin-temp-password">{tempPassword.password}</div>
            <button className="status-button status-button--primary" onClick={() => setTempPassword(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {roleDialog && (
        <div className="admin-modal-backdrop" onClick={() => setRoleDialog(null)}>
          <div
            className="admin-modal admin-modal--wide"
            role="dialog"
            aria-labelledby="admin-role-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="admin-role-title">Change Role</h2>
            <p>
              Pick a role for <strong>{roleTarget.username}</strong>. It takes effect right away, even if
              they&rsquo;re signed in.
            </p>
            <div className="admin-role-options" role="radiogroup" aria-label="Role">
              {ROLE_OPTIONS.map((opt) => (
                <label
                  key={opt.role}
                  className={`admin-role-option${roleDialog.role === opt.role ? " admin-role-option--on" : ""}`}
                >
                  <input
                    type="radio"
                    name="admin-role"
                    value={opt.role}
                    checked={roleDialog.role === opt.role}
                    onChange={() => setRoleDialog((d) => ({ ...d, role: opt.role }))}
                  />
                  <span className="admin-role-option-text">
                    <span className="admin-role-option-name">
                      {opt.role}
                      {roleTarget.role === opt.role && <span className="admin-role-current">current</span>}
                    </span>
                    <span className="admin-role-option-blurb">{opt.blurb}</span>
                  </span>
                </label>
              ))}
            </div>
            {parksCharacter && (
              <p className="admin-role-warning">
                {roleTarget.characterName} stays on the roster but sits out (no turns, no votes, no shopping)
                until {roleTarget.username} is a Player again.
              </p>
            )}
            <div className="status-actions">
              <button className="status-button" onClick={() => setRoleDialog(null)}>
                Cancel
              </button>
              <button
                className="admin-action-btn"
                disabled={roleUnchanged || busyId === roleTarget.id}
                onClick={handleChangeRole}
              >
                {busyId === roleTarget.id ? "Saving..." : "Change Role"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="admin-modal-backdrop" onClick={() => setPendingDelete(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Delete User</h2>
            <p>
              Are you sure you want to permanently delete{" "}
              <strong>{pendingDelete.username}</strong>? This cannot be undone.
            </p>
            <div className="status-actions">
              <button className="status-button" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button
                className="admin-action-btn admin-action-btn--danger"
                disabled={busyId === pendingDelete.id}
                onClick={() => handleDelete(pendingDelete.id)}
              >
                {busyId === pendingDelete.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
