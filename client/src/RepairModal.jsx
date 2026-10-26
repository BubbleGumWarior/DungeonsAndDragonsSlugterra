import { useEffect, useRef, useState } from "react";
import { DiceSixIcon, WrenchIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { formatModifier } from "./characterData.js";
import { REPAIR_DC, REPAIR_FAIL_DAMAGE, durabilityPercent } from "./careData.js";
import Die from "./Die.jsx";
import "./Panel.css";
import "./BarterModal.css";
import "./RepairModal.css";

const ROLL_ANIMATION_MS = 1100;
const ROLL_TICK_MS = 55;

// Patching up a blaster with a Repair Kit. The server rolls (d20 + Survival);
// this animates the die, then lays out the roll against the DC and what it did
// to the weapon, so the result is never a surprise number.
export default function RepairModal({ blaster, kits, onClose, onResolved }) {
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

    fetch(`/api/blasters/${blaster.id}/repair`, { method: "POST", headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not repair that blaster.");
        return data;
      })
      .then((data) => {
        const wait = Math.max(0, ROLL_ANIMATION_MS - (Date.now() - startedAt));
        setTimeout(() => {
          clearInterval(tick.current);
          setShown(data.roll.die);
          setRoll(data.roll);
          setPhase("result");
          onResolved?.(data);
        }, wait);
      })
      .catch((err) => {
        clearInterval(tick.current);
        setPhase("ready");
        setError(err.message);
      });
  }

  const before = durabilityPercent(blaster.durability ?? 100);

  return (
    <div className="barter-backdrop" onMouseDown={(e) => e.target === e.currentTarget && phase !== "rolling" && onClose()}>
      <div className="barter-card" role="dialog" aria-modal="true" aria-label={`Repair ${blaster.name}`}>
        <button type="button" className="barter-close" onClick={onClose} aria-label="Close" disabled={phase === "rolling"}>
          <XIcon weight="bold" />
        </button>
        <div className="barter-head">
          <span className="barter-head-icon">
            <WrenchIcon weight="duotone" />
          </span>
          <div>
            <h3 className="barter-title">Repair {blaster.name}</h3>
            <p className="repair-sub">
              Condition <strong className="num-tabular">{before}%</strong> · Repair Kits <strong className="num-tabular">×{kits}</strong>
            </p>
          </div>
        </div>

        {phase === "ready" && (
          <>
            <ul className="barter-rules">
              <li>Roll a d20 and add your Survival modifier.</li>
              <li>
                Roll <strong className="repair-good">above {REPAIR_DC}</strong> and the blaster is restored to 100%.
              </li>
              <li>
                Roll {REPAIR_DC} or less and <strong>the kit is wasted and the blaster loses {REPAIR_FAIL_DAMAGE}% more</strong>.
              </li>
              <li>At 0% a blaster is beyond a kit -- only an expert can mend it.</li>
            </ul>
            <button type="button" className="panel-btn barter-roll" onClick={handleRoll}>
              <DiceSixIcon weight="bold" />
              Roll Survival
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
                    <span className={`barter-total num-tabular${roll.success ? " barter-total--good" : " barter-total--bad"}`}>
                      {roll.total}
                    </span>
                    <span className="barter-term-label">vs DC {roll.dc}</span>
                  </div>
                </>
              )}
            </div>
            {roll && (
              <p className={`barter-outcome${roll.success ? " barter-outcome--good" : " barter-outcome--bad"}`}>
                {roll.success
                  ? `A ${roll.total}! The blaster is good as new -- back to 100%.`
                  : roll.after <= 0
                    ? `A ${roll.total}. The kit is spent and the blaster gives out completely -- it's broken. Only an expert can fix it now.`
                    : `A ${roll.total}. The kit is spent and the blaster is worse for it -- down to ${durabilityPercent(roll.after)}%.`}
              </p>
            )}
            {phase === "result" && (
              <button type="button" className="panel-btn barter-done" onClick={onClose}>
                Done
              </button>
            )}
          </div>
        )}
        {error && <p className="panel-error">{error}</p>}
      </div>
    </div>
  );
}
