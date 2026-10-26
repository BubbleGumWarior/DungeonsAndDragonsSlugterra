import { BeltIcon, ShieldIcon, ShieldChevronIcon, SwordIcon } from "@phosphor-icons/react";
import { EQUIPMENT_KINDS, MELEE_TYPES, MELEE_STR_NOTE, formatSigned } from "./itemData.js";
import "./BlasterCard.css";

// Same dataTransfer type PlayerInventory's Secondary slot looks for -- kept off
// text/plain on purpose so dropping one onto a blaster card can't be mistaken
// for dropping a mod (those cards read text/plain as a mod id).
export const EQUIPMENT_DRAG_TYPE = "application/x-slugterra-equipment";

export const EQUIPMENT_ICONS = { melee: SwordIcon, ammo_belt: BeltIcon, shield: ShieldIcon, armor: ShieldChevronIcon };

function describe(item) {
  if (item.kind === "melee") {
    return `Swing for ${item.damage} ${MELEE_STR_NOTE} damage. Hit roll is d20 + STR${item.accuracy ? ` ${formatSigned(item.accuracy)}` : ""} against the target's DEX defence. Reaches ${item.reach} units. ${MELEE_TYPES[item.meleeType]?.note ?? ""}.`;
  }
  if (item.kind === "shield") {
    return `Secondary slot. Soaks up to ${item.absorb} damage in a fight, then breaks for the rest of that fight (pierce weapons ignore it). Good as new afterwards.`;
  }
  if (item.kind === "armor") {
    return `Armor slot. Adds ${item.gritBonus} to your maximum Grit while worn -- swap it between fights.`;
  }
  return `While equipped in the Secondary slot, your Primary blaster holds ${item.extraSlots} more slugs.`;
}

export default function EquipmentCard({ item, size = "sm", onClick, actions, draggableEquip = false, onDragStart, onDragEnd }) {
  const meta = EQUIPMENT_KINDS[item.kind] || EQUIPMENT_KINDS.melee;
  const Icon = EQUIPMENT_ICONS[item.kind] || SwordIcon;

  return (
    <div
      className={`blaster-card blaster-card--${size} ${onClick ? "blaster-card--clickable" : ""} ${draggableEquip ? "blaster-card--draggable" : ""}`}
      onClick={onClick}
      draggable={draggableEquip}
      onDragStart={
        draggableEquip
          ? (e) => {
              e.dataTransfer.setData(EQUIPMENT_DRAG_TYPE, String(item.id));
              e.dataTransfer.effectAllowed = "move";
              onDragStart?.(item);
            }
          : undefined
      }
      onDragEnd={draggableEquip ? () => onDragEnd?.() : undefined}
    >
      <div className="blaster-card-top">
        <div className="blaster-card-image">
          <Icon weight="duotone" />
        </div>
        <div className="blaster-card-identity">
          <h3 className="blaster-card-name">{item.name}</h3>
          <div className="blaster-card-badges">
            <span className="blaster-card-type">{item.kind === "melee" ? `${MELEE_TYPES[item.meleeType]?.label ?? "Melee"} Weapon` : meta.label}</span>
            {item.equipped && (
              <span className="blaster-card-equipped-badge blaster-card-equipped-badge--1">{item.kind === "armor" ? "Worn" : "Secondary"}</span>
            )}
          </div>
        </div>
      </div>

      <div className="blaster-card-stats">
        {item.kind === "melee" ? (
          <>
            <div className="blaster-card-stat">
              <span className="blaster-card-stat-value">{item.damage}</span>
              <span className="blaster-card-stat-label">Damage +STR</span>
            </div>
            <div className="blaster-card-stat">
              <span className="blaster-card-stat-value">{formatSigned(item.accuracy)}</span>
              <span className="blaster-card-stat-label">Accuracy</span>
            </div>
            <div className="blaster-card-stat">
              <span className="blaster-card-stat-value">{item.apCost}</span>
              <span className="blaster-card-stat-label">AP</span>
            </div>
            <div className="blaster-card-stat">
              <span className="blaster-card-stat-value">{item.reach}</span>
              <span className="blaster-card-stat-label">Reach</span>
            </div>
          </>
        ) : item.kind === "shield" ? (
          <div className="blaster-card-stat">
            <span className="blaster-card-stat-value">{item.absorb}</span>
            <span className="blaster-card-stat-label">Absorbs</span>
          </div>
        ) : item.kind === "armor" ? (
          <div className="blaster-card-stat">
            <span className="blaster-card-stat-value">+{item.gritBonus}</span>
            <span className="blaster-card-stat-label">Max Grit</span>
          </div>
        ) : (
          <div className="blaster-card-stat">
            <span className="blaster-card-stat-value">+{item.extraSlots}</span>
            <span className="blaster-card-stat-label">Slug Slots</span>
          </div>
        )}
      </div>

      <div className="blaster-card-effect">
        <span className="blaster-card-effect-label">{meta.short} effect</span>
        <span className="blaster-card-effect-text">{describe(item)}</span>
      </div>

      {actions && (
        <div className="blaster-card-actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
}
