import { useEffect, useState } from "react";
import { PulseIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { formatModifier } from "./characterData.js";
import Die from "./Die.jsx";
import "./Panel.css";
import "./KnockoutRollPrompt.css";

const REASON_TEXT_SELF = {
  grit: "Your Grit just hit 0.",
  knockback: "You were slammed into a wall.",
  "mecha-ram": "You were thrown by a mecha ramming into you.",
  "mecha-destroyed": "The mecha you were riding was just wrecked.",
};

const REASON_TEXT_NPC = {
  grit: "Grit just hit 0.",
  knockback: "Slammed into a wall.",
  "mecha-ram": "Thrown by a ramming mecha.",
  "mecha-destroyed": "The mecha it was riding was just wrecked.",
};

function KnockoutCard({ offer, onDone }) {
  const { token } = useAuth();
  const [rolling, setRolling] = useState(false);
  const [display, setDisplay] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const forNpc = Boolean(offer.forNpc);
  const who = forNpc ? offer.name || "The NPC" : null;

  useEffect(() => {
    if (!rolling) return;
    const tick = setInterval(() => setDisplay(1 + Math.floor(Math.random() * 20)), 45);
    return () => clearInterval(tick);
  }, [rolling]);

  async function handleRoll() {
    if (rolling || result) return;
    setError(null);
    setRolling(true);
    const startedAt = Date.now();
    try {
      const res = await fetch(`/api/combat/knockout/${offer.id}/resolve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not roll.");
      const wait = Math.max(0, 900 - (Date.now() - startedAt));
      setTimeout(() => {
        setDisplay(data.roll);
        setResult(data);
        setRolling(false);
      }, wait);
    } catch (err) {
      setRolling(false);
      setError(err.message);
    }
  }

  return (
    <div className="knockout-prompt-card">
      <div className="knockout-prompt-head">
        <span className="knockout-prompt-icon">
          <PulseIcon weight="duotone" />
        </span>
        <div>
          <p className="knockout-prompt-kicker">
            {forNpc
              ? `${who} -- ${REASON_TEXT_NPC[offer.reason] || "took a hit."}`
              : REASON_TEXT_SELF[offer.reason] || "You've taken a hit."}
          </p>
          <h3 className="knockout-prompt-title">
            {forNpc ? `${who}: Knockout Roll` : "Knockout Roll"} -- DC {offer.dc}
          </h3>
        </div>
      </div>

      <div className="knockout-prompt-die-row">
        <Die value={display} rolling={rolling} state={result ? (result.success ? "kept" : "discarded") : null} />
        {result && (
          <div className="knockout-prompt-total">
            <span className="num-tabular">{result.total}</span>
            <span className="knockout-prompt-mod">{formatModifier(offer.conMod)} CON</span>
          </div>
        )}
      </div>

      {!result && !rolling && (
        <button type="button" className="panel-btn" onClick={handleRoll}>
          {forNpc ? `Roll Constitution Save for ${who}` : "Roll Constitution Save"}
        </button>
      )}

      {result && (
        <p className={`knockout-prompt-result ${result.success ? "knockout-prompt-result--success" : "knockout-prompt-result--fail"}`}>
          {forNpc
            ? result.success
              ? `${who} shakes it off and stays in the fight!`
              : `${who} falls unconscious.`
            : result.success
              ? "You shake it off and stay in the fight!"
              : "You fall unconscious."}
        </p>
      )}
      {result && (
        <button type="button" className="panel-btn panel-btn--ghost" onClick={onDone}>
          Close
        </button>
      )}
      {error && <p className="panel-error">{error}</p>}
    </div>
  );
}

export default function KnockoutRollPrompt() {
  const { knockoutRollOffered } = useLiveState();
  const [offers, setOffers] = useState([]);

  // A DM fielding several NPCs (or an AOE dropping a whole group) can get
  // multiple knockout rolls stacked up at once -- keep every distinct offer
  // rather than only the latest, and clear each as it's answered.
  useEffect(() => {
    if (!knockoutRollOffered) return;
    setOffers((prev) => (prev.some((o) => o.id === knockoutRollOffered.id) ? prev : [...prev, knockoutRollOffered]));
  }, [knockoutRollOffered]);

  if (offers.length === 0) return null;

  return (
    <div className="knockout-prompt-stack">
      {offers.map((offer) => (
        <KnockoutCard key={offer.id} offer={offer} onDone={() => setOffers((prev) => prev.filter((o) => o.id !== offer.id))} />
      ))}
    </div>
  );
}
