import { useEffect, useRef, useState } from "react";
import { DiceSixIcon, HandshakeIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { formatModifier } from "./characterData.js";
import Die from "./Die.jsx";
import "./Panel.css";
import "./BarterModal.css";

const ROLL_ANIMATION_MS = 1100;
const ROLL_TICK_MS = 55;

// The persuasion haggle. The server rolls (d20 + Persuasion) -- this just
// animates the die, then lays out the roll, the modifier, the total and what
// it earned, so the result is never a surprise number.
export default function BarterModal({ planetName, onClose, onResolved }) {
  const { token } = useAuth();
  const [phase, setPhase] = useState("ready"); // ready | rolling | result
  const [shown, setShown] = useState(20);
  const [roll, setRoll] = useState(null);
  const [error, setError] = useState(null);
  const tick = useRef(null);

  useEffect(() => () => clearInterval(tick.current), []);

  function handleRoll() {
    if (phase !== "ready") return;
    setError(null);
    setPhase("rolling");
    const startedAt = Date.now();
    tick.current = setInterval(() => setShown(1 + Math.floor(Math.random() * 20)), ROLL_TICK_MS);

    fetch("/api/market/barter", { method: "POST", headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not barter.");
        return data.roll;
      })
      .then((r) => {
        const wait = Math.max(0, ROLL_ANIMATION_MS - (Date.now() - startedAt));
        setTimeout(() => {
          clearInterval(tick.current);
          setShown(r.die);
          setRoll(r);
          setPhase("result");
          onResolved?.(r);
        }, wait);
      })
      .catch((err) => {
        clearInterval(tick.current);
        setPhase("ready");
        setError(err.message);
      });
  }

  const good = roll && roll.pct > 0;
  const bad = roll && roll.pct < 0;

  return (
    <div className="barter-backdrop" onMouseDown={(e) => e.target === e.currentTarget && phase !== "rolling" && onClose()}>
      <div className="barter-card" role="dialog" aria-modal="true" aria-label="Barter">
        <button type="button" className="barter-close" onClick={onClose} aria-label="Close" disabled={phase === "rolling"}>
          <XIcon weight="bold" />
        </button>
        <div className="barter-head">
          <span className="barter-head-icon">
            <HandshakeIcon weight="duotone" />
          </span>
          <div>
            <p className="barter-kicker">Persuasion · {planetName}</p>
            <h3 className="barter-title">Haggle with the merchants</h3>
          </div>
        </div>

        {phase === "ready" && (
          <>
            <ul className="barter-rules">
              <li>Roll a d20 and add your Persuasion modifier.</li>
              <li>Beat 10 and you earn 2% off per point, up to 20%.</li>
              <li>
                Roll under 10 and you insult the stallholders: <strong>prices rise 2% per point for everyone</strong> on
                this planet, up to 20%.
              </li>
              <li>One attempt per planet until the party rests.</li>
            </ul>
            <button type="button" className="panel-btn barter-roll" onClick={handleRoll}>
              <DiceSixIcon weight="bold" />
              Roll Persuasion
            </button>
          </>
        )}

        {phase !== "ready" && (
          <div className="barter-stage">
            <div className="barter-equation">
              <div className="barter-term">
                <Die value={shown} rolling={phase === "rolling"} />
                <span className="barter-term-label">d20</span>
              </div>
              {roll && (
                <>
                  <span className="barter-op num-tabular">{formatModifier(roll.modifier)}</span>
                  <span className="barter-op">=</span>
                  <div className="barter-term">
                    <span className={`barter-total num-tabular${good ? " barter-total--good" : bad ? " barter-total--bad" : ""}`}>
                      {roll.total}
                    </span>
                    <span className="barter-term-label">total</span>
                  </div>
                </>
              )}
            </div>
            {roll && (
              <p className={`barter-outcome${good ? " barter-outcome--good" : bad ? " barter-outcome--bad" : ""}`}>
                {good && `A ${roll.total}! You talk them down -- ${roll.pct}% off for you.`}
                {bad && `A ${roll.total}. You rub them the wrong way -- prices on this planet rise ${-roll.pct}% for everyone.`}
                {!good && !bad && "A 10. They do not budge. Prices stay as listed."}
              </p>
            )}
            {roll && roll.pct !== 0 && (
              <p className="barter-math num-tabular">
                ({roll.total} − 10) × 2% = {roll.pct > 0 ? "+" : ""}
                {roll.pct}%{Math.abs(roll.pct) >= 20 ? " (capped)" : ""}
              </p>
            )}
            {phase === "result" && (
              <button type="button" className="panel-btn barter-done" onClick={onClose}>
                Back to the stalls
              </button>
            )}
          </div>
        )}
        {error && <p className="panel-error">{error}</p>}
      </div>
    </div>
  );
}
