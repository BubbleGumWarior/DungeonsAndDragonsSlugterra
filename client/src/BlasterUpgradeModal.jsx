import { useEffect, useRef, useState } from "react";
import { DiceSixIcon, HammerIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { formatModifier } from "./characterData.js";
import { blasterUpgradeFor } from "./careData.js";
import { qualityInfo } from "./itemData.js";
import Die from "./Die.jsx";
import "./Panel.css";
import "./BarterModal.css";
import "./RepairModal.css";

const ROLL_ANIMATION_MS = 1100;
const ROLL_TICK_MS = 55;

// Lifting a blaster to its next quality tier. It costs Weapon Parts and an
// Engineering roll; the server rolls, and this lays out the roll against the DC
// and what it did, so the result is never a surprise number.
export default function BlasterUpgradeModal({ blaster, parts, onClose, onResolved }) {
  const { token } = useAuth();
  const [phase, setPhase] = useState("ready"); // ready | rolling | result
  const [shown, setShown] = useState(20);
  const [roll, setRoll] = useState(null);
  const [error, setError] = useState(null);
  const tick = useRef(null);

  useEffect(() => () => clearInterval(tick.current), []);

  const upgrade = blasterUpgradeFor(blaster.quality);
  const from = qualityInfo(blaster.quality);
  const to = upgrade ? qualityInfo(upgrade.to) : null;
  const short = upgrade ? parts < upgrade.parts : true;

  function handleRoll() {
    if (phase !== "ready" || !upgrade) return;
    setError(null);
    setPhase("rolling");
    const startedAt = Date.now();
    tick.current = setInterval(() => setShown(1 + Math.floor(Math.random() * 20)), ROLL_TICK_MS);

    fetch(`/api/blasters/${blaster.id}/upgrade`, { method: "POST", headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not upgrade that blaster.");
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

  return (
    <div className="barter-backdrop" onMouseDown={(e) => e.target === e.currentTarget && phase !== "rolling" && onClose()}>
      <div className="barter-card" role="dialog" aria-modal="true" aria-label={`Upgrade ${blaster.name}`}>
        <button type="button" className="barter-close" onClick={onClose} aria-label="Close" disabled={phase === "rolling"}>
          <XIcon weight="bold" />
        </button>
        <div className="barter-head">
          <span className="barter-head-icon">
            <HammerIcon weight="duotone" />
          </span>
          <div>
            <h3 className="barter-title">Upgrade {blaster.name}</h3>
            <p className="repair-sub">
              {from.label}
              {to && <> → <strong>{to.label}</strong></>} · Weapon Parts <strong className="num-tabular">×{parts}</strong>
            </p>
          </div>
        </div>

        {phase === "ready" && upgrade && (
          <>
            <ul className="barter-rules">
              <li>
                Costs <strong className={short ? undefined : "repair-good"}>{upgrade.parts} Weapon Parts</strong>
                {short ? `, and you have ${parts}.` : "."}
              </li>
              <li>Roll a d20 and add your Engineering modifier (and any Workshop bonus).</li>
              <li>
                Reach <strong className="repair-good">{upgrade.dc}</strong> (or roll a natural 20) and the blaster becomes{" "}
                <strong>{to.label}</strong>: +{to.accuracyBonus - from.accuracyBonus} accuracy, fewer misfires ({to.failRate}%) and slower wear.
              </li>
              <li>Fall short and <strong>half the parts are lost</strong>. The blaster stays as it is.</li>
              <li>A broken blaster has to be mended first.</li>
            </ul>
            <button type="button" className="panel-btn barter-roll" onClick={handleRoll} disabled={short}>
              <DiceSixIcon weight="bold" />
              Roll Engineering
            </button>
          </>
        )}
        {phase === "ready" && !upgrade && <p className="repair-sub">This blaster is already {from.label}. There is nothing higher to reach.</p>}

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
                  ? `${roll.crit ? "A natural 20! " : `A ${roll.total}! `}The blaster is now ${qualityInfo(roll.toQuality).label}. ${roll.spent} Weapon Parts used.`
                  : `A ${roll.total}. The work doesn't take: ${roll.spent} Weapon Parts are wasted and the blaster is unchanged.`}
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
