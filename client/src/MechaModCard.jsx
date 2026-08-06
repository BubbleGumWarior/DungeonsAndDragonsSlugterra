import { EngineIcon, DropIcon, WindIcon, MotorcycleIcon, ShovelIcon } from "@phosphor-icons/react";
import { formatSigned } from "./mechaData.js";
import "./ModCard.css";

const MODE_ICONS = {
  aquatic: DropIcon,
  glider: WindIcon,
  bike: MotorcycleIcon,
  burrow: ShovelIcon,
};

const MODE_LABELS = {
  aquatic: "Unlocks Aquatic Mode",
  glider: "Unlocks Glider Mode",
  bike: "Unlocks Bike Mode",
  burrow: "Unlocks Burrow Mode",
};

export default function MechaModCard({ mod, mechas = [], editable = false, draggable = false, onUnequip, onClick, onDragEnd, actions }) {
  const equippedMecha = mechas.find((m) => m.id === mod.equippedMechaId);
  const ModeIcon = mod.unlocksMode ? MODE_ICONS[mod.unlocksMode] : null;
  const isDraggable = draggable && !equippedMecha;

  return (
    <div
      className={`mod-card ${onClick ? "mod-card--clickable" : ""} ${isDraggable ? "mod-card--draggable" : ""}`}
      onClick={onClick}
      draggable={isDraggable}
      onDragStart={
        isDraggable
          ? (e) => {
              e.dataTransfer.setData("text/plain", String(mod.id));
              e.dataTransfer.effectAllowed = "move";
            }
          : undefined
      }
      onDragEnd={isDraggable ? () => onDragEnd?.() : undefined}
    >
      <div className="mod-card-top">
        <div className="mod-card-image">
          <EngineIcon weight="duotone" />
        </div>
        <div className="mod-card-identity">
          <h3 className="mod-card-name">{mod.name}</h3>
          <div className="mod-card-bonuses">
            {mod.speedBonus !== 0 && <span className="mod-card-bonus">Speed {formatSigned(mod.speedBonus)}</span>}
            {mod.handlingBonus !== 0 && <span className="mod-card-bonus">Handling {formatSigned(mod.handlingBonus)}</span>}
            {mod.armorBonus !== 0 && <span className="mod-card-bonus">Armor {formatSigned(mod.armorBonus)}</span>}
            {mod.rammingBonus !== 0 && <span className="mod-card-bonus">Ramming {formatSigned(mod.rammingBonus)}</span>}
            {mod.unlocksMode && (
              <span className="mod-card-bonus mod-card-bonus--mode">
                {ModeIcon && <ModeIcon weight="bold" />}
                {MODE_LABELS[mod.unlocksMode]}
              </span>
            )}
          </div>
        </div>
      </div>

      {mod.effect && <p className="mod-card-effect">{mod.effect}</p>}

      {editable && (
        <div className="mod-card-equip" onClick={(e) => e.stopPropagation()}>
          {equippedMecha ? (
            <>
              <span className="mod-card-equipped-label">Equipped: {equippedMecha.name}</span>
              <button type="button" className="mod-card-unequip" onClick={() => onUnequip?.(mod)}>
                Unequip
              </button>
            </>
          ) : (
            <span className="mod-card-drag-hint">Drag onto a mecha-beast to equip</span>
          )}
        </div>
      )}

      {actions && (
        <div className="mod-card-actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
}
