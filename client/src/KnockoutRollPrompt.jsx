import { useEffect, useState } from "react";
import { PulseIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { formatModifier } from "./characterData.js";
import Die from "./Die.jsx";
import "./Panel.css";
import "./KnockoutRollPrompt.css";

const REASON_TEXT = {
  grit: "Your Grit just hit 0.",
  knockback: "You were slammed into a wall.",
  "mecha-ram": "You were thrown by a mecha ramming into you.",
  "mecha-destroyed": "The mecha you were riding was just wrecked.",
};

function KnockoutCard({ offer, onDone }) {
  const { token } = useAuth();
  const [rolling, setRolling] = useState(false);
  const [display, setDisplay] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

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
          <p className="knockout-prompt-kicker">{REASON_TEXT[offer.reason] || "You've taken a hit."}</p>
          <h3 className="knockout-prompt-title">Knockout Roll -- DC {offer.dc}</h3>
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
          Roll Constitution Save
        </button>
      )}

      {result && (
        <p className={`knockout-prompt-result ${result.success ? "knockout-prompt-result--success" : "knockout-prompt-result--fail"}`}>
          {result.success ? "You shake it off and stay in the fight!" : "You fall unconscious."}
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
  const [offer, setOffer] = useState(null);

  useEffect(() => {
    if (!knockoutRollOffered) return;
    setOffer(knockoutRollOffered);
  }, [knockoutRollOffered]);

  if (!offer) return null;

  return (
    <div className="knockout-prompt-stack">
      <KnockoutCard offer={offer} onDone={() => setOffer(null)} />
    </div>
  );
}
