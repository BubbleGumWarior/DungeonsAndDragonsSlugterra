import { ArrowRightIcon, ArrowsClockwiseIcon, CampfireIcon, CarIcon, LightningIcon, XIcon } from "@phosphor-icons/react";
import "./CombatHotbar.css";

const HUNKER_AP_COST = 2; // mirrors server/src/combatRules.js
const MOUNT_AP_COST = 1;
const RAM_AP_COST = 2;
const SWITCH_WEAPON_AP_COST = 1;

function HotbarButton({ icon, label, apCost, active, disabled, onClick }) {
  return (
    <button
      type="button"
      className={`combat-hotbar-btn ${active ? "combat-hotbar-btn--active" : ""}`}
      onClick={onClick}
      disabled={disabled}
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

export default function CombatHotbar({ actingCombatant, isActiveTurn, mode, weaponSwitch, onArmMode, onCancelMode, onAction }) {
  if (!actingCombatant) return null;

  const ap = actingCombatant.currentAp;

  return (
    <div className="combat-hotbar">
      <div className="combat-hotbar-ap">
        <span className="combat-hotbar-ap-label">AP</span>
        <div className="combat-hotbar-ap-track">
          <div className="combat-hotbar-ap-fill" style={{ transform: `scaleX(${actingCombatant.maxAp > 0 ? ap / actingCombatant.maxAp : 0})` }} />
        </div>
        <span className="combat-hotbar-ap-value num-tabular">
          {ap} / {actingCombatant.maxAp}
        </span>
        {!isActiveTurn && <span className="combat-hotbar-not-turn">Not this combatant's turn</span>}
      </div>

      <div className="combat-hotbar-buttons">
        {actingCombatant.kind !== "mecha" && actingCombatant.currentGrit != null && (
          <HotbarButton
            icon={<CampfireIcon weight="bold" />}
            label="Hunker Down"
            apCost={HUNKER_AP_COST}
            disabled={ap < HUNKER_AP_COST}
            onClick={() => onAction("hunker-down")}
          />
        )}

        {actingCombatant.kind !== "mecha" && actingCombatant.mountedOn == null && (
          <HotbarButton
            icon={<CarIcon weight="bold" />}
            label="Mount"
            apCost={MOUNT_AP_COST}
            active={mode?.type === "mount"}
            disabled={ap < MOUNT_AP_COST}
            onClick={() => onArmMode(mode?.type === "mount" ? null : { type: "mount" })}
          />
        )}
        {actingCombatant.kind !== "mecha" && actingCombatant.mountedOn != null && (
          <HotbarButton
            icon={<CarIcon weight="bold" />}
            label="Dismount"
            apCost={MOUNT_AP_COST}
            disabled={ap < MOUNT_AP_COST}
            onClick={() => onAction("dismount")}
          />
        )}

        {(actingCombatant.kind === "mecha" || actingCombatant.mountedOn != null) && (
          <HotbarButton
            icon={<CarIcon weight="fill" />}
            label="Ram"
            apCost={RAM_AP_COST}
            active={mode?.type === "ram"}
            disabled={actingCombatant.kind === "mecha" ? ap < RAM_AP_COST : false}
            onClick={() =>
              onArmMode(
                mode?.type === "ram"
                  ? null
                  : { type: "ram", mechaId: actingCombatant.kind === "mecha" ? actingCombatant.id : actingCombatant.mountedOn }
              )
            }
          />
        )}

        {weaponSwitch && (
          <HotbarButton
            icon={<ArrowsClockwiseIcon weight="bold" />}
            label={weaponSwitch.otherSlot === 1 ? "Switch to Secondary" : "Switch to Primary"}
            apCost={SWITCH_WEAPON_AP_COST}
            disabled={!weaponSwitch.hasOther || ap < SWITCH_WEAPON_AP_COST}
            onClick={() => onAction("switch-weapon")}
          />
        )}

        <HotbarButton icon={<ArrowRightIcon weight="bold" />} label="End Turn" onClick={() => onAction("end-turn")} />

        {mode && (
          <button type="button" className="combat-hotbar-cancel" onClick={onCancelMode} title="Cancel">
            <XIcon weight="bold" />
          </button>
        )}
      </div>

      {mode?.type === "mount" && <p className="combat-hotbar-hint">Click a mecha to mount it.</p>}
      {mode?.type === "ram" && <p className="combat-hotbar-hint">Click a target to ram.</p>}
      {mode?.type === "shoot" && mode.actionType === "attack" && <p className="combat-hotbar-hint">Click a target to attack.</p>}
      {mode?.type === "shoot" && mode.actionType === "break-wall" && (
        <p className="combat-hotbar-hint">Click anywhere in range -- the slug breaks the first wall (or bridge) it hits.</p>
      )}
      {mode?.type === "shoot" && mode.actionType === "make-wall" && (
        <p className="combat-hotbar-hint">Click anywhere in range to raise a wall there.</p>
      )}
      {mode?.type === "shoot" && mode.actionType === "build-bridge" && (
        <p className="combat-hotbar-hint">Click anywhere in range to build a bridge there.</p>
      )}
    </div>
  );
}
