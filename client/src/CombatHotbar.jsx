import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ArrowsClockwiseIcon,
  ArrowsCounterClockwiseIcon,
  BandaidsIcon,
  CarIcon,
  DropIcon,
  EyeSlashIcon,
  FirstAidKitIcon,
  PersonSimpleRunIcon,
  SwordIcon,
  SkullIcon,
  LightningIcon,
  LockSimpleIcon,
  MotorcycleIcon,
  ShovelIcon,
  WindIcon,
  XIcon,
} from "@phosphor-icons/react";
import { MELEE_STR_NOTE } from "./itemData.js";
import { hunkerGritCap } from "./combatSkills.js";
import { ROTATE_STEP, ROTATE_QUARTER } from "./buildPlacement.js";
import { useShowLocked } from "./useShowLocked.js";
import "./CombatHotbar.css";

const MOUNT_AP_COST = 1;
const RAM_AP_COST = 2; // spent from the mecha's AP -- mirrors server/src/combatRules.js
const SWITCH_WEAPON_AP_COST = 1;

const MODE_META = {
  bike: { icon: <MotorcycleIcon weight="bold" />, on: "Bike Mode", off: "Exit Bike Mode" },
  glider: { icon: <WindIcon weight="bold" />, on: "Glider Mode", off: "Exit Glider Mode" },
  aquatic: { icon: <DropIcon weight="bold" />, on: "Aquatic Mode", off: "Exit Aquatic Mode" },
  burrow: { icon: <ShovelIcon weight="bold" />, on: "Burrow", off: "Get Out of Burrow" },
};

// `locked`: the combatant is down (unconscious / disabled), so nothing but
// End Turn is usable no matter how much AP they have left.
function HotbarButton({ icon, label, apCost, active, disabled, locked, onClick }) {
  return (
    <button
      type="button"
      className={`combat-hotbar-btn ${active ? "combat-hotbar-btn--active" : ""}`}
      onClick={onClick}
      disabled={disabled || locked}
    >
      {icon}
      <span className="combat-hotbar-btn-label">{label}</span>
      {apCost != null && (
        <span className="combat-hotbar-btn-cost">
          <LightningIcon weight="fill" />
          {apCost}
        </span>
      )}
    </button>
  );
}

function ApTrack({ label, current, max }) {
  return (
    <div className="combat-hotbar-ap">
      <span className="combat-hotbar-ap-label">{label}</span>
      <div className="combat-hotbar-ap-track">
        <div className="combat-hotbar-ap-fill" style={{ transform: `scaleX(${max > 0 ? current / max : 0})` }} />
      </div>
      <span className="combat-hotbar-ap-value num-tabular">
        {current} / {max}
      </span>
    </div>
  );
}

export default function CombatHotbar({
  actingCombatant,
  isActiveTurn,
  isDM = false,
  mode,
  weaponSwitch,
  meleeInfo,
  reloadInfo,
  wallInfo,
  skillActionInfo,
  modeInfo,
  mountedMecha = null,
  hasMountableMecha = true,
  onArmMode,
  placement = null,
  onRotatePlacement,
  onCancelMode,
  onAction,
}) {
  // Actions that can't be used right now are hidden until the player asks to see them.
  const [showLocked, toggleLocked] = useShowLocked("combatHotbarShowLocked");
  if (!actingCombatant) return null;

  const ap = actingCombatant.currentAp;
  const isMecha = actingCombatant.kind === "mecha";
  const isMounted = actingCombatant.mountedOn != null;
  const burrowed = modeInfo?.current === "burrow";
  const down = Boolean(actingCombatant.unconscious || actingCombatant.disabled);

  // Every action this combatant could take, in order. Locked ones (disabled, or the combatant is down) are
  // listed only when "Show locked" is on; End Turn is always there, and an armed action stays in view.
  const items = [];
  const add = (item) => items.push(item);

  if (!burrowed && !isMecha && actingCombatant.currentGrit != null) {
    add({
      key: "patch-up",
      icon: <BandaidsIcon weight="bold" />,
      label: "Patch Up",
      apCost: ap > 0 ? ap : null,
      disabled: ap < 1 || actingCombatant.damagedThisTurn || (actingCombatant.currentGrit ?? 0) >= hunkerGritCap(actingCombatant.maxGrit),
      onClick: () => onAction("hunker-down"),
    });
  }
  if (!burrowed && !isMecha && reloadInfo) {
    add({
      key: "reload",
      icon: <ArrowsCounterClockwiseIcon weight="bold" />,
      label: reloadInfo.pending > 0 ? `Reload (${reloadInfo.pending})` : reloadInfo.noPods > 0 ? "Reload (no pods)" : "Reload",
      apCost: reloadInfo.apCost,
      disabled: reloadInfo.pending === 0 || ap < reloadInfo.apCost,
      onClick: () => onAction("reload"),
    });
  }
  if (!burrowed && !isMecha && !isMounted) {
    add({
      key: "mount",
      icon: <CarIcon weight="bold" />,
      label: "Mount",
      apCost: MOUNT_AP_COST,
      active: mode?.type === "mount",
      disabled: ap < MOUNT_AP_COST || !hasMountableMecha,
      onClick: () => onArmMode(mode?.type === "mount" ? null : { type: "mount" }),
    });
  }
  if (!burrowed && !isMecha && isMounted) {
    add({
      key: "dismount",
      icon: <CarIcon weight="bold" />,
      label: "Dismount",
      apCost: MOUNT_AP_COST,
      disabled: ap < MOUNT_AP_COST,
      onClick: () => onAction("dismount"),
    });
  }
  if (!burrowed && isMounted) {
    add({
      key: "ram",
      icon: <CarIcon weight="fill" />,
      label: "Ram",
      apCost: RAM_AP_COST,
      active: mode?.type === "ram",
      disabled: !mountedMecha || mountedMecha.currentAp < RAM_AP_COST || mountedMecha.rammedThisRound,
      onClick: () => onArmMode(mode?.type === "ram" ? null : { type: "ram", mechaId: actingCombatant.mountedOn }),
    });
  }
  if (!isMecha && !isMounted && wallInfo) {
    add({
      key: "wall-vault",
      icon: <ArrowUpIcon weight="bold" />,
      label: "Wall Vault",
      apCost: wallInfo.vaultApCost,
      disabled: ap < wallInfo.vaultApCost || !wallInfo.nearWall || !wallInfo.skilled,
      onClick: () => onAction("wall-vault"),
    });
    add({
      key: "wall-run",
      icon: <PersonSimpleRunIcon weight="bold" />,
      label: "Wall Run",
      apCost: wallInfo.runApCost,
      active: mode?.type === "wall-run",
      disabled: ap < wallInfo.runApCost || !wallInfo.nearWall || !wallInfo.skilled,
      onClick: () => onArmMode(mode?.type === "wall-run" ? null : { type: "wall-run" }),
    });
  }
  if (!isMecha && !isMounted && skillActionInfo) {
    add({
      key: "hide",
      icon: <EyeSlashIcon weight="bold" />,
      label: "Hide",
      apCost: skillActionInfo.hide.apCost,
      disabled: ap < skillActionInfo.hide.apCost || !skillActionInfo.hide.skilled || skillActionInfo.hide.foesNearby || skillActionInfo.hide.tried,
      onClick: () => onAction("hide"),
    });
    add({
      key: "intimidate",
      icon: <SkullIcon weight="bold" />,
      label: "Intimidate",
      apCost: skillActionInfo.intimidate.apCost,
      active: mode?.type === "intimidate",
      disabled: ap < skillActionInfo.intimidate.apCost || !skillActionInfo.intimidate.skilled,
      onClick: () => onArmMode(mode?.type === "intimidate" ? null : { type: "intimidate" }),
    });
    add({
      key: "first-aid",
      icon: <FirstAidKitIcon weight="bold" />,
      label: "First Aid",
      apCost: skillActionInfo.firstAid.apCost,
      active: mode?.type === "first-aid",
      disabled: ap < skillActionInfo.firstAid.apCost,
      onClick: () => onArmMode(mode?.type === "first-aid" ? null : { type: "first-aid" }),
    });
  }
  if (!burrowed && !isMecha && meleeInfo) {
    add({
      key: "melee",
      icon: <SwordIcon weight="bold" />,
      label: meleeInfo.damage != null ? `Melee (${meleeInfo.damage} dmg)` : "Melee",
      apCost: meleeInfo.apCost,
      active: mode?.type === "melee",
      disabled: ap < meleeInfo.apCost,
      onClick: () => onArmMode(mode?.type === "melee" ? null : { type: "melee" }),
    });
  }
  if (!burrowed && !isMecha && weaponSwitch) {
    add({
      key: "switch-weapon",
      icon: <ArrowsClockwiseIcon weight="bold" />,
      label: weaponSwitch.otherSlot === 1 ? "Switch to Secondary" : "Switch to Primary",
      apCost: SWITCH_WEAPON_AP_COST,
      disabled: !weaponSwitch.hasOther || ap < SWITCH_WEAPON_AP_COST,
      onClick: () => onAction("switch-weapon"),
    });
  }
  if (isMounted && modeInfo && modeInfo.modes.length > 0) {
    for (const m of modeInfo.modes) {
      const meta = MODE_META[m];
      if (!meta || m === "aquatic") continue; // aquatic engages by itself in water
      const on = modeInfo.current === m;
      add({
        key: `mode-${m}`,
        icon: meta.icon,
        label: on ? meta.off : meta.on,
        active: on,
        disabled: !isActiveTurn && !isDM,
        onClick: () => onAction(on ? "mode-off" : `mode-${m}`),
      });
    }
  }
  add({
    key: "end-turn",
    icon: <ArrowRightIcon weight="bold" />,
    label: "End Turn",
    disabled: !isActiveTurn && !isDM,
    essential: true,
    onClick: () => onAction("end-turn"),
  });

  const isLocked = (item) => !item.essential && !item.active && (item.disabled || down);
  const lockedCount = items.filter(isLocked).length;
  const visibleItems = showLocked ? items : items.filter((item) => !isLocked(item));

  return (
    <div className={`combat-hotbar ${isActiveTurn ? "combat-hotbar--active-turn" : ""}`}>
      {isMounted && mountedMecha ? (
        <div className="combat-hotbar-ap-group">
          <ApTrack label="Rider AP" current={ap} max={actingCombatant.maxAp} />
          <ApTrack label="Mecha AP" current={mountedMecha.currentAp} max={mountedMecha.maxAp} />
          {!isActiveTurn && <span className="combat-hotbar-not-turn">Not this combatant's turn</span>}
        </div>
      ) : (
        <div className="combat-hotbar-ap">
          <span className="combat-hotbar-ap-label">AP</span>
          <div className="combat-hotbar-ap-track">
            <div
              className="combat-hotbar-ap-fill"
              style={{ transform: `scaleX(${actingCombatant.maxAp > 0 ? ap / actingCombatant.maxAp : 0})` }}
            />
          </div>
          <span className="combat-hotbar-ap-value num-tabular">
            {ap} / {actingCombatant.maxAp}
          </span>
          {!isActiveTurn && <span className="combat-hotbar-not-turn">Not this combatant's turn</span>}
        </div>
      )}

      <div className="combat-hotbar-buttons">
        {visibleItems.map(({ key, essential, ...item }) => (
          <HotbarButton key={key} locked={down && !essential} {...item} />
        ))}

        {lockedCount > 0 && (
          <button type="button" className="combat-hotbar-locked-toggle" aria-pressed={showLocked} onClick={toggleLocked}>
            <LockSimpleIcon weight="bold" aria-hidden="true" />
            {showLocked ? "Hide locked" : `Show locked (${lockedCount})`}
          </button>
        )}

        {mode && (
          <button type="button" className="combat-hotbar-cancel" onClick={onCancelMode} title="Cancel">
            <XIcon weight="bold" />
          </button>
        )}
      </div>

      {isMecha && (
        <p className="combat-hotbar-hint">This mecha can only move -- drag it on its turn. Ram it while mounted.</p>
      )}
      {burrowed && <p className="combat-hotbar-hint">Burrowed -- untargetable and unseen. You can only move or get out of the burrow.</p>}
      {isMounted && <p className="combat-hotbar-hint">Mounted -- moving spends the mecha's AP and drives it at the mecha's speed.</p>}
      {showLocked && !isMecha && !isMounted && wallInfo && !wallInfo.skilled && (
        <p className="combat-hotbar-hint">Wall Vault and Wall Run need a positive Acrobatics modifier.</p>
      )}
      {showLocked && !isMecha && !isMounted && wallInfo && wallInfo.skilled && !wallInfo.nearWall && (
        <p className="combat-hotbar-hint">Wall Vault and Wall Run need you standing close to a wall.</p>
      )}
      {mode?.type === "wall-run" && wallInfo && (
        <p className="combat-hotbar-hint">
          Click along the wall in the direction you want to run -- you slide up to {wallInfo.runDistance} units along it,
          or to its end, staying on your side.
        </p>
      )}
      {mode?.type === "intimidate" && <p className="combat-hotbar-hint">Click an enemy within 400 units to intimidate them.</p>}
      {mode?.type === "first-aid" && <p className="combat-hotbar-hint">Click a nearby ally (or yourself) to clear their negative effects.</p>}
      {mode?.type === "mount" && <p className="combat-hotbar-hint">Click a highlighted mecha inside the ring to mount it.</p>}
      {mode?.type === "ram" && <p className="combat-hotbar-hint">Click a target in range to ram.</p>}
      {mode?.type === "melee" && meleeInfo && (
        <p className="combat-hotbar-hint">
          Click an enemy inside the ring to swing {meleeInfo.weapon.name}: d20 + STR{meleeInfo.weapon.accuracy ? ` ${meleeInfo.weapon.accuracy > 0 ? "+" : ""}${meleeInfo.weapon.accuracy}` : ""} to hit,{" "}
          {meleeInfo.weapon.damage} {MELEE_STR_NOTE} damage.{" "}
          {{ bludgeon: "Bludgeon: knocks them back.", slash: "Slash: leaves them bleeding.", pierce: "Pierce: ignores shields." }[meleeInfo.weapon.meleeType]}
        </p>
      )}
      {mode?.type === "shoot" && mode.actionType === "attack" && <p className="combat-hotbar-hint">Click a target to attack.</p>}
      {mode?.type === "shoot" && mode.actionType === "break-wall" && (
        <p className="combat-hotbar-hint">Click anywhere in range -- the slug breaks the first wall (or bridge) it hits.</p>
      )}
      {placement && (
        <div className="combat-hotbar-place">
          <p className="combat-hotbar-hint">
            {placement.kind === "wall"
              ? "A ghost of the wall follows your cursor. Turn it, then click in range to raise it there."
              : "A ghost of the bridge follows your cursor and runs the way its arrow points. Turn it, then click in range to build it there."}
          </p>
          <div className="combat-hotbar-rotate" role="group" aria-label="Rotate the structure">
            <button type="button" className="combat-hotbar-rotate-btn" onClick={() => onRotatePlacement?.(-ROTATE_STEP)} aria-label={`Turn ${ROTATE_STEP} degrees left`}>
              <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
              <kbd>Q</kbd>
            </button>
            <button type="button" className="combat-hotbar-rotate-btn" onClick={() => onRotatePlacement?.(ROTATE_STEP)} aria-label={`Turn ${ROTATE_STEP} degrees right`}>
              <ArrowClockwiseIcon weight="bold" aria-hidden="true" />
              <kbd>E</kbd>
            </button>
            <button type="button" className="combat-hotbar-rotate-btn" onClick={() => onRotatePlacement?.(ROTATE_QUARTER)} aria-label="Quarter turn">
              {ROTATE_QUARTER}°<kbd>R</kbd>
            </button>
            <button
              type="button"
              className="combat-hotbar-rotate-btn"
              disabled={Math.round(placement.rotation) === 0}
              onClick={() => onRotatePlacement?.(null)}
              aria-label="Reset to the default facing"
            >
              Reset<kbd>0</kbd>
            </button>
            <span className="combat-hotbar-rotate-read num-tabular">
              {Math.round(placement.rotation) === 0 ? "Default facing" : `Turned ${Math.round(placement.rotation) > 0 ? "+" : ""}${Math.round(placement.rotation)}°`}
            </span>
          </div>
          <p className="combat-hotbar-hint combat-hotbar-hint--quiet">Shift + Q / E turns 5° at a time. Shift + scroll turns it too.</p>
        </div>
      )}
      {mode?.type === "shoot" && mode.actionType === "summon-plant" && (
        <p className="combat-hotbar-hint">Click the ground in range to plant a carnivorous bloom there. It bites enemies already in reach, then anyone who moves into, out of or through its reach, and can be shot down.</p>
      )}
      {mode?.type === "shoot" && mode.actionType === "grapple" && (
        <p className="combat-hotbar-hint">Click a wall or bridge in range -- the line hooks it and reels you across to it. (To yank an enemy toward you instead, use Attack.)</p>
      )}
    </div>
  );
}
