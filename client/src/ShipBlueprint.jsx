import { useCallback, useEffect, useRef, useState } from "react";
import {
  RocketIcon,
  UploadSimpleIcon,
  MapPinSimpleIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
  CheckIcon,
  GaugeIcon,
  PlanetIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { downscaleImageFile } from "./imageDownscale.js";
import { PLANETS } from "./planetData.js";
import useTravel from "./useTravel.js";
import NavConsole from "./NavConsole.jsx";
import "./ShipBlueprint.css";

// The compartment a ship needs to travel: its online Nav Computer opens the star
// console (mirrors NAV_COMPUTER_KEY in server/src/shipRules.js).
const NAV_COMPUTER_KEY = "nav-computer";

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

// Days built so far against days needed, plus the rule for how they accrue.
function BuildProgress({ compartment }) {
  const done = compartment.progressDays || 0;
  const total = Math.max(1, compartment.buildDays || 1);
  return (
    <div className="ship-progress">
      <div
        className="ship-progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <span style={{ transform: `scaleX(${Math.min(1, done / total)})` }} />
      </div>
      <p className="ship-progress-text">
        {done} of {total} days built. Each long rest adds a day while docked. Under way, a day is added for each
        engineer working on it.
      </p>
    </div>
  );
}

function Engineers({ compartment }) {
  const crew = compartment.engineers || [];
  return (
    <p className="ship-progress-text">
      {crew.length
        ? `Engineering: ${crew.map((e) => e.name).join(", ")}`
        : "No engineer assigned. It only moves forward while docked. Someone proficient in Survival can work on it."}
    </p>
  );
}

const worldName = (i) => PLANETS[i]?.name ?? "Unknown";
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// A compartment pin as the server stores it. Build fields start empty; a
// template (or the DM's own numbers) fills them in.
function blankCompartment(xPct, yPct) {
  return {
    id: newCompartmentId(),
    label: "New compartment",
    description: "",
    status: "empty",
    xPct,
    yPct,
    templateKey: null,
    speedBonus: 0,
    buildDays: 0,
    progressDays: 0,
    engineers: [],
  };
}

export default function ShipBlueprint({ isDungeonMaster = false }) {
  const { token, user } = useAuth();
  const { shipUpdate } = useLiveState();
  const { travel } = useTravel();

  const [ship, setShip] = useState(null); // { id, name, image, speed, compartmentSlots, compartments, ... }
  const [templates, setTemplates] = useState({ defaults: [], custom: [] }); // DM only
  const [engineerError, setEngineerError] = useState(null);
  const [consoleOpen, setConsoleOpen] = useState(false); // the Nav Computer's star console
  // The Deck Plan is a tablet in the player's hands. Stepping into the console
  // drops it (it falls out of view as the room comes up around you); leaving
  // picks it back up. "drop" holds while the console is open.
  const [tabletPhase, setTabletPhase] = useState("idle"); // idle | drop | raise
  const raiseTimer = useRef(null);
  useEffect(() => () => clearTimeout(raiseTimer.current), []);
  function openConsole() {
    clearTimeout(raiseTimer.current);
    setTabletPhase("drop");
    setConsoleOpen(true);
  }
  function closeConsole() {
    setConsoleOpen(false);
    setTabletPhase("raise");
    raiseTimer.current = setTimeout(() => setTabletPhase("idle"), 800);
  }
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
  const detailRef = useRef(null);
  const dragRef = useRef(null); // { id, moved }
  const justDraggedRef = useRef(false); // set on a real drag so the trailing click doesn't open the panel

  // The deck plan can be tall on a wide screen, pushing the detail panel well
  // below the fold -- so opening a compartment drops the page down to it. The
  // panel is in the DOM by the time this passive effect runs (same commit as
  // selectedId), and scrollIntoView forces the layout it needs.
  useEffect(() => {
    if (!selectedId) return;
    detailRef.current?.scrollIntoView({ block: "start" });
  }, [selectedId]);

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
        const res = await fetch("/api/ships/templates", { headers: authHeaders(token) });
        const data = await res.json();
        if (res.ok) setTemplates({ defaults: data.defaults || [], custom: data.custom || [] });
      } catch {
        /* non-fatal -- the template picker just stays empty */
      }
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
    const comp = blankCompartment(xPct, yPct);
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

  // Change one compartment's fields and save straight away (selects and
  // buttons have no blur step to commit on).
  function patchSelectedNow(patch) {
    const next = (shipRef.current?.compartments || []).map((c) => (c.id === selectedId ? { ...c, ...patch } : c));
    saveCompartments(next);
  }

  // Fill the selected pin from a built-in or custom template.
  function applyTemplate(key) {
    if (!key) return patchSelectedNow({ templateKey: null });
    const t = [...templates.defaults, ...templates.custom].find((x) => x.key === key);
    if (!t) return;
    patchSelectedNow({
      templateKey: t.key,
      label: t.name,
      description: t.description,
      buildDays: t.buildDays,
      speedBonus: t.speedBonus,
    });
  }

  async function saveAsTemplate() {
    const c = shipRef.current?.compartments.find((x) => x.id === selectedId);
    if (!c) return;
    try {
      const res = await fetch("/api/ships/templates", {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: c.label,
          description: c.description,
          buildDays: c.buildDays || 3,
          speedBonus: c.speedBonus || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the template.");
      setTemplates((t) => ({ ...t, custom: [...t.custom, data.template] }));
      patchSelectedNow({ templateKey: data.template.key });
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteTemplate(key) {
    const t = templates.custom.find((x) => x.key === key);
    if (!t) return;
    try {
      await fetch(`/api/ships/templates/${t.id}`, { method: "DELETE", headers: authHeaders(token) });
      setTemplates((cur) => ({ ...cur, custom: cur.custom.filter((x) => x.key !== key) }));
      patchSelectedNow({ templateKey: null });
    } catch (err) {
      setError(err.message);
    }
  }

  // Sign on (or off) as the engineer for the open compartment.
  async function setEngineering(compartmentId) {
    setEngineerError(null);
    try {
      const res = await fetch("/api/ships/engineer", {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ compartmentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not update your assignment.");
    } catch (err) {
      setEngineerError(err.message);
    }
  }

  async function saveShipStat(patch) {
    try {
      const updated = await patchShip(ship.id, patch);
      setShip((s) => (s ? { ...s, ...updated, image: s.image } : s));
    } catch (err) {
      setError(err.message);
      refresh();
    }
  }

  if (loading) return <p className="ship-empty">Loading the deck plan…</p>;

  const selected = ship?.compartments?.find((c) => c.id === selectedId) || null;
  const compartments = ship?.compartments || [];
  const navComputer = compartments.find((c) => c.templateKey === NAV_COMPUTER_KEY) || null;
  const navReady = compartments.some((c) => c.templateKey === NAV_COMPUTER_KEY && c.status === "online");
  const isNavPin = (c) => c.templateKey === NAV_COMPUTER_KEY;

  return (
    <div className="ship-wrap">
      <div className="tablet-stage">
        <div
          className={`tablet ${tabletPhase === "drop" ? "tablet--drop" : tabletPhase === "raise" ? "tablet--raise" : ""}`}
        >
          <span className="tablet-camera" aria-hidden="true" />
          <div className="tablet-screen">
            <div className="tablet-status">
              <span>{ship?.name ?? "Crew tablet"}</span>
              <span>{travel ? `Day ${travel.day}` : ""}</span>
            </div>
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
                disabled={!ship.image || (ship.compartments?.length ?? 0) >= (ship.compartmentSlots ?? 12)}
                title={
                  (ship.compartments?.length ?? 0) >= (ship.compartmentSlots ?? 12)
                    ? "Every compartment slot is used. Raise the slot count to add more."
                    : undefined
                }
              >
                <MapPinSimpleIcon weight="bold" /> {placing ? "Click the plan…" : "Add compartment"}
              </button>
              <button type="button" className="ship-btn" onClick={openConsole}>
                <PlanetIcon weight="bold" /> Open the star console
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

      {ship && (
        <section className="ship-stats" aria-label="Ship stats">
          <div className="ship-stat">
            <span className="ship-stat-label">
              <GaugeIcon weight="bold" /> Travel speed
            </span>
            <span className="ship-stat-value">
              {ship.speedStats?.effective ?? ship.speed}
              <small> units a day</small>
            </span>
            <span className="ship-stat-note">
              {isDungeonMaster ? (
                <label className="ship-stat-edit">
                  Base
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={ship.speed}
                    onChange={(e) => setShip((s) => ({ ...s, speed: Number(e.target.value) }))}
                    onBlur={() => saveShipStat({ speed: ship.speed })}
                  />
                </label>
              ) : (
                <>Base {ship.speed}</>
              )}
              {ship.speedStats?.bonus
                ? ` ${ship.speedStats.bonus > 0 ? "+" : "−"} ${Math.abs(ship.speedStats.bonus)} from online compartments`
                : " · no compartment bonuses yet"}
            </span>
          </div>

          <div className="ship-stat">
            <span className="ship-stat-label">Compartments</span>
            <span className="ship-stat-value">
              {compartments.filter((c) => c.status === "online").length}
              <small> online</small>
            </span>
            <span className="ship-stat-note">
              {compartments.length} placed of{" "}
              {isDungeonMaster ? (
                <label className="ship-stat-edit">
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={ship.compartmentSlots}
                    onChange={(e) => setShip((s) => ({ ...s, compartmentSlots: Number(e.target.value) }))}
                    onBlur={() => saveShipStat({ compartmentSlots: ship.compartmentSlots })}
                  />
                </label>
              ) : (
                ship.compartmentSlots
              )}{" "}
              slots
              {compartments.some((c) => c.status === "building") &&
                ` · ${compartments.filter((c) => c.status === "building").length} being built`}
            </span>
          </div>

          <div className="ship-stat">
            <span className="ship-stat-label">Voyage</span>
            <span className="ship-stat-value">{travel ? `Day ${travel.day}` : "…"}</span>
            <span className="ship-stat-note">
              {travel?.traveling
                ? `Under way to ${worldName(travel.destination)}, ${plural(travel.daysLeft, "day")} left`
                : travel
                ? `Docked at ${worldName(travel.area)}`
                : ""}
              {!navReady &&
                (isDungeonMaster
                  ? ". No working Nav Computer, so the ship can't travel."
                  : ". The Nav Computer isn't working, so the ship can't travel.")}
            </span>
          </div>
        </section>
      )}

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
              const navOnline = isNavPin(c) && status === "online";
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`ship-node ship-node--${status} ${c.id === selectedId ? "ship-node--selected" : ""} ${navOnline ? "ship-node--nav" : ""}`}
                  style={{ left: `${c.xPct}%`, top: `${c.yPct}%`, "--flag": statusMeta(status).color }}
                  title={`${c.label} · ${statusMeta(status).label}${
                    status === "building" ? ` ${c.progressDays || 0}/${c.buildDays} days` : ""
                  }${isNavPin(c) && status === "online" ? " · click to enter the star console" : ""}`}
                  onMouseDown={(e) => handleNodeMouseDown(e, c)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (justDraggedRef.current) {
                      justDraggedRef.current = false;
                      return;
                    }
                    // A working Nav Computer is a door, not a pin: players
                    // step straight into the console. (The DM selects it to edit
                    // it, and has an Enter button in the panel.)
                    if (isNavPin(c) && status === "online" && !isDungeonMaster) {
                      openConsole();
                      return;
                    }
                    setSelectedId(c.id);
                  }}
                >
                  <span className="ship-node-dot">{navOnline && <PlanetIcon weight="fill" />}</span>
                  {navOnline ? (
                    <span className="ship-node-nav-tag">Star console</span>
                  ) : (
                    <span className="ship-node-hint">{c.label}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selected && (
        <div className="ship-detail" ref={detailRef}>
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

              <div className="ship-build">
                <h3 className="ship-build-title">
                  <WrenchIcon weight="bold" /> Build
                </h3>
                <label className="ship-detail-field">
                  Template
                  <select value={selected.templateKey || ""} onChange={(e) => applyTemplate(e.target.value)}>
                    <option value="">Custom</option>
                    <optgroup label="Standard">
                      {templates.defaults.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.name}
                        </option>
                      ))}
                    </optgroup>
                    {templates.custom.length > 0 && (
                      <optgroup label="Yours">
                        {templates.custom.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>
                <div className="ship-build-row">
                  <label className="ship-detail-field">
                    Days to build
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={selected.buildDays || ""}
                      onChange={(e) => updateSelected({ buildDays: Number(e.target.value) })}
                      onBlur={commitSelected}
                    />
                  </label>
                  <label className="ship-detail-field">
                    Speed bonus
                    <input
                      type="number"
                      min={-20}
                      max={20}
                      value={selected.speedBonus ?? 0}
                      onChange={(e) => updateSelected({ speedBonus: Number(e.target.value) })}
                      onBlur={commitSelected}
                    />
                  </label>
                </div>

                {selected.status === "building" ? (
                  <>
                    <BuildProgress compartment={selected} />
                    <div className="ship-build-actions">
                      <button type="button" className="ship-btn" onClick={() => patchSelectedNow({ status: "online" })}>
                        Finish now
                      </button>
                      <button type="button" className="ship-btn" onClick={() => patchSelectedNow({ status: "empty" })}>
                        Cancel build
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="ship-build-actions">
                    <button
                      type="button"
                      className="ship-btn ship-btn--primary"
                      disabled={selected.status === "online"}
                      onClick={() => patchSelectedNow({ status: "building", buildDays: selected.buildDays || 3 })}
                    >
                      Start building
                    </button>
                    <button type="button" className="ship-btn" onClick={saveAsTemplate}>
                      Save as template
                    </button>
                    {templates.custom.some((t) => t.key === selected.templateKey) && (
                      <button type="button" className="ship-btn" onClick={() => deleteTemplate(selected.templateKey)}>
                        Delete template
                      </button>
                    )}
                  </div>
                )}
                {selected.status === "building" && <Engineers compartment={selected} />}
              </div>

              {isNavPin(selected) && selected.status === "online" && (
                <button type="button" className="ship-btn ship-btn--primary" onClick={openConsole}>
                  <PlanetIcon weight="bold" /> Enter the star console
                </button>
              )}

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
              {isNavPin(selected) && selected.status !== "online" && (
                <p className="ship-detail-body">The star console stays dark until this compartment is online.</p>
              )}
              {selected.speedBonus ? (
                <p className="ship-detail-body">
                  Travel speed {selected.speedBonus > 0 ? "+" : "−"}
                  {Math.abs(selected.speedBonus)} while online.
                </p>
              ) : null}
              {selected.status === "building" && (
                <div className="ship-build">
                  <BuildProgress compartment={selected} />
                  <Engineers compartment={selected} />
                  {user?.id != null && (
                    <div className="ship-build-actions">
                      {(selected.engineers || []).some((e) => e.userId === user.id) ? (
                        <button type="button" className="ship-btn" onClick={() => setEngineering(null)}>
                          Stop working on this
                        </button>
                      ) : (
                        <button type="button" className="ship-btn ship-btn--primary" onClick={() => setEngineering(selected.id)}>
                          <WrenchIcon weight="bold" /> Work on this
                        </button>
                      )}
                    </div>
                  )}
                  {engineerError && <p className="ship-error">{engineerError}</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}

          </div>
          <span className="tablet-home" aria-hidden="true" />
        </div>
      </div>

      {consoleOpen && (
        <NavConsole
          isDungeonMaster={isDungeonMaster}
          chamberName={navComputer?.label || "Nav Computer"}
          onClose={closeConsole}
        />
      )}
    </div>
  );
}
