import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  ArrowsCounterClockwiseIcon,
  CampfireIcon,
  CarIcon,
  LightningIcon,
  XIcon,
} from "@phosphor-icons/react";
import "./CombatHotbar.css";

const MOUNT_AP_COST = 1;
const RAM_AP_COST = 2; // spent from the mecha's AP -- mirrors server/src/combatRules.js
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
  reloadInfo,
  mountedMecha = null,
  hasMountableMecha = true,
  onArmMode,
  onCancelMode,
  onAction,
}) {
  if (!actingCombatant) return null;

  const ap = actingCombatant.currentAp;
  const isMecha = actingCombatant.kind === "mecha";
  const isMounted = actingCombatant.mountedOn != null;

  return (
    <div className="combat-hotbar">
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
        {!isMecha && actingCombatant.currentGrit != null && (
          <HotbarButton
            icon={<CampfireIcon weight="bold" />}
            label="Hunker Down"
            apCost={ap > 0 ? ap : null}
            disabled={ap < 1 || actingCombatant.damagedThisTurn}
            onClick={() => onAction("hunker-down")}
          />
        )}

        {!isMecha && reloadInfo && (
          <HotbarButton
            icon={<ArrowsCounterClockwiseIcon weight="bold" />}
            label={reloadInfo.pending > 0 ? `Reload (${reloadInfo.pending})` : "Reload"}
            apCost={reloadInfo.apCost}
            disabled={reloadInfo.pending === 0 || ap < reloadInfo.apCost}
            onClick={() => onAction("reload")}
          />
        )}

        {!isMecha && !isMounted && (
          <HotbarButton
            icon={<CarIcon weight="bold" />}
            label="Mount"
            apCost={MOUNT_AP_COST}
            active={mode?.type === "mount"}
            disabled={ap < MOUNT_AP_COST || !hasMountableMecha}
            onClick={() => onArmMode(mode?.type === "mount" ? null : { type: "mount" })}
          />
        )}
        {!isMecha && isMounted && (
          <HotbarButton
            icon={<CarIcon weight="bold" />}
            label="Dismount"
            apCost={MOUNT_AP_COST}
            disabled={ap < MOUNT_AP_COST}
            onClick={() => onAction("dismount")}
          />
        )}

        {isMounted && (
          <HotbarButton
            icon={<CarIcon weight="fill" />}
            label="Ram"
            apCost={RAM_AP_COST}
            active={mode?.type === "ram"}
            disabled={!mountedMecha || mountedMecha.currentAp < RAM_AP_COST || mountedMecha.rammedThisRound}
            onClick={() =>
              onArmMode(mode?.type === "ram" ? null : { type: "ram", mechaId: actingCombatant.mountedOn })
            }
          />
        )}

        {!isMecha && weaponSwitch && (
          <HotbarButton
            icon={<ArrowsClockwiseIcon weight="bold" />}
            label={weaponSwitch.otherSlot === 1 ? "Switch to Secondary" : "Switch to Primary"}
            apCost={SWITCH_WEAPON_AP_COST}
            disabled={!weaponSwitch.hasOther || ap < SWITCH_WEAPON_AP_COST}
            onClick={() => onAction("switch-weapon")}
          />
        )}

        <HotbarButton
          icon={<ArrowRightIcon weight="bold" />}
          label="End Turn"
          disabled={!isActiveTurn && !isDM}
          onClick={() => onAction("end-turn")}
        />

        {mode && (
          <button type="button" className="combat-hotbar-cancel" onClick={onCancelMode} title="Cancel">
            <XIcon weight="bold" />
          </button>
        )}
      </div>

      {isMecha && (
        <p className="combat-hotbar-hint">This mecha can only move -- drag it on its turn. Ram it while mounted.</p>
      )}
      {isMounted && <p className="combat-hotbar-hint">Mounted -- moving spends the mecha's AP and drives it at the mecha's speed.</p>}
      {mode?.type === "mount" && <p className="combat-hotbar-hint">Click a highlighted mecha inside the ring to mount it.</p>}
      {mode?.type === "ram" && <p className="combat-hotbar-hint">Click a target in range to ram.</p>}
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
