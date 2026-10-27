import { useEffect, useState } from "react";
import { isBurrowed } from "./combatSkills.js";
import { ArrowClockwiseIcon, CrosshairSimpleIcon, EyeIcon, RobotIcon, ShieldIcon, SkullIcon, TrashIcon, UsersThreeIcon } from "@phosphor-icons/react";
import KnockoutPips from "./KnockoutPips.jsx";
import { combatantNameColor } from "./combatDisplay.js";
import { typeColor } from "./slugData.js";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import "./Panel.css";
import "./CombatRoster.css";

function barFraction(combatant) {
  if (combatant.kind === "mecha") {
    return combatant.maxStructure > 0 ? (combatant.currentStructure ?? 0) / combatant.maxStructure : 0;
  }
  return combatant.maxGrit > 0 ? (combatant.currentGrit ?? 0) / combatant.maxGrit : 0;
}

// Auto-counter (server/src/autoCounter.js) is only offered for NPCs and grunts.
const canAutoCounter = (c) => c.kind === "npc";

// What the viewer knows of a foe's slugs: the ones they've read (Insight) or
// seen fired show by name; the rest stay as empty slots. `knowledge` is the
// server's per-player view -- the slug list itself never reaches an unread foe.
function FoeSlugs({ name, knowledge }) {
  const hidden = Math.max(0, knowledge.total - knowledge.known.length);
  const summary = knowledge.read
    ? `${name}'s slugs, read with Insight`
    : `${name}'s slugs -- only the ones seen fired are known`;
  return (
    <div className="combat-roster-foeslugs" role="group" aria-label={summary} title={summary}>
      <EyeIcon weight={knowledge.read ? "fill" : "bold"} aria-hidden="true" />
      <span className="combat-roster-foeslugs-list">
        {knowledge.known.map((s) => (
          <span key={s.id} className="combat-roster-foeslug" style={{ "--type-color": typeColor(s.type) }}>
            {s.name}
          </span>
        ))}
        {Array.from({ length: hidden }, (_, i) => (
          <span key={`hidden-${i}`} className="combat-roster-foeslug combat-roster-foeslug--hidden" aria-label="Unknown slug">
            ?
          </span>
        ))}
      </span>
    </div>
  );
}

function Row({ combatant, knowledge, isActive, isActing, isDM, onSelect, onRevive, onRemove, onReset, onToggleAutoCounter }) {
  const fraction = Math.max(0, Math.min(1, barFraction(combatant)));
  const autoOn = Boolean(combatant.data?.autoCounter);
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
          <span className="combat-roster-name" style={{ color: combatantNameColor(combatant) || undefined }}>
            {combatant.name}
          </span>
          <span className="combat-roster-kind">{combatant.kind}</span>
          {autoOn && isDM && <span className="combat-roster-auto">auto-counter</span>}
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
        {combatant.data?.shield && (
          <div className={`combat-roster-shield ${combatant.data.shield.remaining <= 0 ? "combat-roster-shield--broken" : ""}`}>
            <ShieldIcon weight="bold" />
            <span>{combatant.data.shield.name}</span>
            <span className="combat-roster-shield-value num-tabular">
              {combatant.data.shield.remaining <= 0 ? "Broken" : `${combatant.data.shield.remaining} / ${combatant.data.shield.max}`}
            </span>
          </div>
        )}
        {!isDM && knowledge && <FoeSlugs name={combatant.name} knowledge={knowledge} />}
        {downed && <span className="combat-roster-status">{combatant.unconscious ? "Unconscious" : "Disabled"}</span>}
        {combatant.data?.gear && (combatant.data.gear.ill || combatant.data.gear.tier !== "comfortable") && (
          <div className="combat-roster-effects">
            {combatant.data.gear.ill && (
              <span
                className="combat-roster-effect combat-roster-effect--poison"
                title="Ill: max Grit, AP and accuracy are halved for this fight."
              >
                Ill
              </span>
            )}
            {combatant.data.gear.tier !== "comfortable" && (
              <span
                className="combat-roster-effect combat-roster-effect--burn"
                title={`${combatant.data.gear.outside} °C outside the comfortable range of their outfit (${combatant.data.gear.temp} °C here).`}
              >
                {combatant.data.gear.side === "cold" ? "Cold" : combatant.data.gear.side === "hot" ? "Hot" : "Climate"}: {combatant.data.gear.tierLabel}
              </span>
            )}
          </div>
        )}
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
            {combatant.statusEffects.slippery?.turnsLeft > 0 && (
              <span className="combat-roster-effect combat-roster-effect--snare">Slippery</span>
            )}
            {combatant.statusEffects.stunned && (
              <span className="combat-roster-effect combat-roster-effect--stun">
                Stunned (-{Number(combatant.statusEffects.stunned.ap) > 0 ? Math.round(combatant.statusEffects.stunned.ap) : 1} AP)
              </span>
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
            {combatant.statusEffects.disarmed?.turnsLeft > 0 && (
              <span className="combat-roster-effect combat-roster-effect--jam">Disarmed</span>
            )}
            {combatant.statusEffects.reversedDirection?.turnsLeft > 0 && (
              <span className="combat-roster-effect combat-roster-effect--confused">Reversed</span>
            )}
            {combatant.statusEffects.slowedReaction?.turnsLeft > 0 && (
              <span className="combat-roster-effect combat-roster-effect--confused">Slowed Reaction</span>
            )}
            {combatant.statusEffects.enhancedReaction?.turnsLeft > 0 && (
              <span className="combat-roster-effect combat-roster-effect--stun">Enhanced Reaction</span>
            )}
            {combatant.statusEffects.keenVision && (
              <span className="combat-roster-effect combat-roster-effect--stun">Keen Vision</span>
            )}
            {combatant.statusEffects.bleeding && (
              <span className="combat-roster-effect combat-roster-effect--bleed">Bleeding</span>
            )}
            {combatant.statusEffects.regen?.turnsLeft > 0 && (
              <span className="combat-roster-effect combat-roster-effect--regen">Regen +{combatant.statusEffects.regen.amount}</span>
            )}
            {combatant.statusEffects.marked && (
              <span className="combat-roster-effect combat-roster-effect--shock">Marked</span>
            )}
            {combatant.statusEffects.powerSurge && (
              <span className="combat-roster-effect combat-roster-effect--stun">Power Surge</span>
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
          {onToggleAutoCounter && canAutoCounter(combatant) && (
            <button
              type="button"
              className={`combat-roster-icon-btn ${autoOn ? "combat-roster-icon-btn--on" : ""}`}
              title={
                autoOn
                  ? "Auto-counter ON -- the server counters or dodges for them when it's worth it. Click to answer by hand."
                  : "Auto-counter OFF -- you answer their counter prompts. Click to let the server decide."
              }
              aria-label={`Auto-counter for ${combatant.name}`}
              aria-pressed={autoOn}
              onClick={() => onToggleAutoCounter(combatant.id, !autoOn)}
            >
              <RobotIcon weight={autoOn ? "fill" : "bold"} />
            </button>
          )}
          {onReset && (
            <button
              type="button"
              className="combat-roster-icon-btn"
              title="Reset position -- teleport to the middle of the map"
              aria-label={`Reset ${combatant.name}'s position to the center of the map`}
              onClick={() => onReset(combatant.id)}
            >
              <CrosshairSimpleIcon weight="bold" />
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

// One bulk chip ("Grunts", "NPCs"): lit when everyone in the group has
// auto-counter on, in which case a click turns the group off; otherwise a
// click turns the whole group on.
function AutoCounterGroup({ label, members, onToggle }) {
  if (members.length === 0) return null;
  const allOn = members.every((c) => c.data?.autoCounter);
  return (
    <button
      type="button"
      className={`combat-roster-auto-chip ${allOn ? "combat-roster-auto-chip--on" : ""}`}
      aria-pressed={allOn}
      title={`${allOn ? "Turn off" : "Turn on"} auto-counter for every ${label.toLowerCase()} in this fight`}
      onClick={() => onToggle(!allOn)}
    >
      {label} ({members.filter((c) => c.data?.autoCounter).length}/{members.length})
    </button>
  );
}

export default function CombatRoster({
  encounter,
  isDM,
  viewerUserId,
  actingCombatantId,
  onSelect,
  onRevive,
  onRemove,
  onReset,
  onToggleAutoCounter,
  onBulkAutoCounter,
}) {
  const { token } = useAuth();
  const { slugKnowledgeChanged } = useLiveState();
  const [slugKnowledge, setSlugKnowledge] = useState({});
  // Refetch what this player knows of the foes' slugs whenever it changes, or
  // a new foe joins the fight.
  const foeKey = encounter.combatants.filter(canAutoCounter).map((c) => c.id).join(",");
  useEffect(() => {
    if (isDM || !token || !foeKey) return undefined;
    let cancelled = false;
    fetch(`/api/combat/encounters/${encounter.id}/slug-knowledge`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => !cancelled && setSlugKnowledge(data.knowledge || {}))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isDM, token, encounter.id, foeKey, slugKnowledgeChanged]);

  const npcs = encounter.combatants.filter(canAutoCounter);
  const grunts = npcs.filter((c) => c.refGruntTemplateId != null);
  const namedNpcs = npcs.filter((c) => c.refGruntTemplateId == null);
  const ordered = encounter.combatants
    // Thugglet's invisibility: same visibility rule as the map (CombatMap.jsx)
    // -- the DM and the combatant's own player still see the row, everyone
    // else doesn't get a row for them at all.
    .filter((c) => (!c.statusEffects?.invisible && !isBurrowed(c)) || isDM || (c.kind === "character" && c.refUserId === viewerUserId))
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
        {isDM && onBulkAutoCounter && npcs.length > 0 && (
          <div className="combat-roster-auto-bar">
            <RobotIcon weight="bold" aria-hidden="true" />
            <span>Auto-counter</span>
            <AutoCounterGroup label="Grunts" members={grunts} onToggle={(on) => onBulkAutoCounter("grunts", on)} />
            <AutoCounterGroup label="NPCs" members={namedNpcs} onToggle={(on) => onBulkAutoCounter("npcs", on)} />
          </div>
        )}
        {ordered.map((c) => (
          <Row
            key={c.id}
            combatant={c}
            knowledge={slugKnowledge[c.id]}
            isActive={Boolean(encounter.activeCombatantIds?.includes(c.id))}
            isActing={c.id === actingCombatantId}
            isDM={isDM}
            onSelect={onSelect}
            onRevive={onRevive}
            onRemove={onRemove}
            onReset={onReset}
            onToggleAutoCounter={onToggleAutoCounter}
          />
        ))}
      </div>
    </div>
  );
}
