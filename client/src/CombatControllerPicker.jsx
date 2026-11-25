// Who plays an NPC/grunt in combat: the DM (the default), or a DM Assistant the
// DM hands it to. The assistant then drives it like a player drives their own
// character -- see isActingCombatantAuthorized in server/src/routes/combat.js.

// The DM's picker. `assistants` is [{ id, name }]; renders nothing when there
// are no assistants to hand anything to (and the NPC isn't assigned already).
export function ControllerPicker({ combatant, assistants, onAssign, className = "" }) {
  if (combatant.kind !== "npc") return null;
  if (assistants.length === 0 && combatant.controllerUserId == null) return null;
  const value = combatant.controllerUserId ?? "";
  const known = assistants.some((a) => a.id === combatant.controllerUserId);
  return (
    <select
      className={`combat-controller-picker ${className}`}
      value={value}
      aria-label={`Who plays ${combatant.name}`}
      title="Who plays this NPC"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onAssign(combatant.id, e.target.value === "" ? null : Number(e.target.value))}
    >
      <option value="">DM plays</option>
      {assistants.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} plays
        </option>
      ))}
      {!known && combatant.controllerUserId != null && <option value={combatant.controllerUserId}>Assistant plays</option>}
    </select>
  );
}

// "Played by ..." for everyone else who can see it.
export function controllerLabel(combatant, assistants, viewerUserId) {
  if (combatant.kind !== "npc" || combatant.controllerUserId == null) return null;
  if (combatant.controllerUserId === viewerUserId) return "you play this";
  const who = assistants.find((a) => a.id === combatant.controllerUserId);
  return `played by ${who ? who.name : "an assistant"}`;
}
