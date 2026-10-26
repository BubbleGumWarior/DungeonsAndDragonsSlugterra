import { useEffect, useRef, useState } from "react";
import { LOYALTY_TIER_LABELS, LOYALTY_TIER_MAX, loyaltyTierColor } from "./slugData.js";
import "./LoyaltyMeter.css";

const FLOURISH_MS = 700;

// Words for the meter, so it isn't a number in disguise: a screen reader hears
// roughly how far along, never an exact share.
function progressWords(fill) {
  if (fill < 0.1) return "just started";
  if (fill < 0.4) return "making headway";
  if (fill < 0.7) return "about halfway";
  if (fill < 0.95) return "nearly there";
  return "on the cusp";
}

// How much of its current loyalty tier a slug has earned. Players only ever see
// the fill (`shots` -- { done, needed } -- is sent to the Dungeon Master alone,
// who also reads it as text). It eases as shots land, pulses when one does, and
// on rising a tier runs to full, flares once, then starts the next tier empty.
// A Bonded slug has nothing left to earn: a full, still gold bar.
export default function LoyaltyMeter({ fill = 0, tier = 0, shots = null, compact = false }) {
  const bonded = tier >= LOYALTY_TIER_MAX;
  const target = bonded ? 1 : Math.min(1, Math.max(0, fill));
  const [shown, setShown] = useState(target);
  // Bumps on each gain; its parity swaps between two identical keyframes so the
  // pulse restarts without remounting the bar (which would skip the easing).
  const [pulse, setPulse] = useState(0);
  const [flare, setFlare] = useState(false);
  const prev = useRef({ fill: target, tier });
  const latest = useRef(target);
  latest.current = target;
  const flaring = useRef(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    const last = prev.current;
    prev.current = { fill: target, tier };
    if (tier > last.tier && !bonded) {
      // Rose a tier: fill out the old one first, flare, then show the new tier.
      flaring.current = true;
      setShown(1);
      setFlare(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        flaring.current = false;
        setFlare(false);
        setShown(latest.current);
      }, FLOURISH_MS);
      return;
    }
    if (flaring.current) return; // the flourish lands on the latest fill itself
    setShown(target);
    if (target > last.fill && tier === last.tier) setPulse((n) => n + 1);
  }, [target, tier, bonded]);

  const color = loyaltyTierColor(tier);
  const next = LOYALTY_TIER_LABELS[tier + 1];
  const label = bonded ? "Bonded -- nothing left to earn" : `Earning ${next} loyalty: ${progressWords(target)}`;

  return (
    <div className={`loyalty-meter ${compact ? "loyalty-meter--compact" : ""}`} style={{ "--loyalty-color": color }}>
      <div className="loyalty-meter-track" role="meter" aria-label="Loyalty progress" aria-valuemin={0} aria-valuemax={1} aria-valuenow={target} aria-valuetext={label}>
        <span
          className={`loyalty-meter-fill ${pulse ? `loyalty-meter-fill--gain-${pulse % 2}` : ""} ${flare ? "loyalty-meter-fill--flare" : ""} ${
            bonded ? "loyalty-meter-fill--bonded" : ""
          }`}
          style={{ transform: `scaleX(${shown})` }}
        />
      </div>
      {shots && !bonded && (
        <span className="loyalty-meter-shots num-tabular" title="Shots toward the next tier at the owner's current Slug Handling (DM only)">
          {shots.done}/{shots.needed}
        </span>
      )}
    </div>
  );
}
