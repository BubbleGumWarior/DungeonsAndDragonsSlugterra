import { useEffect, useState } from "react";
import { CheckCircleIcon, ProhibitIcon, KeyReturnIcon, TrashIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import NavBar from "./NavBar.jsx";
import "./Panel.css";
import "./Admin.css";

export default function Admin() {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [tempPassword, setTempPassword] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

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
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.username}</td>
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
                        {u.role === "Dungeon Master" ? (
                          <span className="admin-muted">&mdash;</span>
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
