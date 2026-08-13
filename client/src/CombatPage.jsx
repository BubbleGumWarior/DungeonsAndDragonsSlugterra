import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftIcon, PlusIcon, SwordIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import CombatMap from "./CombatMap.jsx";
import CombatHotbar from "./CombatHotbar.jsx";
import CombatSlugPanel from "./CombatSlugPanel.jsx";
import CombatRoster from "./CombatRoster.jsx";
import CombatLog from "./CombatLog.jsx";
import SlugActionModal from "./SlugActionModal.jsx";
import { typeRange } from "./slugData.js";
import "./Panel.css";
import "./CombatPage.css";

function authHeaders(token, extra) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function postJson(token, url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

async function patchJson(token, url, body) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

async function del(token, url) {
  const res = await fetch(url, { method: "DELETE", headers: authHeaders(token) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

// Mirrors server/src/combatRules.js -- client-side estimate only, shown as a
// live preview while dragging. The server is always the authority on the
// real AP cost when the move is actually submitted.
const MOVE_SPEED_PER_AP = 200; // 10x the original 20 -- walking distance only, shooting range/speed untouched
const MECHA_SPEED_UNIT = 12;

function estimateApCost(combatant, dist) {
  const speedPerAp = combatant.kind === "mecha" ? (combatant.data?.speed || 1) * MECHA_SPEED_UNIT : MOVE_SPEED_PER_AP;
  return Math.max(1, Math.ceil(dist / speedPerAp));
}

function TopBar({ title, subtitle, children }) {
  return (
    <div className="combat-topbar">
      <Link to="/dashboard" className="combat-topbar-back">
        <ArrowLeftIcon weight="bold" />
        <span>Dashboard</span>
      </Link>
      {title && (
        <div className="combat-topbar-title">
          <span className="combat-topbar-title-main">{title}</span>
          {subtitle && <span className="combat-topbar-title-sub">{subtitle}</span>}
        </div>
      )}
      {children && <div className="combat-topbar-actions">{children}</div>}
    </div>
  );
}

function NewEncounterForm({ onCreate }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(name.trim());
      setName("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="panel combat-new-form" onSubmit={handleSubmit}>
      <div className="panel-header">
        <span className="panel-header-icon">
          <SwordIcon weight="duotone" />
        </span>
        <div className="panel-header-text">
          <h2>Start an Encounter</h2>
          <p>Name the scene, then add combatants.</p>
        </div>
      </div>
      <div className="panel-body">
        <div className="panel-field">
          <label htmlFor="encounter-name">Encounter Name</label>
          <input
            id="encounter-name"
            type="text"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ambush at the Slag Pits"
          />
        </div>
        {error && <p className="panel-error">{error}</p>}
        <button type="submit" className="panel-btn" disabled={submitting || !name.trim()}>
          {submitting ? "Creating..." : "Create Encounter"}
        </button>
      </div>
    </form>
  );
}

function AddCombatantForm({ players, mechas, onAdd }) {
  const [kind, setKind] = useState("character");
  const [refUserId, setRefUserId] = useState(players[0]?.id ?? "");
  const [refMechaId, setRefMechaId] = useState(mechas[0]?.id ?? "");
  const [name, setName] = useState("");
  const [maxAp, setMaxAp] = useState(2);
  const [maxGrit, setMaxGrit] = useState(20);
  const [dexModifier, setDexModifier] = useState(0);
  const [conModifier, setConModifier] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const px = 150 + Math.random() * 300;
      const py = 150 + Math.random() * 200;
      if (kind === "character") {
        await onAdd({ kind, refUserId: Number(refUserId), name, x: px, y: py });
      } else if (kind === "mecha") {
        await onAdd({ kind, refMechaId: Number(refMechaId), name, x: px, y: py });
      } else {
        await onAdd({
          kind,
          name,
          x: px,
          y: py,
          maxAp: Number(maxAp),
          maxGrit: Number(maxGrit),
          dexModifier: Number(dexModifier),
          conModifier: Number(conModifier),
        });
      }
      setName("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="combat-add-form" onSubmit={handleSubmit}>
      <div className="panel-row">
        <div className="panel-field">
          <label>Kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="character">Player Character</option>
            <option value="npc">NPC</option>
            <option value="mecha">Mecha</option>
          </select>
        </div>
        {kind === "character" && (
          <div className="panel-field">
            <label>Player</label>
            <select value={refUserId} onChange={(e) => setRefUserId(e.target.value)}>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.username}
                </option>
              ))}
            </select>
          </div>
        )}
        {kind === "mecha" && (
          <div className="panel-field">
            <label>Mecha</label>
            <select value={refMechaId} onChange={(e) => setRefMechaId(e.target.value)}>
              {mechas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="panel-field">
        <label>Name {kind !== "npc" && "(optional override)"}</label>
        <input
          type="text"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === "npc" ? "Blakk Goon" : ""}
        />
      </div>

      {kind === "npc" && (
        <div className="panel-row">
          <div className="panel-field">
            <label>Max AP</label>
            <input type="number" value={maxAp} min={1} max={6} onChange={(e) => setMaxAp(e.target.value)} />
          </div>
          <div className="panel-field">
            <label>Max Grit</label>
            <input type="number" value={maxGrit} min={1} max={200} onChange={(e) => setMaxGrit(e.target.value)} />
          </div>
          <div className="panel-field">
            <label>DEX Mod</label>
            <input type="number" value={dexModifier} min={-5} max={10} onChange={(e) => setDexModifier(e.target.value)} />
          </div>
          <div className="panel-field">
            <label>CON Mod</label>
            <input type="number" value={conModifier} min={-5} max={10} onChange={(e) => setConModifier(e.target.value)} />
          </div>
        </div>
      )}

      {error && <p className="panel-error">{error}</p>}
      <button
        type="submit"
        className="panel-btn panel-btn--ghost"
        disabled={submitting || (kind === "character" && !refUserId) || (kind === "mecha" && !refMechaId)}
      >
        <PlusIcon weight="bold" />
        Add Combatant
      </button>
    </form>
  );
}

function PullNpcForm({ npcTemplates, onPull }) {
  const [npcTemplateId, setNpcTemplateId] = useState(npcTemplates[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handlePull() {
    if (!npcTemplateId) return;
    setSubmitting(true);
    setError(null);
    try {
      await onPull(Number(npcTemplateId));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (npcTemplates.length === 0) {
    return <p className="combat-map-drag-hint">No NPCs yet -- create some on the NPCs page first.</p>;
  }

  return (
    <div className="combat-add-form combat-pull-npc-form">
      <div className="panel-field">
        <label>Pull an NPC into the fight</label>
        <select value={npcTemplateId} onChange={(e) => setNpcTemplateId(e.target.value)}>
          {npcTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="panel-error">{error}</p>}
      <button type="button" className="panel-btn panel-btn--ghost" disabled={submitting} onClick={handlePull}>
        <PlusIcon weight="bold" />
        Pull Into Combat
      </button>
    </div>
  );
}

export default function CombatPage() {
  const { token, user } = useAuth();
  const { encounter: liveEncounter, slugUpdate, blasterUpdate, shotFx, shotResolved } = useLiveState();
  const [encounter, setEncounter] = useState(undefined);
  const [players, setPlayers] = useState([]);
  const [mechas, setMechas] = useState([]);
  const [npcTemplates, setNpcTemplates] = useState([]);
  const [mode, setMode] = useState(null);
  const [actingId, setActingId] = useState(null);
  const [drawMode, setDrawMode] = useState(false);
  const [error, setError] = useState(null);
  const [allSlugs, setAllSlugs] = useState([]);
  const [allBlasters, setAllBlasters] = useState([]);
  const [actionPicker, setActionPicker] = useState(null); // slug awaiting an Attack/Break Wall/Make Wall/Build Bridge choice

  const isDM = user?.role === "Dungeon Master";

  useEffect(() => {
    fetch("/api/combat/active", { headers: authHeaders(token) })
      .then((res) => res.json())
      .then((data) => setEncounter(data.encounter))
      .catch(() => setEncounter(null));
  }, [token]);

  useEffect(() => {
    if (liveEncounter === null || liveEncounter === undefined) return;
    setEncounter(liveEncounter.status === "finished" ? null : liveEncounter);
  }, [liveEncounter]);

  useEffect(() => {
    if (!isDM) return;
    fetch("/api/admin/users", { headers: authHeaders(token) })
      .then((res) => res.json())
      .then((data) => setPlayers((data.users || []).filter((u) => u.role === "Player")))
      .catch(() => {});
    fetch("/api/mechas", { headers: authHeaders(token) })
      .then((res) => res.json())
      .then((data) => setMechas(data.mechas || []))
      .catch(() => {});
    fetch("/api/npc-templates", { headers: authHeaders(token) })
      .then((res) => res.json())
      .then((data) => setNpcTemplates(data.templates || []))
      .catch(() => {});
  }, [isDM, token]);

  useEffect(() => {
    const slugUrl = isDM ? "/api/slugs" : "/api/slugs/me";
    const blasterUrl = isDM ? "/api/blasters" : "/api/blasters/me";
    fetch(slugUrl, { headers: authHeaders(token) })
      .then((res) => res.json())
      .then((data) => setAllSlugs(data.slugs || []))
      .catch(() => {});
    fetch(blasterUrl, { headers: authHeaders(token) })
      .then((res) => res.json())
      .then((data) => setAllBlasters(data.blasters || []))
      .catch(() => {});
  }, [isDM, token]);

  useEffect(() => {
    if (!slugUpdate) return;
    if (!isDM && slugUpdate.userId !== user?.id) return;
    setAllSlugs((prev) => {
      if (!slugUpdate.slug) return prev.filter((s) => s.id !== slugUpdate.slugId);
      const exists = prev.some((s) => s.id === slugUpdate.slug.id);
      return exists ? prev.map((s) => (s.id === slugUpdate.slug.id ? slugUpdate.slug : s)) : [...prev, slugUpdate.slug];
    });
  }, [slugUpdate, isDM, user]);

  useEffect(() => {
    if (!blasterUpdate) return;
    if (!isDM && blasterUpdate.userId !== user?.id) return;
    setAllBlasters((prev) => {
      if (!blasterUpdate.blaster) return prev.filter((b) => b.id !== blasterUpdate.blasterId);
      const exists = prev.some((b) => b.id === blasterUpdate.blaster.id);
      return exists ? prev.map((b) => (b.id === blasterUpdate.blaster.id ? blasterUpdate.blaster : b)) : [...prev, blasterUpdate.blaster];
    });
  }, [blasterUpdate, isDM, user]);

  const myCombatant = useMemo(
    () => encounter?.combatants.find((c) => c.kind === "character" && c.refUserId === user?.id) || null,
    [encounter, user]
  );

  useEffect(() => {
    if (!encounter) return;
    if (!isDM) {
      setActingId(myCombatant?.id ?? null);
      return;
    }
    if (actingId && encounter.combatants.some((c) => c.id === actingId)) return;
    setActingId(encounter.activeCombatantId ?? encounter.combatants[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter, isDM, myCombatant]);

  const actingCombatant = encounter?.combatants.find((c) => c.id === actingId) || null;

  // Every slug loaded into the active weapon, regardless of whether it's
  // actually ready to fire right now -- one still counting down its
  // return-to-hand cooldown, or one that's simply out of charge, is still
  // shown (CombatSlugPanel dims it and marks why) rather than disappearing.
  const eligibleSlugs = useMemo(() => {
    if (!actingCombatant || (actingCombatant.kind !== "character" && actingCombatant.kind !== "npc")) return [];
    const activeSlot = actingCombatant.data?.activeWeaponSlot ?? 0;
    return allSlugs.filter((s) => {
      const owned =
        actingCombatant.kind === "character"
          ? s.userId === actingCombatant.refUserId
          : s.ownerCombatantId === actingCombatant.id;
      if (!owned) return false;
      if (!s.equippedBlasterId) return false;
      const blaster = allBlasters.find((b) => b.id === s.equippedBlasterId);
      if (!blaster || blaster.equipSlot == null) return false;
      // Only characters carry two weapon slots -- an NPC's single loadout
      // has no "other" slot to be holstered in.
      if (actingCombatant.kind === "character" && blaster.equipSlot !== activeSlot) return false;
      return true;
    });
  }, [actingCombatant, allSlugs, allBlasters]);

  // Drives the hotbar's Switch Weapon button: which slot is active now, and
  // whether the character actually has a blaster equipped in the *other*
  // slot to switch to (nothing to do if their secondary is empty).
  const weaponSwitch = useMemo(() => {
    if (!actingCombatant || actingCombatant.kind !== "character") return null;
    const activeSlot = actingCombatant.data?.activeWeaponSlot ?? 0;
    const otherSlot = activeSlot === 0 ? 1 : 0;
    const hasOther = allBlasters.some((b) => b.userId === actingCombatant.refUserId && b.equipSlot === otherSlot);
    return { activeSlot, otherSlot, hasOther };
  }, [actingCombatant, allBlasters]);

  const rangeRing = useMemo(() => {
    if (!actingCombatant || mode?.type !== "shoot") return null;
    const slug = allSlugs.find((s) => s.id === mode.slugId);
    if (!slug) return null;
    const blaster = allBlasters.find((b) => b.id === slug.equippedBlasterId);
    // Mirrors the server's combinedRange = max(blaster.range, type's range).
    return { x: actingCombatant.x, y: actingCombatant.y, r: Math.max(blaster?.range || 0, typeRange(slug.type)) };
  }, [actingCombatant, mode, allSlugs, allBlasters]);

  // Every mutating call below applies its own response's `encounter` to
  // local state directly, rather than waiting on the websocket echo to come
  // back around. The broadcast still updates everyone *else* watching the
  // encounter; this just guarantees the acting client's own view updates
  // immediately, every time, with no dependency on ws delivery timing.
  function applyEncounter(data) {
    if (data?.encounter) setEncounter(data.encounter);
  }

  async function handleCreate(name) {
    const data = await postJson(token, "/api/combat/encounters", { name });
    setEncounter(data.encounter);
  }

  async function handleAddCombatant(payload) {
    setError(null);
    try {
      applyEncounter(await postJson(token, `/api/combat/encounters/${encounter.id}/combatants`, payload));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function handleStart() {
    setError(null);
    try {
      applyEncounter(await postJson(token, `/api/combat/encounters/${encounter.id}/start`));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleEndEncounter() {
    setError(null);
    try {
      await postJson(token, `/api/combat/encounters/${encounter.id}/end`);
      setEncounter(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAddWall(w) {
    setError(null);
    try {
      applyEncounter(await postJson(token, `/api/combat/encounters/${encounter.id}/walls`, w));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleMapUpdate(patch) {
    setError(null);
    try {
      applyEncounter(await patchJson(token, `/api/combat/encounters/${encounter.id}/map`, patch));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemoveWall(wallId) {
    setError(null);
    try {
      applyEncounter(await del(token, `/api/combat/encounters/${encounter.id}/walls/${wallId}`));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemoveCombatant(id) {
    setError(null);
    try {
      applyEncounter(await del(token, `/api/combat/encounters/${encounter.id}/combatants/${id}`));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handlePullNpc(npcTemplateId) {
    setError(null);
    try {
      const px = 150 + Math.random() * 300;
      const py = 150 + Math.random() * 200;
      applyEncounter(
        await postJson(token, `/api/combat/encounters/${encounter.id}/npc-combatants`, { npcTemplateId, x: px, y: py })
      );
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  function handleRosterRowClick(combatant) {
    if (!isDM) return;
    setActingId(combatant.id);
    setMode(null);
  }

  async function handleRevive(id) {
    setError(null);
    try {
      applyEncounter(await postJson(token, "/api/combat/actions/revive", { combatantId: id }));
    } catch (err) {
      setError(err.message);
    }
  }

  function cancelMode() {
    setMode(null);
  }

  async function runAction(name) {
    if (!actingCombatant) return;
    setError(null);
    try {
      if (name === "hunker-down") {
        applyEncounter(await postJson(token, "/api/combat/actions/hunker-down", { combatantId: actingCombatant.id }));
      } else if (name === "end-turn") {
        applyEncounter(await postJson(token, "/api/combat/actions/end-turn", { combatantId: actingCombatant.id }));
      } else if (name === "dismount") {
        applyEncounter(await postJson(token, "/api/combat/actions/dismount", { combatantId: actingCombatant.id }));
      } else if (name === "switch-weapon") {
        applyEncounter(await postJson(token, "/api/combat/actions/switch-weapon", { combatantId: actingCombatant.id }));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleBackgroundClick(point) {
    // Break Wall / Make Wall / Build Bridge target a bare map point, not a
    // combatant -- a background click during one of those is the shot
    // itself, not a mode-cancel like every other background click is.
    if (mode?.type === "shoot" && mode.actionType && mode.actionType !== "attack" && actingCombatant) {
      setError(null);
      try {
        applyEncounter(
          await postJson(token, "/api/combat/actions/shoot", {
            attackerId: actingCombatant.id,
            slugId: mode.slugId,
            actionType: mode.actionType,
            targetPoint: point,
          })
        );
      } catch (err) {
        setError(err.message);
      }
      setMode(null);
      return;
    }
    if (mode) setMode(null);
  }

  function isDraggable(combatant) {
    if (!encounter) return false;
    if (isDM) return true;
    if (encounter.status !== "active") return false;
    return combatant.id === actingCombatant?.id && combatant.kind === "character" && combatant.refUserId === user?.id;
  }

  async function handleTokenDragEnd(combatant, point) {
    setError(null);
    try {
      if (isDM) {
        applyEncounter(
          await patchJson(token, `/api/combat/encounters/${encounter.id}/combatants/${combatant.id}/position`, point)
        );
      } else {
        applyEncounter(await postJson(token, "/api/combat/actions/move", { combatantId: combatant.id, x: point.x, y: point.y }));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleTokenClick(target) {
    if (mode?.type === "shoot" && actingCombatant) {
      setError(null);
      // A Break Wall / Make Wall / Build Bridge shot targets a map point --
      // clicking a token while one of those is armed just aims at that
      // token's spot, same as clicking empty ground there would.
      const isEnvAction = mode.actionType && mode.actionType !== "attack";
      try {
        applyEncounter(
          await postJson(token, "/api/combat/actions/shoot", {
            attackerId: actingCombatant.id,
            slugId: mode.slugId,
            actionType: mode.actionType || "attack",
            ...(isEnvAction ? { targetPoint: { x: target.x, y: target.y } } : { targetId: target.id }),
          })
        );
      } catch (err) {
        setError(err.message);
      }
      setMode(null);
      return;
    }
    if (mode?.type === "mount" && actingCombatant) {
      setError(null);
      try {
        applyEncounter(
          await postJson(token, "/api/combat/actions/mount", { combatantId: actingCombatant.id, mechaCombatantId: target.id })
        );
      } catch (err) {
        setError(err.message);
      }
      setMode(null);
      return;
    }
    if (mode?.type === "ram") {
      setError(null);
      try {
        applyEncounter(
          await postJson(token, "/api/combat/actions/ram", { mechaCombatantId: mode.mechaId, targetCombatantId: target.id })
        );
      } catch (err) {
        setError(err.message);
      }
      setMode(null);
      return;
    }
    handleRosterRowClick(target);
  }

  function handlePickSlug(slug) {
    if (!slug) {
      setMode(null);
      return;
    }
    // A slug that can also break/make a wall or build a bridge gets a
    // picker for which of those (plus the always-available Attack) it's
    // firing for this shot -- a plain slug skips straight to Attack, same
    // as before.
    if (slug.breaksWalls || slug.wallMaker || slug.bridgeMaker) {
      setActionPicker(slug);
      return;
    }
    setMode({ type: "shoot", slugId: slug.id, slugName: slug.name, actionType: "attack" });
  }

  function handlePickSlugAction(slug, actionType) {
    setActionPicker(null);
    setMode({ type: "shoot", slugId: slug.id, slugName: slug.name, actionType });
  }

  if (encounter === undefined) return null;

  if (!encounter) {
    return (
      <div className="combat-page combat-page--empty">
        <TopBar />
        {isDM ? (
          <NewEncounterForm onCreate={handleCreate} />
        ) : (
          <div className="panel panel--quiet combat-empty-card">
            <div className="panel-body">
              <p>No encounter in progress. Your Dungeon Master hasn't started combat yet.</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (encounter.status === "setup") {
    return (
      <div className="combat-page">
        <TopBar title={encounter.name} subtitle="Setting up" />
        <div className="panel combat-setup-panel">
          <div className="panel-header">
            <span className="panel-header-icon">
              <SwordIcon weight="duotone" />
            </span>
            <div className="panel-header-text">
              <h2>{encounter.name}</h2>
              <p>Setting up -- add combatants, then start.</p>
            </div>
            {isDM && (
              <button type="button" className="panel-btn" disabled={encounter.combatants.length === 0} onClick={handleStart}>
                Start Encounter
              </button>
            )}
          </div>
          <div className="panel-body">
            {isDM && <AddCombatantForm players={players} mechas={mechas} onAdd={handleAddCombatant} />}
            {isDM && <PullNpcForm npcTemplates={npcTemplates} onPull={handlePullNpc} />}
            <div className="combat-setup-list">
              {encounter.combatants.map((c) => (
                <div key={c.id} className="combat-setup-item">
                  <span>{c.name}</span>
                  <span className="combat-setup-item-kind">{c.kind}</span>
                  {isDM && (
                    <button type="button" className="panel-btn panel-btn--icon panel-btn--ghost" onClick={() => handleRemoveCombatant(c.id)}>
                      <XIcon weight="bold" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {error && <p className="panel-error">{error}</p>}
          </div>
        </div>

        {isDM && (
          <div className="combat-setup-map">
            <div className="combat-setup-map-controls">
              <button
                type="button"
                className={`panel-btn panel-btn--ghost ${drawMode ? "combat-toggle--on" : ""}`}
                onClick={() => setDrawMode((v) => !v)}
              >
                Draw Walls
              </button>
              <p className="combat-map-drag-hint">Drag a token to place it.</p>
            </div>
            <CombatMap
              encounter={encounter}
              isDM={isDM}
              viewerUserId={user?.id}
              drawMode={drawMode}
              onAddWall={handleAddWall}
              onRemoveWall={handleRemoveWall}
              onBackgroundClick={handleBackgroundClick}
              onTokenClick={() => {}}
              isDraggable={isDraggable}
              onTokenDragEnd={handleTokenDragEnd}
              onMapUpdate={handleMapUpdate}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="combat-page combat-page--active">
      <TopBar title={encounter.name} subtitle={`Round ${encounter.round}`}>
        {isDM && (
          <>
            <button
              type="button"
              className={`panel-btn panel-btn--ghost ${drawMode ? "combat-toggle--on" : ""}`}
              onClick={() => setDrawMode((v) => !v)}
            >
              Draw Walls
            </button>
            <button type="button" className="panel-btn panel-btn--ghost" onClick={handleEndEncounter}>
              End Encounter
            </button>
          </>
        )}
      </TopBar>

      <div className="combat-page-columns">
        <CombatSlugPanel actingCombatant={actingCombatant} slugs={eligibleSlugs} armedSlugId={mode?.type === "shoot" ? mode.slugId : null} onPickSlug={handlePickSlug} />

        <div className="combat-page-center">
          <CombatMap
            encounter={encounter}
            isDM={isDM}
            viewerUserId={user?.id}
            drawMode={drawMode}
            onAddWall={handleAddWall}
            onRemoveWall={handleRemoveWall}
            onBackgroundClick={handleBackgroundClick}
            onTokenClick={handleTokenClick}
            activeCombatantId={encounter.activeCombatantId}
            actingCombatantId={actingCombatant?.id}
            rangeRing={rangeRing}
            isDraggable={isDraggable}
            showDragApCost
            estimateApCost={estimateApCost}
            onTokenDragEnd={handleTokenDragEnd}
            onMapUpdate={handleMapUpdate}
            shotFx={shotFx}
            shotResolved={shotResolved}
          />
          <CombatHotbar
            actingCombatant={actingCombatant}
            isActiveTurn={actingCombatant?.id === encounter.activeCombatantId}
            mode={mode}
            weaponSwitch={weaponSwitch}
            onArmMode={setMode}
            onCancelMode={cancelMode}
            onAction={runAction}
          />
          {error && <p className="panel-error combat-page-error">{error}</p>}
        </div>

        <div className="combat-page-right">
          <CombatRoster
            encounter={encounter}
            isDM={isDM}
            viewerUserId={user?.id}
            actingCombatantId={actingCombatant?.id}
            onSelect={handleRosterRowClick}
            onRevive={handleRevive}
            onRemove={handleRemoveCombatant}
          />
          <CombatLog encounterId={encounter.id} />
        </div>
      </div>

      {actionPicker && (
        <SlugActionModal slug={actionPicker} onPick={handlePickSlugAction} onClose={() => setActionPicker(null)} />
      )}
    </div>
  );
}
