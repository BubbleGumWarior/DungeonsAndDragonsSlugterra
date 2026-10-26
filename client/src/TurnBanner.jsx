import { useEffect } from "react";
import { LightningIcon, SwordIcon, HourglassMediumIcon } from "@phosphor-icons/react";
import "./TurnBanner.css";

function nameList(names) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// Says whose turn it is, loudly when it's yours. Teammates next to each other
// in the initiative order act at the same time, so `activeCombatants` can hold
// several. `actingCombatant` is the one the viewer is playing (a player's own
// character, or the DM's currently selected combatant); it's "mine" when that
// combatant is one of the active ones.
export default function TurnBanner({ activeCombatants, actingCombatant, isDM, onSelectActive, round }) {
  const mine = actingCombatant ? activeCombatants.find((c) => c.id === actingCombatant.id) || null : null;
  const isMine = mine != null;
  const others = activeCombatants.filter((c) => c.id !== mine?.id);

  // The tab title is the only thing visible while the window is in the
  // background, so it carries the call to act too.
  useEffect(() => {
    if (!isMine || isDM) return undefined;
    const previous = document.title;
    document.title = "⚔ YOUR TURN — " + previous;
    return () => {
      document.title = previous;
    };
  }, [isMine, isDM]);

  if (activeCombatants.length === 0) return null;

  if (isMine && !isDM) {
    return (
      <div className="turn-banner turn-banner--mine" role="status" aria-live="assertive">
        <SwordIcon weight="fill" className="turn-banner-icon" />
        <div className="turn-banner-text">
          <span className="turn-banner-kicker">
            Round {round}
            {others.length > 0 ? ` · acting together with ${nameList(others.map((c) => c.name))}` : ""}
          </span>
          <strong className="turn-banner-title">Your turn</strong>
        </div>
        <span className="turn-banner-ap">
          <LightningIcon weight="fill" />
          {mine.currentAp} / {mine.maxAp} AP
        </span>
      </div>
    );
  }

  return (
    <div className={`turn-banner ${isDM && isMine ? "turn-banner--selected" : ""}`} role="status">
      <HourglassMediumIcon weight="bold" className="turn-banner-icon" />
      <div className="turn-banner-text">
        <span className="turn-banner-kicker">
          Round {round}
          {activeCombatants.length > 1 ? " · acting together" : ""}
        </span>
        <strong className="turn-banner-title">
          {activeCombatants.length > 1
            ? `${nameList(activeCombatants.map((c) => c.name))} act`
            : `${activeCombatants[0].name}'s turn`}
        </strong>
      </div>
      {isDM &&
        others.map((c) => (
          <button key={c.id} type="button" className="panel-btn panel-btn--ghost turn-banner-select" onClick={() => onSelectActive(c.id)}>
            Control {c.name}
            {others.length === activeCombatants.length && actingCombatant ? ` (now: ${actingCombatant.name})` : ""}
          </button>
        ))}
    </div>
  );
}
