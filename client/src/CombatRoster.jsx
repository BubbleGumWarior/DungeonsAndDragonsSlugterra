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
  // Combat never hides a combatant -- every token/row always shows. Players
  // just never see an NPC's numbers unless the NPC's own "revealed to
  // players" flag (set on the NPCs tab, shared by every instance of it) is
  // on -- until then they get name and portrait only.
  const redacted = !isDM && combatant.kind === "npc" && !combatant.npcRevealed;
  const clickable = isDM || combatant.kind === "npc";

  return (
    <div
      className={`combat-roster-row ${isActive ? "combat-roster-row--active" : ""} ${isActing ? "combat-roster-row--acting" : ""} ${downed && !redacted ? "combat-roster-row--down" : ""}`}
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
          {!redacted && <span className="combat-roster-kind">{combatant.kind}</span>}
        </div>
        {!redacted && (
          <>
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
          </>
        )}
        {redacted && <span className="combat-roster-guess-hint">Click to guess its slugs</span>}
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

export default function CombatRoster({ encounter, isDM, actingCombatantId, onSelect, onRevive, onRemove }) {
  const ordered = encounter.combatants
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
