import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ScrollIcon, SwordIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import NavBar from "./NavBar.jsx";
import CombatMap from "./CombatMap.jsx";
import CombatSetup from "./CombatSetup.jsx";
import CombatHotbar from "./CombatHotbar.jsx";
import CombatSlugPanel, { HolsteredSlugs } from "./CombatSlugPanel.jsx";
import CombatRoster from "./CombatRoster.jsx";
import CombatLog from "./CombatLog.jsx";
import SlugActionModal, { MEGA_MORPH_MIN_SPEED, MEGA_MORPH_PIP_COST } from "./SlugActionModal.jsx";
import { DUAL_SHOT_BASE_TYPE, canJoinDualShot } from "./dualShot.js";
import MindScrambleModal from "./MindScrambleModal.jsx";
import FrictionModal from "./FrictionModal.jsx";
import HunkerConfirmModal from "./HunkerConfirmModal.jsx";
import {
  combatantSkillMod,
  areAllies,
  moveSpeedPerAp,
  reloadApCostFor,
  wallRunApCost,
  firstAidApCost,
  HIDE_AP_COST,
  HIDE_RANGE,
  INTIMIDATE_AP_COST,
  makeWaterSet,
  isWaterAt,
  pathApCost,
  modeBlasterSpeedFactor,
  modeMechaSpeedFactor,
  modeIgnoresWater,
  effectiveMode,
  WATER_FOOT_COST_MULT,
} from "./combatSkills.js";
import { typeRange } from "./slugData.js";
import { effectiveReloadApCost } from "./itemData.js";
import { combatantNameColor } from "./combatDisplay.js";
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
const MOVE_SPEED_PER_AP = 80; // mirrors server combatRules.js -- walking distance only; a given walk costs 2.5x the AP vs. the old 200
const WALL_RUN_RANGE = 40; // mirrors server -- how close to a wall you must be
const MOUNT_RANGE = MOVE_SPEED_PER_AP; // mirrors server -- 1 AP of walking, to mount / dismount / ram

function TopBar({ title, subtitle, children }) {
  return (
    <div className="combat-topbar">
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


export default function CombatPage() {
  const { token, user } = useAuth();
  const { encounter: liveEncounter, slugUpdate, blasterUpdate, modUpdate, shotFx, shotResolved, damageFlash, gruntTemplatesUpdate, gearChanged, partyHealed, podsUpdate, marketChanged, tradeCompleted } = useLiveState();
  const [flashActive, setFlashActive] = useState(false);
  const [encounter, setEncounter] = useState(undefined);
  const [players, setPlayers] = useState([]);
  const [mechas, setMechas] = useState([]);
  const [npcTemplates, setNpcTemplates] = useState([]);
  const [gruntTemplates, setGruntTemplates] = useState([]);
  const [mode, setMode] = useState(null);
  const [actingId, setActingId] = useState(null);
  const [drawMode, setDrawMode] = useState(false);
  const [waterMode, setWaterMode] = useState(null); // setup-only: "paint" | "erase" | null
  const [waterBrush, setWaterBrush] = useState(3); // brush width in water cells
  const [error, setError] = useState(null);
  const [allSlugs, setAllSlugs] = useState([]);
  const [allBlasters, setAllBlasters] = useState([]);
  // Only read to learn which blasters carry a dual-shot mod (see dualInfoFor).
  const [allMods, setAllMods] = useState([]);
  const [actionPicker, setActionPicker] = useState(null); // slug awaiting an Attack/Break Wall/Make Wall/Build Bridge choice
  const [mindScramblePicker, setMindScramblePicker] = useState(null); // Perplexus awaiting an effect choice
  const [frictionPicker, setFrictionPicker] = useState(null); // Psi awaiting a friction choice
  const [wallRunId, setWallRunId] = useState(null); // combatant mid Wall Run -- gives its token the slow slide
  const [hunkerConfirm, setHunkerConfirm] = useState(null); // { ap, conMod } while awaiting "spend all AP?" confirmation

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

  // A red flash across this player's own screen when their combatant takes
  // a Pressure Tick pod hit (see combat-damage-flash in AccessSocket.jsx) --
  // deliberately not tied to whether the map is even scrolled to that spot.
  useEffect(() => {
    if (!damageFlash) return;
    setFlashActive(true);
    const timer = setTimeout(() => setFlashActive(false), 1000);
    return () => clearTimeout(timer);
  }, [damageFlash]);

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
      .then((data) => setNpcTemplates((data.templates || []).filter((t) => t.combatReady !== false)))
      .catch(() => {});
  }, [isDM, token]);

  useEffect(() => {
    if (!isDM) return;
    fetch("/api/grunt-templates", { headers: authHeaders(token) })
      .then((res) => res.json())
      .then((data) => setGruntTemplates(data.templates || []))
      .catch(() => {});
  }, [isDM, token, gruntTemplatesUpdate]);

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
    fetch(isDM ? "/api/mods" : "/api/mods/me", { headers: authHeaders(token) })
      .then((res) => res.json())
      .then((data) => setAllMods(data.mods || []))
      .catch(() => {});
    // gearChanged: an NPC was just kitted out. Its per-row slug/blaster
    // broadcasts arrive as a burst the live state can't hold (only the last
    // survives), so refetch everything instead of trusting them.
    // partyHealed: Heal All refills every slug's pips in one burst, same story.
  }, [isDM, token, gearChanged, partyHealed]);

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

  // Keeps the Range Finder / dual-shot / speed-bonus mod checks live when a
  // mod is equipped or removed mid-battle, instead of only on page load.
  useEffect(() => {
    if (!modUpdate) return;
    if (!isDM && modUpdate.userId !== user?.id) return;
    setAllMods((prev) => {
      if (!modUpdate.mod) return prev.filter((m) => m.id !== modUpdate.modId);
      const exists = prev.some((m) => m.id === modUpdate.mod.id);
      return exists ? prev.map((m) => (m.id === modUpdate.mod.id ? modUpdate.mod : m)) : [...prev, modUpdate.mod];
    });
  }, [modUpdate, isDM, user]);

  const myCombatant = useMemo(
    () => encounter?.combatants.find((c) => c.kind === "character" && c.refUserId === user?.id) || null,
    [encounter, user]
  );

  useEffect(() => {
    if (!encounter) return;
    if (!isDM) {
      // When it's this player's own unmounted mecha's turn, hand them the
      // mecha's controls (move + End Turn); otherwise they drive their
      // character. A ridden mecha never gets its own turn (server skips it).
      const active = encounter.combatants.find((c) => c.id === encounter.activeCombatantId);
      const ownsActiveMecha =
        active?.kind === "mecha" &&
        active.data?.ownerUserId === user?.id &&
        !encounter.combatants.some((c) => c.mountedOn === active.id);
      setActingId(ownsActiveMecha ? active.id : myCombatant?.id ?? null);
      return;
    }
    if (actingId && encounter.combatants.some((c) => c.id === actingId)) return;
    setActingId(encounter.activeCombatantId ?? encounter.combatants[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter, isDM, myCombatant, user]);

  const actingCombatant = encounter?.combatants.find((c) => c.id === actingId) || null;

  // Spare slug pods for the character being played (null for NPCs/grunts --
  // they have infinite pods and never see the pod UI). A reload that finds a
  // slug whose pod was shattered by a misfire spends one of these.
  const podUserId = actingCombatant?.kind === "character" ? actingCombatant.refUserId : null;
  const [pods, setPods] = useState(null);
  useEffect(() => {
    if (podUserId == null) {
      setPods(null);
      return undefined;
    }
    let cancelled = false;
    const url = isDM ? `/api/characters/${podUserId}` : "/api/characters/me";
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((b) => {
        if (!cancelled && Number.isInteger(b.character?.pods)) setPods(b.character.pods);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [podUserId, isDM, token, marketChanged, tradeCompleted]);
  useEffect(() => {
    if (podsUpdate && podsUpdate.userId === podUserId) setPods(podsUpdate.pods);
  }, [podsUpdate, podUserId]);

  // Every slug loaded into the active weapon, regardless of whether it's
  // actually ready to fire right now -- one still counting down its
  // return-to-hand cooldown, or one that's simply out of charge, is still
  // shown (CombatSlugPanel dims it and marks why) rather than disappearing.
  const eligibleSlugs = useMemo(() => {
    if (!actingCombatant || (actingCombatant.kind !== "character" && actingCombatant.kind !== "npc")) return [];
    const activeSlot = actingCombatant.data?.activeWeaponSlot ?? 0;
    return allSlugs
      .filter((s) => {
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
      })
      // Magazine-slot order, so the panel (and its 1-9 hotkeys) matches the
      // loadout screen and the counter-clash prompt.
      .sort((a, b) => (a.magazineSlot ?? 99) - (b.magazineSlot ?? 99) || a.id - b.id);
  }, [actingCombatant, allSlugs, allBlasters]);

  // The weapon in the *other* slot (characters only): its blaster and the slugs
  // loaded in it, shown read-only in a small side panel so a Switch Weapon
  // decision can see what's waiting there and how long its cooldowns have left.
  const holstered = useMemo(() => {
    if (!actingCombatant || actingCombatant.kind !== "character") return null;
    const activeSlot = actingCombatant.data?.activeWeaponSlot ?? 0;
    const blaster = allBlasters.find(
      (b) => b.userId === actingCombatant.refUserId && b.equipSlot != null && b.equipSlot !== activeSlot
    );
    if (!blaster) return null;
    const slugs = allSlugs
      .filter((s) => s.userId === actingCombatant.refUserId && s.equippedBlasterId === blaster.id)
      .sort((a, b) => (a.magazineSlot ?? 99) - (b.magazineSlot ?? 99) || a.id - b.id);
    return { blaster, slugs };
  }, [actingCombatant, allSlugs, allBlasters]);

  // The active weapon's base type -- lets the slug panel show a Gatling's
  // reduced shot AP cost (see BASE_TYPE_EFFECT_NOTES / server itemRules.js).
  const activeBlasterBaseType = useMemo(() => {
    if (!actingCombatant || (actingCombatant.kind !== "character" && actingCombatant.kind !== "npc")) return null;
    const activeSlot = actingCombatant.data?.activeWeaponSlot ?? 0;
    const blaster = allBlasters.find((b) => {
      const owned =
        actingCombatant.kind === "character"
          ? b.userId === actingCombatant.refUserId
          : b.ownerCombatantId === actingCombatant.id;
      if (!owned || b.equipSlot == null) return false;
      return actingCombatant.kind === "character" ? b.equipSlot === activeSlot : true;
    });
    return blaster?.baseType ?? null;
  }, [actingCombatant, allBlasters]);

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

  // Drives the hotbar's Reload button: the active weapon's reload AP cost and
  // how many of this combatant's slugs have returned to hand but aren't
  // chambered (loaded === false, cooldown done). Mirrors the server's
  // /actions/reload targeting.
  const reloadInfo = useMemo(() => {
    if (!actingCombatant || (actingCombatant.kind !== "character" && actingCombatant.kind !== "npc")) return null;
    const activeSlot = actingCombatant.data?.activeWeaponSlot ?? 0;
    const activeBlaster = allBlasters.find((b) => {
      const owned =
        actingCombatant.kind === "character"
          ? b.userId === actingCombatant.refUserId
          : b.ownerCombatantId === actingCombatant.id;
      if (!owned || b.equipSlot == null) return false;
      return actingCombatant.kind === "character" ? b.equipSlot === activeSlot : true;
    });
    if (!activeBlaster) return null;
    const waiting = allSlugs.filter(
      (s) => s.equippedBlasterId === activeBlaster.id && s.loaded === false && (s.cooldownTurnsLeft || 0) === 0
    );
    // A slug whose pod was destroyed needs a spare pod to go back in (players
    // only); how many can be covered is capped by the pods on hand.
    const needsPod = pods == null ? 0 : waiting.filter((s) => s.podBroken).length;
    const podless = Math.max(0, needsPod - (pods ?? 0));
    const equippedMods = allMods.filter((m) => m.equippedBlasterId === activeBlaster.id);
    return { apCost: reloadApCostFor(effectiveReloadApCost(activeBlaster, equippedMods), combatantSkillMod(actingCombatant, "sleightOfHand")), pending: waiting.length - podless, noPods: podless };
  }, [actingCombatant, allBlasters, allSlugs, allMods, pods]);

  // Wall Run: 6 AP minus Acrobatics (NPCs use DEX), and only offered right
  // next to a wall. Mirrors server planWallRun/wallRunApCost -- preview only.
  const wallRunInfo = useMemo(() => {
    if (!actingCombatant || (actingCombatant.kind !== "character" && actingCombatant.kind !== "npc")) return null;
    const mod = combatantSkillMod(actingCombatant, "acrobatics");
    const nearWall = (encounter?.walls || []).some((w) => {
      const dx = w.x2 - w.x1;
      const dy = w.y2 - w.y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1e-9) return false;
      const t = Math.max(0, Math.min(1, ((actingCombatant.x - w.x1) * dx + (actingCombatant.y - w.y1) * dy) / lenSq));
      return Math.hypot(actingCombatant.x - (w.x1 + t * dx), actingCombatant.y - (w.y1 + t * dy)) <= WALL_RUN_RANGE;
    });
    return { apCost: wallRunApCost(mod), nearWall, skilled: mod > 0 };
  }, [actingCombatant, encounter]);

  // Skill actions beyond Wall Run: Hide (Stealth), Intimidate, First Aid
  // (Medicine). Stealth / Intimidation need a positive modifier; Hide also
  // needs nobody hostile within HIDE_RANGE. Mirrors the server's checks.
  const skillActionInfo = useMemo(() => {
    if (!actingCombatant || (actingCombatant.kind !== "character" && actingCombatant.kind !== "npc")) return null;
    const foesNearby = (encounter?.combatants || []).some(
      (c) =>
        c.id !== actingCombatant.id &&
        c.kind !== "decoy" &&
        !c.unconscious &&
        !c.disabled &&
        !areAllies(actingCombatant, c) &&
        Math.hypot(c.x - actingCombatant.x, c.y - actingCombatant.y) <= HIDE_RANGE
    );
    return {
      hide: { apCost: HIDE_AP_COST, skilled: combatantSkillMod(actingCombatant, "stealth") > 0, foesNearby, tried: !!actingCombatant.statusEffects?.hideTried },
      intimidate: { apCost: INTIMIDATE_AP_COST, skilled: combatantSkillMod(actingCombatant, "intimidation") > 0 },
      firstAid: { apCost: firstAidApCost(combatantSkillMod(actingCombatant, "medicine")) },
    };
  }, [actingCombatant, encounter]);

  const rangeRing = useMemo(() => {
    if (!actingCombatant || mode?.type !== "shoot") return null;
    const slug = allSlugs.find((s) => s.id === mode.slugId);
    if (!slug) return null;
    const blaster = allBlasters.find((b) => b.id === slug.equippedBlasterId);
    if (!blaster) return null;
    // Players only see it if the firing weapon has a Range Finder mod
    // equipped (same check dualInfoFor uses for grantsDualShot). The DM
    // always sees it, for characters and NPCs alike.
    const hasRangeFinder = allMods.some((m) => m.equippedBlasterId === blaster.id && m.grantsRangeFinder);
    if (!isDM && !hasRangeFinder) return null;
    // Mirrors the server's combinedRange = blaster.range + type's range --
    // the two stack.
    return { x: actingCombatant.x, y: actingCombatant.y, r: blaster.range + typeRange(slug.type) };
  }, [actingCombatant, mode, allSlugs, allBlasters, allMods, isDM]);

  // While "Mount" is armed, show how close you have to be -- a ring at
  // MOUNT_RANGE around the character, with every in-range mecha highlighted
  // (CombatMap does the per-token highlight from this).
  const mountRing = useMemo(() => {
    if (!actingCombatant || mode?.type !== "mount") return null;
    return { x: actingCombatant.x, y: actingCombatant.y, r: MOUNT_RANGE };
  }, [actingCombatant, mode]);

  // The mecha the acting character is riding, if any -- drives the hotbar's
  // dual AP display and the Ram button's enable state.
  const mountedMecha = useMemo(() => {
    if (!encounter || actingCombatant?.mountedOn == null) return null;
    return encounter.combatants.find((c) => c.id === actingCombatant.mountedOn) || null;
  }, [encounter, actingCombatant]);

  // Which mod-granted modes the ridden mecha has, and the one it's in now.
  const modeInfo = useMemo(() => {
    if (!mountedMecha) return null;
    return { modes: mountedMecha.data?.modes || [], current: mountedMecha.data?.mode ?? null };
  }, [mountedMecha]);

  // Whether there's any mecha this combatant could actually mount -- a live
  // (non-disabled) one they own is in the fight. Nothing to mount => the
  // Mount button stays disabled. NPCs (no refUserId) keep the old behaviour;
  // the DM can put them on any mecha.
  const hasMountableMecha = useMemo(() => {
    if (!encounter || !actingCombatant) return false;
    return encounter.combatants.some(
      (c) =>
        c.kind === "mecha" &&
        !c.disabled &&
        (actingCombatant.refUserId == null || c.data?.ownerUserId === actingCombatant.refUserId)
    );
  }, [encounter, actingCombatant]);

  // A mounted rider moves at their mecha's speed and spends the mecha's AP; a
  // lone mecha covers a character's walk times its own speed. Mirrors the
  // server's /actions/move math -- preview only.
  const estimateApCost = useCallback(
    (combatant, dist, from, to) => {
      const water = makeWaterSet(encounter?.water);
      let vehicle = null;
      if (combatant.kind === "mecha") vehicle = combatant;
      else if (combatant.mountedOn != null) vehicle = encounter?.combatants.find((c) => c.id === combatant.mountedOn) || null;
      let speedPerAp;
      let mode = null;
      if (vehicle) {
        mode = vehicle.data?.mode ?? null;
        const inWater = isWaterAt(water, { x: vehicle.x, y: vehicle.y });
        speedPerAp = MOVE_SPEED_PER_AP * Math.max(1, vehicle.data?.speed || 1) * modeMechaSpeedFactor(mode, inWater);
      } else {
        speedPerAp = moveSpeedPerAp(combatantSkillMod(combatant, "athletics"));
      }
      if (from && to) return pathApCost(from, to, water, speedPerAp, modeIgnoresWater(mode), vehicle ? undefined : WATER_FOOT_COST_MULT);
      return Math.max(1, Math.ceil(dist / speedPerAp));
    },
    [encounter]
  );

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

  async function handlePaintWater(cells, paint) {
    setError(null);
    try {
      applyEncounter(await patchJson(token, `/api/combat/encounters/${encounter.id}/water`, { cells, paint }));
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

  async function handleSetTeam(id, team) {
    setError(null);
    try {
      applyEncounter(await patchJson(token, `/api/combat/encounters/${encounter.id}/combatants/${id}/team`, { team }));
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

  async function handlePullNpc(payload) {
    setError(null);
    try {
      applyEncounter(await postJson(token, `/api/combat/encounters/${encounter.id}/npc-combatants`, payload));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function handlePullGrunt(payload) {
    setError(null);
    try {
      applyEncounter(await postJson(token, `/api/combat/encounters/${encounter.id}/grunt-combatants`, payload));
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
        // Hunker Down burns *all* remaining AP -- confirm first if there's more
        // than one to lose, so a stray click doesn't end the turn.
        if ((actingCombatant.currentAp ?? 0) > 1) {
          setHunkerConfirm({ ap: actingCombatant.currentAp, conMod: actingCombatant.data?.conMod ?? 0 });
          return;
        }
        applyEncounter(await postJson(token, "/api/combat/actions/hunker-down", { combatantId: actingCombatant.id }));
      } else if (name === "end-turn") {
        applyEncounter(await postJson(token, "/api/combat/actions/end-turn", { combatantId: actingCombatant.id }));
      } else if (name === "dismount") {
        applyEncounter(await postJson(token, "/api/combat/actions/dismount", { combatantId: actingCombatant.id }));
      } else if (name === "switch-weapon") {
        applyEncounter(await postJson(token, "/api/combat/actions/switch-weapon", { combatantId: actingCombatant.id }));
      } else if (name === "mode-off" || name.startsWith("mode-")) {
        applyEncounter(
          await postJson(token, "/api/combat/actions/mecha-mode", {
            combatantId: actingCombatant.id,
            mode: name === "mode-off" ? null : name.slice(5),
          })
        );
      } else if (name === "hide") {
        applyEncounter(await postJson(token, "/api/combat/actions/hide", { combatantId: actingCombatant.id }));
      } else if (name === "wall-run") {
        const runnerId = actingCombatant.id;
        applyEncounter(await postJson(token, "/api/combat/actions/wall-run", { combatantId: runnerId }));
        setWallRunId(runnerId);
        setTimeout(() => setWallRunId((cur) => (cur === runnerId ? null : cur)), 1100);
      } else if (name === "reload") {
        applyEncounter(await postJson(token, "/api/combat/actions/reload", { combatantId: actingCombatant.id }));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function confirmHunker() {
    setHunkerConfirm(null);
    if (!actingCombatant) return;
    setError(null);
    try {
      applyEncounter(await postJson(token, "/api/combat/actions/hunker-down", { combatantId: actingCombatant.id }));
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
    if (combatant.id !== actingCombatant?.id) return false;
    if (combatant.kind === "character" && combatant.refUserId === user?.id) return true;
    // Your own mecha, on its own turn, only while nobody's riding it.
    if (
      combatant.kind === "mecha" &&
      combatant.data?.ownerUserId === user?.id &&
      !encounter.combatants.some((c) => c.mountedOn === combatant.id)
    ) {
      return true;
    }
    return false;
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
            ...(mode.effectChoice ? { effectChoice: mode.effectChoice } : {}),
            ...(mode.megaMorph ? { megaMorph: true } : {}),
            ...(mode.partnerSlugId ? { partnerSlugId: mode.partnerSlugId } : {}),
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
    if ((mode?.type === "intimidate" || mode?.type === "first-aid") && actingCombatant) {
      setError(null);
      try {
        applyEncounter(
          await postJson(token, `/api/combat/actions/${mode.type}`, { combatantId: actingCombatant.id, targetId: target.id })
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

  // Heads-up to every client that this slug is about to be fired, so they can
  // fetch its art now and have it ready for a counter window (see
  // slugImageCache.js). Fire-and-forget: it changes nothing in combat.
  function announceArmedSlug(slug) {
    if (!actingCombatant || !Number.isInteger(slug?.id)) return;
    postJson(token, "/api/combat/actions/arm-slug", { attackerId: actingCombatant.id, slugId: slug.id }).catch(() => {});
  }

  function handlePickSlug(slug) {
    if (!slug) {
      setMode(null);
      return;
    }
    announceArmedSlug(slug);
    // A slug that can also break/make a wall or build a bridge gets a
    // picker for which of those (plus the always-available Attack) it's
    // firing for this shot -- a plain slug skips straight to Attack, same
    // as before.
    // A DM-approved Mega Morph slug gets the same picker, for its extra
    // "Shoot Mega Morph" choice.
    if (slug.breaksWalls || slug.wallMaker || slug.bridgeMaker || slug.megaMorphAllowed || dualInfoFor(slug)) {
      setActionPicker(slug);
      return;
    }
    // Perplexus: state your intended effect before you know the target --
    // the server re-validates against whichever pool (enemy debuffs vs self
    // buffs) the eventual target actually calls for, see
    // MindScrambleModal's own comment.
    if (slug.mindScramble) {
      setMindScramblePicker(slug);
      return;
    }
    // Psi: same "state your intent before you know the target" pattern as
    // Perplexus, just a single un-grouped pool (friction_shift is always a
    // debuff, no self-target buff reading).
    if (slug.frictionShift) {
      setFrictionPicker(slug);
      return;
    }
    setMode({ type: "shoot", slugId: slug.id, slugName: slug.name, actionType: "attack" });
  }

  function handlePickSlugAction(slug, actionType, extra) {
    setActionPicker(null);
    // Dual Shot: an Attack carrying a partner slug (and maybe Mega Morph) --
    // the partner's art is announced too so every client can prefetch it.
    if (actionType === "dual-shot") {
      announceArmedSlug(extra.partnerSlug);
      setMode({
        type: "shoot",
        slugId: slug.id,
        slugName: `${slug.name} + ${extra.partnerSlug.name}`,
        actionType: "attack",
        partnerSlugId: extra.partnerSlug.id,
        ...(extra.megaMorph ? { megaMorph: true } : {}),
      });
      return;
    }
    // A Mega Morph is an Attack on a slinger with a flag on it -- see the
    // server's /actions/shoot.
    if (actionType === "mega-morph") {
      setMode({ type: "shoot", slugId: slug.id, slugName: slug.name, actionType: "attack", megaMorph: true });
      return;
    }
    setMode({ type: "shoot", slugId: slug.id, slugName: slug.name, actionType });
  }

  // Base speed plus any equipped mods' speedBonus -- mirrors the server's
  // blasterEffectiveSpeed (routes/combat.js), so a Mega Morph eligibility
  // preview here never disagrees with what the server will actually enforce.
  function effectiveSpeed(blaster) {
    if (!blaster) return 0;
    const bonus = allMods
      .filter((m) => m.equippedBlasterId === blaster.id)
      .reduce((sum, m) => sum + (m.speedBonus || 0), 0);
    const base = Math.max(1, blaster.speed + bonus);
    const mode = effectiveMode(actingCombatant);
    if (!mode) return base;
    const inWater = isWaterAt(makeWaterSet(encounter?.water), { x: actingCombatant.x, y: actingCombatant.y });
    return Math.max(1, Math.round(base * modeBlasterSpeedFactor(mode, inWater)));
  }

  // Dual-shot options for a slug, or null if it can't offer any: its weapon
  // must be a Twin Slinger or carry a dual-shot mod, the slug itself must be
  // bonded enough, and at least one other slug must share the weapon.
  // Mirrors the server's blasterCanDualShot/dualShotPairError -- which
  // re-validate everything.
  function dualInfoFor(slug) {
    if (!slug || !canJoinDualShot(slug)) return null;
    const blaster = allBlasters.find((b) => b.id === slug.equippedBlasterId);
    if (!blaster) return null;
    const capable =
      blaster.baseType === DUAL_SHOT_BASE_TYPE || allMods.some((m) => m.equippedBlasterId === blaster.id && m.grantsDualShot);
    if (!capable) return null;
    const partners = eligibleSlugs.filter((s) => s.id !== slug.id && s.equippedBlasterId === slug.equippedBlasterId);
    if (partners.length === 0) return null;
    const speed = effectiveSpeed(blaster);
    const rangeReason = speed < MEGA_MORPH_MIN_SPEED ? `Needs a weapon with a speed of ${MEGA_MORPH_MIN_SPEED}+ (this one has ${speed}).` : null;
    return { partners, rangeReason };
  }

  // Why the picked slug can't Mega Morph right now, or null if it can. Mirrors
  // the server's checks (speed of the weapon it's loaded in, pips remaining).
  function megaBlockedReasonFor(slug) {
    if (!slug?.megaMorphAllowed) return null;
    const blaster = allBlasters.find((b) => b.id === slug.equippedBlasterId);
    const speed = effectiveSpeed(blaster);
    if (speed < MEGA_MORPH_MIN_SPEED) {
      return `Needs a weapon with a speed of ${MEGA_MORPH_MIN_SPEED}+ (this one has ${speed}).`;
    }
    const pips = Array.isArray(slug.energyPips) ? slug.energyPips.filter(Boolean).length : 0;
    if (pips < MEGA_MORPH_PIP_COST) {
      return `Needs ${MEGA_MORPH_PIP_COST} energy pips (this slug has ${pips}).`;
    }
    return null;
  }

  function handlePickMindScrambleEffect(slug, effectChoice) {
    setMindScramblePicker(null);
    setMode({ type: "shoot", slugId: slug.id, slugName: slug.name, actionType: "attack", effectChoice });
  }

  function handlePickFrictionEffect(slug, effectChoice) {
    setFrictionPicker(null);
    setMode({ type: "shoot", slugId: slug.id, slugName: slug.name, actionType: "attack", effectChoice });
  }

  if (encounter === undefined) return null;

  if (!encounter) {
    return (
      <>
        <NavBar />
        <div className="combat-page combat-page--empty">
          <Link className="panel-btn panel-btn--ghost combat-reports-link" to="/combat/reports">
            <ScrollIcon weight="bold" /> Battle reports
          </Link>
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
      </>
    );
  }

  if (encounter.status === "setup") {
    const setupTool = drawMode ? "walls" : waterMode || "move";
    function handleToolChange(tool) {
      setDrawMode(tool === "walls");
      setWaterMode(tool === "paint" || tool === "erase" ? tool : null);
    }
    return (
      <>
        <NavBar />
        <div className="combat-page combat-page--setup">
          <CombatSetup
            encounter={encounter}
            isDM={isDM}
            players={players}
            mechas={mechas}
            npcTemplates={npcTemplates}
            gruntTemplates={gruntTemplates}
            error={error}
            tool={setupTool}
            onToolChange={handleToolChange}
            brush={waterBrush}
            onBrushChange={setWaterBrush}
            onAddCombatant={handleAddCombatant}
            onPullNpc={handlePullNpc}
            onPullGrunt={handlePullGrunt}
            onSetTeam={handleSetTeam}
            onRemove={handleRemoveCombatant}
            onStart={handleStart}
          >
            <CombatMap
              encounter={encounter}
              isDM={isDM}
              viewerUserId={user?.id}
              drawMode={drawMode}
              waterMode={waterMode}
              waterBrush={waterBrush}
              onPaintWater={handlePaintWater}
              onAddWall={handleAddWall}
              onRemoveWall={handleRemoveWall}
              onBackgroundClick={handleBackgroundClick}
              onTokenClick={() => {}}
              isDraggable={isDraggable}
              onTokenDragEnd={handleTokenDragEnd}
              onMapUpdate={handleMapUpdate}
            />
          </CombatSetup>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar />
      {flashActive && <div className="combat-damage-flash" />}
      <div className="combat-page combat-page--active">
      <TopBar title={encounter.name} subtitle={`Round ${encounter.round}`}>
        <Link className="panel-btn panel-btn--ghost" to="/combat/reports">
          <ScrollIcon weight="bold" /> Battle reports
        </Link>
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
        <div className="combat-page-left">
          <CombatSlugPanel
            actingCombatant={actingCombatant}
            slugs={eligibleSlugs}
            pods={pods}
            activeBlasterBaseType={activeBlasterBaseType}
            armedSlugId={mode?.type === "shoot" ? mode.slugId : null}
            onPickSlug={handlePickSlug}
            hotkeysActive={actingCombatant?.id === encounter.activeCombatantId}
          />
          {holstered && <HolsteredSlugs blaster={holstered.blaster} slugs={holstered.slugs} />}
        </div>

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
            mountRing={mountRing}
            wallRunId={wallRunId}
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
            isDM={isDM}
            mode={mode}
            weaponSwitch={weaponSwitch}
            reloadInfo={reloadInfo}
            wallRunInfo={wallRunInfo}
            skillActionInfo={skillActionInfo}
            modeInfo={modeInfo}
            mountedMecha={mountedMecha}
            hasMountableMecha={hasMountableMecha}
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
        <SlugActionModal
          slug={actionPicker}
          megaBlockedReason={megaBlockedReasonFor(actionPicker)}
          dual={dualInfoFor(actionPicker)}
          onPick={handlePickSlugAction}
          onClose={() => setActionPicker(null)}
        />
      )}
      {mindScramblePicker && (
        <MindScrambleModal
          slug={mindScramblePicker}
          onPick={handlePickMindScrambleEffect}
          onClose={() => setMindScramblePicker(null)}
        />
      )}
      {frictionPicker && (
        <FrictionModal slug={frictionPicker} onPick={handlePickFrictionEffect} onClose={() => setFrictionPicker(null)} />
      )}
      {hunkerConfirm && (
        <HunkerConfirmModal
          ap={hunkerConfirm.ap}
          conMod={hunkerConfirm.conMod}
          onConfirm={confirmHunker}
          onClose={() => setHunkerConfirm(null)}
        />
      )}
      </div>
    </>
  );
}
