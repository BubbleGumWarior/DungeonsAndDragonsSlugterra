import { useState } from "react";
import { LOYALTY_TIER_LABELS, typeColor } from "./slugData.js";
import { useTypewriter } from "./useTypewriter.js";
import SlugImage from "./SlugImage.jsx";
import EnergyPips from "./EnergyPips.jsx";
import "./SlugCard.css";

export default function SlugCard({ slug, size = "sm", editable = false, onToggleEnergyPip, onClick, actions }) {
  const [face, setFace] = useState("protoform");
  const abilityText = (face === "velocity" ? slug.velocityAbility : slug.protoformUtility) || "";
  const abilityLabel = face === "velocity" ? "Velocity Ability" : "Protoform Utility";
  const typedAbility = useTypewriter(abilityText);
  const typedLabel = useTypewriter(abilityLabel);

  return (
    <div className={`slug-card slug-card--${size} ${onClick ? "slug-card--clickable" : ""}`} onClick={onClick}>
      <div className="slug-card-top">
        <SlugImage
          protoformImage={slug.protoformImage}
          velocityImage={slug.velocityImage}
          size={size === "lg" ? "lg" : size === "md" ? "md" : "sm"}
          onFaceChange={setFace}
        />
        <div className="slug-card-identity">
          <h3 className="slug-card-name">{slug.name}</h3>
          <span className="slug-card-type" style={{ "--type-color": typeColor(slug.type) }}>
            {slug.type}
          </span>
        </div>
      </div>

      <div className="slug-card-stats">
        <div className="slug-card-stat">
          <span className="slug-card-stat-value">{slug.clashPower}</span>
          <span className="slug-card-stat-label">Clash Power</span>
        </div>
        <div className="slug-card-stat">
          <span className="slug-card-stat-value">{slug.clashDefense}</span>
          <span className="slug-card-stat-label">Clash Defense</span>
        </div>
        <div className="slug-card-stat">
          <span className="slug-card-stat-value">{slug.apCost}</span>
          <span className="slug-card-stat-label">AP Cost</span>
        </div>
        <div className="slug-card-stat">
          <span className="slug-card-stat-value">{LOYALTY_TIER_LABELS[slug.loyaltyTier]}</span>
          <span className="slug-card-stat-label">Loyalty</span>
        </div>
      </div>

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
