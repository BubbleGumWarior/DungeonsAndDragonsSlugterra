import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  ArrowsCounterClockwiseIcon,
  CampfireIcon,
  CarIcon,
  DropIcon,
  EyeSlashIcon,
  FirstAidKitIcon,
  PersonSimpleRunIcon,
  SkullIcon,
  LightningIcon,
  MotorcycleIcon,
  ShovelIcon,
  WindIcon,
  XIcon,
} from "@phosphor-icons/react";
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
  wallRunInfo,
  skillActionInfo,
  modeInfo,
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
  const burrowed = modeInfo?.current === "burrow";

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
        {!burrowed && !isMecha && actingCombatant.currentGrit != null && (
          <HotbarButton
            icon={<CampfireIcon weight="bold" />}
            label="Hunker Down"
            apCost={ap > 0 ? ap : null}
            disabled={ap < 1 || actingCombatant.damagedThisTurn}
            onClick={() => onAction("hunker-down")}
          />
        )}

        {!burrowed && !isMecha && reloadInfo && (
          <HotbarButton
            icon={<ArrowsCounterClockwiseIcon weight="bold" />}
            label={reloadInfo.pending > 0 ? `Reload (${reloadInfo.pending})` : reloadInfo.noPods > 0 ? "Reload (no pods)" : "Reload"}
            apCost={reloadInfo.apCost}
            disabled={reloadInfo.pending === 0 || ap < reloadInfo.apCost}
            onClick={() => onAction("reload")}
          />
        )}

        {!burrowed && !isMecha && !isMounted && (
          <HotbarButton
            icon={<CarIcon weight="bold" />}
            label="Mount"
            apCost={MOUNT_AP_COST}
            active={mode?.type === "mount"}
            disabled={ap < MOUNT_AP_COST || !hasMountableMecha}
            onClick={() => onArmMode(mode?.type === "mount" ? null : { type: "mount" })}
          />
        )}
        {!burrowed && !isMecha && isMounted && (
          <HotbarButton
            icon={<CarIcon weight="bold" />}
            label="Dismount"
            apCost={MOUNT_AP_COST}
            disabled={ap < MOUNT_AP_COST}
            onClick={() => onAction("dismount")}
          />
        )}

        {!burrowed && isMounted && (
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

        {!isMecha && !isMounted && wallRunInfo && (
          <HotbarButton
            icon={<PersonSimpleRunIcon weight="bold" />}
            label="Wall Run"
            apCost={wallRunInfo.apCost}
            disabled={ap < wallRunInfo.apCost || !wallRunInfo.nearWall || !wallRunInfo.skilled}
            onClick={() => onAction("wall-run")}
          />
        )}

        {!isMecha && !isMounted && skillActionInfo && (
          <>
            <HotbarButton
              icon={<EyeSlashIcon weight="bold" />}
              label="Hide"
              apCost={skillActionInfo.hide.apCost}
              disabled={ap < skillActionInfo.hide.apCost || !skillActionInfo.hide.skilled || skillActionInfo.hide.foesNearby || skillActionInfo.hide.tried}
              onClick={() => onAction("hide")}
            />
            <HotbarButton
              icon={<SkullIcon weight="bold" />}
              label="Intimidate"
              apCost={skillActionInfo.intimidate.apCost}
              active={mode?.type === "intimidate"}
              disabled={ap < skillActionInfo.intimidate.apCost || !skillActionInfo.intimidate.skilled}
              onClick={() => onArmMode(mode?.type === "intimidate" ? null : { type: "intimidate" })}
            />
            <HotbarButton
              icon={<FirstAidKitIcon weight="bold" />}
              label="First Aid"
              apCost={skillActionInfo.firstAid.apCost}
              active={mode?.type === "first-aid"}
              disabled={ap < skillActionInfo.firstAid.apCost}
              onClick={() => onArmMode(mode?.type === "first-aid" ? null : { type: "first-aid" })}
            />
          </>
        )}

        {!burrowed && !isMecha && weaponSwitch && (
          <HotbarButton
            icon={<ArrowsClockwiseIcon weight="bold" />}
            label={weaponSwitch.otherSlot === 1 ? "Switch to Secondary" : "Switch to Primary"}
            apCost={SWITCH_WEAPON_AP_COST}
            disabled={!weaponSwitch.hasOther || ap < SWITCH_WEAPON_AP_COST}
            onClick={() => onAction("switch-weapon")}
          />
        )}

        {isMounted && modeInfo && modeInfo.modes.length > 0 &&
          modeInfo.modes.map((m) => {
            const meta = MODE_META[m];
            if (!meta || m === "aquatic") return null; // aquatic engages by itself in water
            const on = modeInfo.current === m;
            return (
              <HotbarButton
                key={m}
                icon={meta.icon}
                label={on ? meta.off : meta.on}
                active={on}
                disabled={!isActiveTurn && !isDM}
                onClick={() => onAction(on ? "mode-off" : `mode-${m}`)}
              />
            );
          })}

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
      {burrowed && <p className="combat-hotbar-hint">Burrowed -- untargetable and unseen. You can only move or get out of the burrow.</p>}
      {isMounted && <p className="combat-hotbar-hint">Mounted -- moving spends the mecha's AP and drives it at the mecha's speed.</p>}
      {!isMecha && !isMounted && wallRunInfo && !wallRunInfo.skilled && (
        <p className="combat-hotbar-hint">Wall Run needs a positive Acrobatics modifier.</p>
      )}
      {!isMecha && !isMounted && wallRunInfo && wallRunInfo.skilled && !wallRunInfo.nearWall && (
        <p className="combat-hotbar-hint">Wall Run needs you standing close to a wall.</p>
      )}
      {mode?.type === "intimidate" && <p className="combat-hotbar-hint">Click an enemy within 400 units to intimidate them.</p>}
      {mode?.type === "first-aid" && <p className="combat-hotbar-hint">Click a nearby ally (or yourself) to clear their negative effects.</p>}
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
