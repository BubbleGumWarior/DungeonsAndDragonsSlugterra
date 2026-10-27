import { useRef, useState } from "react";
import { ArrowsClockwiseIcon, SparkleIcon } from "@phosphor-icons/react";
import {
  LOYALTY_TIER_LABELS,
  LOYALTY_TIERS,
  LOYALTY_TIER_MAX,
  typeColor,
  typeBallistics,
  loyaltyClashModifier,
  loyaltyAccuracyModifier,
  loyaltyTierColor,
} from "./slugData.js";
import SlugImage from "./SlugImage.jsx";
import SlugImageModal from "./SlugImageModal.jsx";
import EnergyPips from "./EnergyPips.jsx";
import LoyaltyMeter from "./LoyaltyMeter.jsx";
import "./SlugCard.css";

// One side of the card. The front shows the protoform, the back the velocity
// form; stats are the slug's own and identical on both sides, only the art and
// the ability text differ.
function SlugCardFace({
  slug,
  size,
  form,
  active,
  editable,
  onToggleEnergyPip,
  actions,
  redacted,
  canFlip,
  onFlip,
  onOpenImage,
}) {
  const isVelocity = form === "velocity";
  const image = isVelocity ? slug.velocityImage : slug.protoformImage;
  const abilityText = (isVelocity ? slug.velocityAbility : slug.protoformUtility) || "";
  const abilityLabel = isVelocity ? "Velocity Ability" : "Protoform Utility";

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
    // The hidden side is inert so its buttons and tooltips can't be tabbed to
    // or read out while it's turned away.
    <div className={`slug-card-face slug-card-face--${form}`} inert={!active} aria-hidden={!active}>
      {canFlip && (
        <button
          type="button"
          className="slug-card-flip-btn"
          aria-label={isVelocity ? "Flip back to protoform" : "Flip to velocity form"}
          onClick={(e) => {
            e.stopPropagation();
            onFlip();
          }}
        >
          <ArrowsClockwiseIcon weight="bold" />
        </button>
      )}

      <div className={`slug-card-top ${canFlip ? "slug-card-top--flippable" : ""}`}>
        <SlugImage image={image} form={form} size={size} onOpen={() => onOpenImage(form)} />
        <div className="slug-card-identity">
          <span className="slug-card-form-tag">{isVelocity ? "Velocity Form" : "Protoform"}</span>
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
            {typeof slug.loyaltyFill === "number" && (
              <div className="slug-card-loyalty-meter">
                <LoyaltyMeter fill={slug.loyaltyFill} tier={slug.loyaltyTier} shots={slug.loyaltyShots ?? null} compact />
              </div>
            )}

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
              <p className="slug-card-loyalty-legend-note">Fire a slug to earn its trust. A good Slug Handler earns it faster.</p>
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
          <span className="slug-card-ability-label">{abilityLabel}</span>
          <p>{abilityText || "No ability recorded for this form."}</p>
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

export default function SlugCard({
  slug,
  size = "sm",
  editable = false,
  onToggleEnergyPip,
  onClick,
  actions,
  redacted = false,
}) {
  const [flipped, setFlipped] = useState(false);
  const [viewerForm, setViewerForm] = useState(null);
  const imgSize = size === "lg" ? "lg" : size === "md" ? "md" : "sm";

  // Only slugs with a velocity form have a back to turn to.
  const canFlip = !redacted && Boolean(slug.velocityImage || slug.velocityAbility);
  // A card that already has its own click action (e.g. opening an editor in
  // Slug Management) keeps it; those cards flip with the corner button instead.
  const flipsOnClick = canFlip && !onClick;

  function handleCardClick(e) {
    if (onClick) {
      onClick(e);
      return;
    }
    if (!flipsOnClick) return;
    // Leave real controls alone, and don't flip when the click ended a text selection.
    if (e.target.closest("button, a, input, select, textarea, label")) return;
    if (window.getSelection?.()?.toString()) return;
    setFlipped((f) => !f);
  }

  // A max-loyalty (Bonded) slug gets a heavier element-coloured frame plus a
  // slow shimmer and glow pulse. Redacted Slugpedia entries have no real tier.
  const isBonded = !redacted && slug.loyaltyTier === LOYALTY_TIER_MAX;
  // A DM-approved Mega Morph slug gets its own iridescent frame and badge --
  // deliberately unlike the element-coloured Bonded look (and it wins over it
  // when a slug is both).
  const isMega = !redacted && Boolean(slug.megaMorphAllowed);

  const faceProps = {
    slug,
    size: imgSize,
    editable,
    onToggleEnergyPip,
    actions,
    redacted,
    canFlip,
    onFlip: () => setFlipped((f) => !f),
    onOpenImage: setViewerForm,
  };

  return (
    <div
      className={`slug-card slug-card--${size} ${onClick ? "slug-card--clickable" : ""} ${
        flipsOnClick ? "slug-card--flippable" : ""
      } ${flipped ? "slug-card--flipped" : ""} ${redacted ? "slug-card--redacted" : ""} ${
        isBonded ? "slug-card--bonded" : ""
      } ${isMega ? "slug-card--mega" : ""}`}
      style={{ "--type-color": typeColor(slug.type) }}
      onClick={handleCardClick}
    >
      {isBonded && <span className="slug-card-bonded-fx" aria-hidden="true" />}
      {isMega && (
        <>
          {/* One badge per side so the text never reads mirrored. */}
          <span className="slug-card-mega-badge" title="This slug can Mega Morph in combat" aria-hidden={flipped}>
            <SparkleIcon weight="fill" />
            Mega Morph
          </span>
          <span className="slug-card-mega-badge slug-card-mega-badge--back" aria-hidden={!flipped}>
            <SparkleIcon weight="fill" />
            Mega Morph
          </span>
        </>
      )}

      <SlugCardFace {...faceProps} form="protoform" active={!flipped} />
      {canFlip && <SlugCardFace {...faceProps} form="velocity" active={flipped} />}

      {viewerForm && (
        <SlugImageModal slug={slug} initialForm={viewerForm} onClose={() => setViewerForm(null)} />
      )}
    </div>
  );
}
