import { useRef, useState } from "react";
import {
  LOYALTY_TIER_LABELS,
  LOYALTY_TIERS,
  typeColor,
  typeBallistics,
  loyaltyClashModifier,
  loyaltyAccuracyModifier,
  loyaltyTierColor,
} from "./slugData.js";
import { useTypewriter } from "./useTypewriter.js";
import SlugImage from "./SlugImage.jsx";
import EnergyPips from "./EnergyPips.jsx";
import "./SlugCard.css";

export default function SlugCard({
  slug,
  size = "sm",
  editable = false,
  onToggleEnergyPip,
  onClick,
  actions,
  redacted = false,
}) {
  const [face, setFace] = useState("protoform");
  const abilityText = (face === "velocity" ? slug.velocityAbility : slug.protoformUtility) || "";
  const abilityLabel = face === "velocity" ? "Velocity Ability" : "Protoform Utility";
  const typedAbility = useTypewriter(abilityText);
  const typedLabel = useTypewriter(abilityLabel);
  // Loyalty tier shifts this slug's effective clash power/defense and its
  // shooter's accuracy in combat (see loyaltyClashModifier/
  // loyaltyAccuracyModifier in server/src/combatRules.js) -- shown as a
  // small +/- tag so the base stat above isn't the whole story.
  const clashMod = loyaltyClashModifier(slug.loyaltyTier);
  const clashModLabel = clashMod > 0 ? `+${clashMod}` : `${clashMod}`;
  const clashModClass = `slug-card-loyalty-mod slug-card-loyalty-mod--${clashMod > 0 ? "positive" : "negative"}`;
  const accuracyMod = loyaltyAccuracyModifier(slug.loyaltyTier);
  const accuracyModLabel = accuracyMod > 0 ? `+${accuracyMod}` : `${accuracyMod}`;
  const accuracyModClass = `slug-card-loyalty-mod slug-card-loyalty-mod--${accuracyMod > 0 ? "positive" : "negative"}`;
  const loyaltyColor = loyaltyTierColor(slug.loyaltyTier);

  // Combat profile shown on hover: what this slug's *element* does to a shot.
  // Range/accuracy are the type's modifiers (mirrors TYPE_BALLISTICS in
  // server/src/combatRules.js); loyalty tier nudges accuracy further. This is
  // purely the type contribution -- per-slug ability flags aren't listed here.
  const ballistics = typeBallistics(slug.type);
  const fmtMod = (n) => (n > 0 ? `+${n}` : `${n}`);
  const totalAccuracy = ballistics.accuracyMod + accuracyMod;

  // The element panel opens to the type chip's right by default; if that would
  // run it off the right edge of the viewport, flip it to the left instead.
  // Measured on hover/focus rather than guessed from grid position, since the
  // grid reflows to any number of columns.
  const typeRef = useRef(null);
  const [benefitLeft, setBenefitLeft] = useState(false);
  function placeBenefit() {
    const el = typeRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const PANEL_SPACE = 240 + 12 + 8; // panel width + gap + margin
    setBenefitLeft(rect.right + PANEL_SPACE > window.innerWidth);
  }

  return (
    <div
      className={`slug-card slug-card--${size} ${onClick ? "slug-card--clickable" : ""} ${
        redacted ? "slug-card--redacted" : ""
      }`}
      style={{ "--type-color": typeColor(slug.type) }}
      onClick={onClick}
    >
      <div className="slug-card-top">
        <SlugImage
          protoformImage={slug.protoformImage}
          velocityImage={slug.velocityImage}
          size={size === "lg" ? "lg" : size === "md" ? "md" : "sm"}
          onFaceChange={setFace}
        />
        <div className="slug-card-identity">
          <h3 className="slug-card-name">{slug.name}</h3>
          {/* Hovering (or focusing) the element chip reveals what that type
              does to a shot: its range/accuracy modifiers and on-hit effect. */}
          <div
            className="slug-card-type-wrap"
            ref={typeRef}
            tabIndex={redacted ? -1 : 0}
            onMouseEnter={placeBenefit}
            onFocus={placeBenefit}
          >
            <span className="slug-card-type" style={{ "--type-color": typeColor(slug.type) }}>
              {slug.type}
            </span>

            {!redacted && (
            <div className={`slug-card-benefit ${benefitLeft ? "slug-card-benefit--left" : ""}`} role="tooltip">
              <p className="slug-card-benefit-title">
                <span className="slug-card-benefit-type" style={{ "--type-color": typeColor(slug.type) }}>
                  {slug.type}
                </span>
                element
              </p>
              <div className="slug-card-benefit-stats">
                <div className="slug-card-benefit-stat">
                  <span className="slug-card-benefit-stat-value">{ballistics.band}</span>
                  <span className="slug-card-benefit-stat-label">Range</span>
                  <span className="slug-card-benefit-stat-sub">~{ballistics.range}u</span>
                </div>
                <div className="slug-card-benefit-stat">
                  <span className="slug-card-benefit-stat-value">{fmtMod(totalAccuracy)}</span>
                  <span className="slug-card-benefit-stat-label">Accuracy</span>
                  <span className="slug-card-benefit-stat-sub">
                    type {fmtMod(ballistics.accuracyMod)}
                    {accuracyMod !== 0 && ` · loyalty ${fmtMod(accuracyMod)}`}
                  </span>
                </div>
              </div>

              <div className="slug-card-benefit-effect">
                <span className="slug-card-benefit-effect-label">Hit effect</span>
                <p>{ballistics.hitEffect}</p>
              </div>
            </div>
            )}
          </div>
        </div>
      </div>

      {redacted ? (
        <div className="slug-card-stats slug-card-stats--redacted">
          {["Clash Power", "Clash Defense", "AP Cost", "Loyalty"].map((label) => (
            <div className="slug-card-stat" key={label}>
              <span className="slug-card-stat-value">?</span>
              <span className="slug-card-stat-label">{label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="slug-card-stats">
          <div className="slug-card-stat">
            <span className="slug-card-stat-value">
              {slug.clashPower}
              {clashMod !== 0 && <span className={clashModClass}>{clashModLabel}</span>}
            </span>
            <span className="slug-card-stat-label">Clash Power</span>
          </div>
          <div className="slug-card-stat">
            <span className="slug-card-stat-value">
              {slug.clashDefense}
              {clashMod !== 0 && <span className={clashModClass}>{clashModLabel}</span>}
            </span>
            <span className="slug-card-stat-label">Clash Defense</span>
          </div>
          <div className="slug-card-stat">
            <span className="slug-card-stat-value">{slug.apCost}</span>
            <span className="slug-card-stat-label">AP Cost</span>
          </div>
          <div className="slug-card-stat slug-card-stat--loyalty" tabIndex={0}>
            <span className="slug-card-stat-value" style={{ color: loyaltyColor }}>
              {LOYALTY_TIER_LABELS[slug.loyaltyTier]}
              {accuracyMod !== 0 && <span className={accuracyModClass}>{accuracyModLabel} ACC</span>}
            </span>
            <span className="slug-card-stat-label">Loyalty</span>

            <div className="slug-card-loyalty-legend" role="tooltip">
              <p className="slug-card-loyalty-legend-title">Loyalty Tiers</p>
              {LOYALTY_TIERS.map((tier) => (
                <div key={tier.value} className="slug-card-loyalty-legend-row">
                  <span className="slug-card-loyalty-legend-swatch" style={{ background: tier.color, color: tier.color }} />
                  <span className="slug-card-loyalty-legend-name" style={{ color: tier.color }}>
                    {tier.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {redacted && (
        <p className="slug-card-redacted-note">Seen in the wild — a player must catch one to log its stats and abilities.</p>
      )}

      {Array.isArray(slug.energyPips) && (
        <div className="slug-card-energy">
          <span className="slug-card-energy-label">Energy</span>
          <EnergyPips
            size={size === "lg" ? "lg" : "md"}
            pips={slug.energyPips}
            editable={editable}
            onToggle={onToggleEnergyPip}
          />
        </div>
      )}

      {(slug.protoformUtility || slug.velocityAbility) && (
        <div className="slug-card-ability">
          <span className={`slug-card-ability-label ${typedLabel.isTyping ? "slug-card-typing" : ""}`}>
            {typedLabel.text}
          </span>
          <p className={typedAbility.isTyping ? "slug-card-typing" : ""}>{typedAbility.text}</p>
        </div>
      )}

      {actions && (
        <div className="slug-card-actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
}
