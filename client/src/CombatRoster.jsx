import { ArrowClockwiseIcon, SkullIcon, TrashIcon, UsersThreeIcon } from "@phosphor-icons/react";
import KnockoutPips from "./KnockoutPips.jsx";
import "./Panel.css";
import "./CombatRoster.css";

function barFraction(combatant) {
  if (combatant.kind === "mecha") {
    return combatant.maxStructure > 0 ? (combatant.currentStructure ?? 0) / combatant.maxStructure : 0;
  }
  return combatant.maxGrit > 0 ? (combatant.currentGrit ?? 0) / combatant.maxGrit : 0;
}

function Row({ combatant, isActive, isActing, isDM, onSelect, onRevive, onRemove }) {
  const fraction = Math.max(0, Math.min(1, barFraction(combatant)));
  const downed = combatant.unconscious || combatant.disabled;
  const pipsUsed = Array.isArray(combatant.knockoutPips) ? combatant.knockoutPips.filter(Boolean).length : 0;
  const clickable = isDM;

  return (
    <div
      className={`combat-roster-row ${isActive ? "combat-roster-row--active" : ""} ${isActing ? "combat-roster-row--acting" : ""} ${downed ? "combat-roster-row--down" : ""}`}
      onClick={clickable ? () => onSelect(combatant) : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <span className="combat-roster-portrait">
        {combatant.portrait ? <img src={combatant.portrait} alt="" /> : <span className="combat-roster-initial">{combatant.name[0]}</span>}
      </span>

      <div className="combat-roster-info">
        <div className="combat-roster-name-row">
          <span className="combat-roster-name">{combatant.name}</span>
          <span className="combat-roster-kind">{combatant.kind}</span>
        </div>
        <div className={`combat-roster-bar-track ${combatant.kind === "mecha" ? "combat-roster-bar-track--structure" : ""}`}>
          <div className="combat-roster-bar-fill" style={{ transform: `scaleX(${fraction})` }} />
        </div>
        {combatant.knockoutPips && (
          <div className={`combat-roster-knockout combat-roster-knockout--${pipsUsed}`}>
            <SkullIcon weight="bold" />
            <span className="combat-roster-knockout-label">Knockout</span>
            <KnockoutPips pips={combatant.knockoutPips} size="sm" inline />
            <span className="combat-roster-knockout-count">{pipsUsed}/3</span>
          </div>
        )}
        {downed && <span className="combat-roster-status">{combatant.unconscious ? "Unconscious" : "Disabled"}</span>}
        {combatant.statusEffects && Object.keys(combatant.statusEffects).length > 0 && (
          <div className="combat-roster-effects">
            {combatant.statusEffects.burning && (
              <span className="combat-roster-effect combat-roster-effect--burn">Burning</span>
            )}
            {combatant.statusEffects.poison?.stacks > 0 && (
              <span className="combat-roster-effect combat-roster-effect--poison">
                Poisoned ×{combatant.statusEffects.poison.stacks}
              </span>
            )}
            {combatant.statusEffects.snared && (
              <span className="combat-roster-effect combat-roster-effect--snare">Snared</span>
            )}
            {combatant.statusEffects.stunned && (
              <span className="combat-roster-effect combat-roster-effect--stun">Stunned</span>
            )}
            {combatant.statusEffects.blinded && (
              <span className="combat-roster-effect combat-roster-effect--blind">Blinded</span>
            )}
            {combatant.statusEffects.confused && (
              <span className="combat-roster-effect combat-roster-effect--confused">Confused</span>
            )}
            {combatant.statusEffects.shocked && (
              <span className="combat-roster-effect combat-roster-effect--shock">Shocked</span>
            )}
            {combatant.statusEffects.jammed && (
              <span className="combat-roster-effect combat-roster-effect--jam">Jammed</span>
            )}
          </div>
        )}
      </div>

      {isDM && (
        <div className="combat-roster-actions" onClick={(e) => e.stopPropagation()}>
          {combatant.unconscious && (
            <button type="button" className="combat-roster-icon-btn" title="Revive" onClick={() => onRevive(combatant.id)}>
              <ArrowClockwiseIcon weight="bold" />
            </button>
          )}
          <button type="button" className="combat-roster-icon-btn" title="Remove" onClick={() => onRemove(combatant.id)}>
            <TrashIcon weight="bold" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function CombatRoster({ encounter, isDM, viewerUserId, actingCombatantId, onSelect, onRevive, onRemove }) {
  const ordered = encounter.combatants
    // Thugglet's invisibility: same visibility rule as the map (CombatMap.jsx)
    // -- the DM and the combatant's own player still see the row, everyone
    // else doesn't get a row for them at all.
    .filter((c) => !c.statusEffects?.invisible || isDM || (c.kind === "character" && c.refUserId === viewerUserId))
    .slice()
    .sort((a, b) => encounter.turnOrder.indexOf(a.id) - encounter.turnOrder.indexOf(b.id));

  return (
    <div className="panel panel--quiet combat-roster">
      <div className="panel-header">
        <span className="panel-header-icon">
          <UsersThreeIcon weight="duotone" />
        </span>
        <div className="panel-header-text">
          <h2>Turn Order</h2>
          <p>Round {encounter.round}</p>
        </div>
      </div>
      <div className="panel-body combat-roster-body">
        {ordered.map((c) => (
          <Row
            key={c.id}
            combatant={c}
            isActive={c.id === encounter.activeCombatantId}
            isActing={c.id === actingCombatantId}
            isDM={isDM}
            onSelect={onSelect}
            onRevive={onRevive}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}
