import { useEffect, useRef } from "react";
import { LightningIcon, LightningSlashIcon, TargetIcon } from "@phosphor-icons/react";
import { typeColor, loyaltyClashModifier } from "./slugData.js";
import EnergyPips from "./EnergyPips.jsx";
import "./Panel.css";
import "./CombatSlugPanel.css";

// Mirrors server/src/combatRules.js's SLUG_RETURN_TURNS -- how many of the
// owner's own turns a fired slug spends away before it's back in hand.
const SLUG_RETURN_TURNS = 3;

const COOLDOWN_RING_RADIUS = 27;
const COOLDOWN_RING_CIRCUMFERENCE = 2 * Math.PI * COOLDOWN_RING_RADIUS;

// The number key a slug answers to: its magazine slot (slot 1 -> "1"), the
// same number the loadout screen and the counter-clash prompt show. Slots
// past 9 have no key.
function slugHotkey(slug) {
  return Number.isInteger(slug.magazineSlot) ? slug.magazineSlot + 1 : null;
}

export default function CombatSlugPanel({ actingCombatant, slugs, armedSlugId, onPickSlug, hotkeysActive = false }) {
  // 1-9 arms the slug in that magazine slot, but only on your own turn (a
  // counter-clash on someone else's turn has its own prompt + handler) and
  // never while typing into a field.
  const pickRef = useRef(onPickSlug);
  pickRef.current = onPickSlug;
  const slugsRef = useRef(slugs);
  slugsRef.current = slugs;
  useEffect(() => {
    if (!hotkeysActive) return undefined;
    function onKeyDown(e) {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const num = Number(e.key);
      if (!Number.isInteger(num) || num < 1 || num > 9) return;
      const slug = slugsRef.current.find((s) => slugHotkey(s) === num);
      if (!slug) return;
      const onCooldown = (slug.cooldownTurnsLeft || 0) > 0;
      const charged = Array.isArray(slug.energyPips) && slug.energyPips.some(Boolean);
      if (onCooldown || !charged) return;
      pickRef.current(armedSlugId === slug.id ? null : slug);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hotkeysActive, armedSlugId]);

  if (!actingCombatant || (actingCombatant.kind !== "character" && actingCombatant.kind !== "npc")) {
    return null;
  }

  return (
    <div className="panel panel--quiet combat-slug-panel">
      <div className="panel-header">
        <span className="panel-header-icon">
          <TargetIcon weight="duotone" />
        </span>
        <div className="panel-header-text">
          <h2>{actingCombatant.name}'s Slugs</h2>
          <p>Pick one, then click a target</p>
        </div>
      </div>
      <div className="panel-body combat-slug-panel-body">
        {slugs.length === 0 ? (
          <p className="combat-slug-panel-empty">No slugs loaded into this weapon.</p>
        ) : (
          slugs.map((s) => {
            const cooldown = s.cooldownTurnsLeft || 0;
            const onCooldown = cooldown > 0;
            const charged = Array.isArray(s.energyPips) && s.energyPips.some(Boolean);
            // Out of energy is its own thing, distinct from cooldown -- no
            // fixed number of turns to count down, it just needs a recharge
            // (the "recharge" trait, hunker down, or a DM heal) -- so it
            // gets a flat "exhausted" mark instead of a ticking ring.
            const exhausted = !onCooldown && !charged;
            const unusable = onCooldown || exhausted;
            // How much of the wait is left, 1 (just fired) -> 0 (back in
            // hand) -- drives the ring's stroke-dashoffset below, so the
            // circle traces down to nothing as the turns tick off.
            const remaining = onCooldown ? cooldown / SLUG_RETURN_TURNS : 0;
            // Loyalty tier shifts this slug's *effective* power/defense in
            // combat (see loyaltyClashModifier in server/src/combatRules.js)
            // -- shown as a small +/- tag next to the base stat so the
            // number a hit actually deals doesn't look unexplained.
            const loyaltyMod = loyaltyClashModifier(s.loyaltyTier);
            const loyaltyModLabel = loyaltyMod > 0 ? `+${loyaltyMod}` : `${loyaltyMod}`;
            const loyaltyModClass = `combat-slug-panel-card-loyalty-mod combat-slug-panel-card-loyalty-mod--${loyaltyMod > 0 ? "positive" : "negative"}`;
            return (
              <button
                key={s.id}
                type="button"
                className={`combat-slug-panel-card ${armedSlugId === s.id ? "combat-slug-panel-card--armed" : ""} ${unusable ? "combat-slug-panel-card--unusable" : ""}`}
                style={{ "--type-color": typeColor(s.type) }}
                disabled={unusable}
                title={
                  onCooldown
                    ? `Returns to hand in ${cooldown} more turn${cooldown === 1 ? "" : "s"}`
                    : exhausted
                      ? "Out of energy -- needs to recharge"
                      : undefined
                }
                onClick={() => onPickSlug(armedSlugId === s.id ? null : s)}
              >
                <div className="combat-slug-panel-card-head">
                  {slugHotkey(s) != null && slugHotkey(s) <= 9 && (
                    <span className="combat-slug-panel-card-key">{slugHotkey(s)}</span>
                  )}
                  <span className="combat-slug-panel-card-name">{s.name}</span>
                  <span className="combat-slug-panel-card-ap">
                    <LightningIcon weight="fill" />
                    {s.apCost}
                  </span>
                </div>
                <span className="combat-slug-panel-card-type">{s.type}</span>
                <div className="combat-slug-panel-card-stats">
                  <span>
                    PWR {s.clashPower}
                    {loyaltyMod !== 0 && <span className={loyaltyModClass}>{loyaltyModLabel}</span>}
                  </span>
                  <span>
                    DEF {s.clashDefense}
                    {loyaltyMod !== 0 && <span className={loyaltyModClass}>{loyaltyModLabel}</span>}
                  </span>
                </div>
                <EnergyPips pips={s.energyPips} size="sm" />
                {onCooldown && (
                  <div className="combat-slug-cooldown-glass">
                    <svg className="combat-slug-cooldown-ring" viewBox="0 0 64 64">
                      <circle className="combat-slug-cooldown-ring-track" cx="32" cy="32" r={COOLDOWN_RING_RADIUS} />
                      <circle
                        className="combat-slug-cooldown-ring-progress"
                        cx="32"
                        cy="32"
                        r={COOLDOWN_RING_RADIUS}
                        style={{
                          strokeDasharray: COOLDOWN_RING_CIRCUMFERENCE,
                          strokeDashoffset: COOLDOWN_RING_CIRCUMFERENCE * (1 - remaining),
                        }}
                      />
                    </svg>
                    <span className="combat-slug-cooldown-number">{cooldown}</span>
                  </div>
                )}
                {exhausted && (
                  <div className="combat-slug-cooldown-glass combat-slug-cooldown-glass--exhausted">
                    <LightningSlashIcon weight="bold" className="combat-slug-exhausted-icon" />
                    <span className="combat-slug-exhausted-label">Exhausted</span>
                  </div>
                )}
              </button>
            );
          })
        )}
        {armedSlugId && <p className="combat-slug-panel-hint">Click an enemy token on the map to fire.</p>}
      </div>
    </div>
  );
}
