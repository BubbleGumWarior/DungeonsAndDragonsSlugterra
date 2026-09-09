import { useCallback, useEffect, useRef, useState } from "react";
import {
  RocketIcon,
  UploadSimpleIcon,
  MapPinSimpleIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
  CheckIcon,
} from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { downscaleImageFile } from "./imageDownscale.js";
import "./ShipBlueprint.css";

function authHeaders(token, extra) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

function newCompartmentId() {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clampPct(v) {
  return Math.max(0, Math.min(100, v));
}

// Compartment status -> label + flag colour. Shared by the map node, the DM
// status dropdown, and the player-facing badge so they always agree. "empty"
// is the default for a fresh node and reads as "nothing built here yet".
const STATUS_META = {
  empty: { label: "Empty — buildable", color: "#c9a24b" },
  online: { label: "Online", color: "#49b675" },
  offline: { label: "Offline", color: "#8b929c" },
  broken: { label: "Broken", color: "#ff7a6b" },
  building: { label: "Building", color: "#e0a53c" },
};
const STATUS_ORDER = ["empty", "online", "offline", "broken", "building"];
function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.empty;
}

export default function ShipBlueprint({ isDungeonMaster = false }) {
  const { token } = useAuth();
  const { shipUpdate } = useLiveState();

  const [ship, setShip] = useState(null); // { id, name, image, compartments }
  const shipRef = useRef(null);
  shipRef.current = ship;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const firstLoadRef = useRef(true);

  const [ships, setShips] = useState([]); // DM only: [{ id, name, isActive, ... }]
  const [selectedId, setSelectedId] = useState(null); // which compartment's detail is open
  const [placing, setPlacing] = useState(false); // DM "add compartment" mode
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [uploadError, setUploadError] = useState(null);

  const stageRef = useRef(null);
  const fileRef = useRef(null);
  const dragRef = useRef(null); // { id, moved }
  const justDraggedRef = useRef(false); // set on a real drag so the trailing click doesn't open the panel

  // The DM edits whichever ship is being shown; players always see the active
  // one. `viewShipId` is the id currently rendered (active ship, or a
  // different one the DM picked in the switcher). Mirrored in a ref so
  // refresh() can read it without re-subscribing on every change.
  const [viewShipId, setViewShipId] = useState(null);
  const viewShipIdRef = useRef(null);
  viewShipIdRef.current = viewShipId;

  const loadActive = useCallback(async () => {
    try {
      const res = await fetch("/api/ships/active", { headers: authHeaders(token) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the ship.");
      return data.ship;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [token]);

  const loadShip = useCallback(
    async (id) => {
      try {
        const res = await fetch(`/api/ships/${id}`, { headers: authHeaders(token) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load the ship.");
        return data.ship;
      } catch (err) {
        setError(err.message);
        return null;
      }
    },
    [token]
  );

  const refresh = useCallback(async () => {
    if (firstLoadRef.current) setLoading(true);
    setError(null);
    const active = await loadActive();

    let list = [];
    if (isDungeonMaster) {
      try {
        const res = await fetch("/api/ships", { headers: authHeaders(token) });
        const data = await res.json();
        if (res.ok) {
          list = data.ships || [];
          setShips(list);
        }
      } catch {
        /* non-fatal -- the switcher just won't populate */
      }
    }

    // Keep the DM parked on whichever ship they were inspecting, as long as
    // it still exists -- a `ship-updated` broadcast (often the DM's own edit)
    // shouldn't yank the view back to the active ship.
    const keepId = viewShipIdRef.current;
    let shown = active;
    if (isDungeonMaster && keepId && keepId !== active?.id && list.some((s) => s.id === keepId)) {
      shown = (await loadShip(keepId)) ?? active;
    }

    setShip(shown);
    setViewShipId(shown?.id ?? null);
    firstLoadRef.current = false;
    setLoading(false);
  }, [loadActive, loadShip, isDungeonMaster, token]);

  useEffect(() => {
    refresh();
  }, [refresh, shipUpdate]);

  // DM picked a different ship in the switcher.
  async function switchView(id) {
    if (id === viewShipId) return;
    setSelectedId(null);
    setPlacing(false);
    const next = await loadShip(id);
    if (next) {
      setShip(next);
      setViewShipId(id);
    }
  }

  async function patchShip(id, body) {
    const res = await fetch(`/api/ships/${id}`, {
      method: "PATCH",
      headers: authHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not save.");
    return data.ship;
  }

  async function saveCompartments(next) {
    // Optimistic -- the ship-updated broadcast will re-sync everyone.
    setShip((s) => (s ? { ...s, compartments: next } : s));
    try {
      await patchShip(ship.id, { compartments: next });
    } catch (err) {
      setError(err.message);
      refresh();
    }
  }

  async function createShip(e) {
    e?.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/ships", {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the ship.");
      setCreating(false);
      setNewName("");
      // If it became active (first ship), refresh picks it up; otherwise
      // activate it so the DM lands on the new ship to set it up.
      await fetch(`/api/ships/${data.ship.id}/activate`, {
        method: "POST",
        headers: authHeaders(token),
      });
    } catch (err) {
      setError(err.message);
    }
  }

  async function activateShip(id) {
    try {
      await fetch(`/api/ships/${id}/activate`, { method: "POST", headers: authHeaders(token) });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !ship) return;
    setUploadError(null);
    try {
      const dataUrl = await downscaleImageFile(file);
      const updated = await patchShip(ship.id, { image: dataUrl });
      setShip(updated);
    } catch (err) {
      setUploadError(err.message || "Could not upload that image.");
    }
  }

  function stagePct(clientX, clientY) {
    const rect = stageRef.current.getBoundingClientRect();
    return {
      xPct: clampPct(((clientX - rect.left) / rect.width) * 100),
      yPct: clampPct(((clientY - rect.top) / rect.height) * 100),
    };
  }

  function handleStageClick(e) {
    if (!placing || !ship) return;
    const { xPct, yPct } = stagePct(e.clientX, e.clientY);
    const comp = { id: newCompartmentId(), label: "New compartment", description: "", status: "empty", xPct, yPct };
    const next = [...(ship.compartments || []), comp];
    saveCompartments(next);
    setSelectedId(comp.id);
    setPlacing(false);
  }

  // DM node drag. A plain click (no meaningful movement) falls through to the
  // node's onClick, which opens the detail panel; a drag past DRAG_THRESHOLD
  // repositions the node and PATCHes on drop, and suppresses that click.
  const DRAG_THRESHOLD = 4;
  function handleNodeMouseDown(e, comp) {
    if (!isDungeonMaster) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    dragRef.current = { id: comp.id, moved: false };
    const onMove = (ev) => {
      if (!dragRef.current) return;
      if (!dragRef.current.moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) {
        return;
      }
      dragRef.current.moved = true;
      const { xPct, yPct } = stagePct(ev.clientX, ev.clientY);
      setShip((s) => ({
        ...s,
        compartments: s.compartments.map((c) => (c.id === comp.id ? { ...c, xPct, yPct } : c)),
      }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const info = dragRef.current;
      dragRef.current = null;
      justDraggedRef.current = Boolean(info?.moved);
      const s = shipRef.current;
      if (info?.moved && s) {
        patchShip(s.id, { compartments: s.compartments }).catch((err) => setError(err.message));
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function updateSelected(patch) {
    setShip((s) => ({
      ...s,
      compartments: s.compartments.map((c) => (c.id === selectedId ? { ...c, ...patch } : c)),
    }));
  }

  function commitSelected() {
    if (ship) saveCompartments(ship.compartments);
  }

  function deleteSelected() {
    const next = ship.compartments.filter((c) => c.id !== selectedId);
    setSelectedId(null);
    saveCompartments(next);
  }

  if (loading) return <p className="ship-empty">Loading the deck plan…</p>;

  const selected = ship?.compartments?.find((c) => c.id === selectedId) || null;
  const compartments = ship?.compartments || [];

  return (
    <div className="ship-wrap">
      {isDungeonMaster && (
        <div className="ship-toolbar">
          <label className="ship-toolbar-field">
            Ship
            <select value={viewShipId ?? ""} onChange={(e) => switchView(Number(e.target.value))}>
              {ships.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.isActive ? " · active" : ""}
                </option>
              ))}
              {ships.length === 0 && <option value="">No ships yet</option>}
            </select>
          </label>

          {creating ? (
            <form className="ship-create" onSubmit={createShip}>
              <input
                autoFocus
                placeholder="New ship name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button type="submit" className="ship-btn" aria-label="Create">
                <CheckIcon weight="bold" />
              </button>
              <button
                type="button"
                className="ship-btn"
                aria-label="Cancel"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
              >
                <XIcon weight="bold" />
              </button>
            </form>
          ) : (
            <button type="button" className="ship-btn" onClick={() => setCreating(true)}>
              <PlusIcon weight="bold" /> New ship
            </button>
          )}

          {ship && (
            <>
              <button type="button" className="ship-btn" onClick={() => fileRef.current?.click()}>
                <UploadSimpleIcon weight="bold" /> {ship.image ? "Change image" : "Upload image"}
              </button>
              <button
                type="button"
                className={`ship-btn ${placing ? "ship-btn--on" : ""}`}
                onClick={() => setPlacing((v) => !v)}
                disabled={!ship.image}
              >
                <MapPinSimpleIcon weight="bold" /> {placing ? "Click the plan…" : "Add compartment"}
              </button>
              {ships.find((s) => s.id === viewShipId && !s.isActive) && (
                <button type="button" className="ship-btn ship-btn--primary" onClick={() => activateShip(ship.id)}>
                  Set as active ship
                </button>
              )}
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
        </div>
      )}

      {uploadError && <p className="ship-error">{uploadError}</p>}
      {error && <p className="ship-error">{error}</p>}

      {!ship ? (
        <div className="ship-empty-card">
          <RocketIcon weight="duotone" />
          <p>
            {isDungeonMaster
              ? "No ship yet. Create one above, then upload a top-down deck plan and drop compartment pins on it."
              : "The party doesn't have a ship yet."}
          </p>
        </div>
      ) : !ship.image ? (
        <div className="ship-empty-card">
          <RocketIcon weight="duotone" />
          <p>
            {isDungeonMaster
              ? `${ship.name} has no deck plan image yet — upload one above.`
              : `${ship.name} — deck plan not available yet.`}
          </p>
        </div>
      ) : (
        <div className="ship-stage-outer">
          <div
            ref={stageRef}
            className={`ship-stage ${placing ? "ship-stage--placing" : ""}`}
            onClick={handleStageClick}
          >
            <img className="ship-plan-img" src={ship.image} alt={`${ship.name} deck plan`} draggable={false} />
            {compartments.map((c) => {
              const status = STATUS_META[c.status] ? c.status : "empty";
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`ship-node ship-node--${status} ${c.id === selectedId ? "ship-node--selected" : ""}`}
                  style={{ left: `${c.xPct}%`, top: `${c.yPct}%`, "--flag": statusMeta(status).color }}
                  title={`${c.label} · ${statusMeta(status).label}`}
                  onMouseDown={(e) => handleNodeMouseDown(e, c)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (justDraggedRef.current) {
                      justDraggedRef.current = false;
                      return;
                    }
                    setSelectedId(c.id);
                  }}
                >
                  <span className="ship-node-dot" />
                  <span className="ship-node-hint">{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selected && (
        <div className="ship-detail">
          <button
            type="button"
            className="ship-detail-close"
            aria-label="Close"
            onClick={() => {
              setSelectedId(null);
            }}
          >
            <XIcon weight="bold" />
          </button>

          {isDungeonMaster ? (
            <>
              <label className="ship-detail-field">
                Compartment
                <input
                  value={selected.label}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                  onBlur={commitSelected}
                />
              </label>
              <label className="ship-detail-field">
                Status
                <span className="ship-detail-select">
                  <span className="ship-status-swatch" style={{ background: statusMeta(selected.status).color }} />
                  <select
                    value={STATUS_META[selected.status] ? selected.status : "empty"}
                    onChange={(e) => {
                      // No blur step on a select -- commit the pick straight away.
                      const next = (shipRef.current?.compartments || []).map((c) =>
                        c.id === selectedId ? { ...c, status: e.target.value } : c
                      );
                      saveCompartments(next);
                    }}
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s} style={{ color: STATUS_META[s].color }}>
                        {STATUS_META[s].label}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="ship-detail-field">
                Description
                <textarea
                  rows={5}
                  value={selected.description || ""}
                  onChange={(e) => updateSelected({ description: e.target.value })}
                  onBlur={commitSelected}
                />
              </label>
              <button type="button" className="ship-btn ship-btn--danger" onClick={deleteSelected}>
                <TrashIcon weight="bold" /> Delete compartment
              </button>
            </>
          ) : (
            <>
              <h2 className="ship-detail-name">{selected.label}</h2>
              <p className="ship-detail-status" style={{ "--flag": statusMeta(selected.status).color }}>
                <span className="ship-status-swatch" style={{ background: statusMeta(selected.status).color }} />
                {statusMeta(selected.status).label}
              </p>
              <p className="ship-detail-body">{selected.description || "No details recorded."}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
