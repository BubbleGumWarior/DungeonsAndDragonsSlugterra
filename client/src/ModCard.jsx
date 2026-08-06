import { WrenchIcon } from "@phosphor-icons/react";
import { formatSigned } from "./itemData.js";
import "./ModCard.css";

export default function ModCard({ mod, blasters = [], editable = false, draggable = false, onUnequip, onClick, onDragEnd, actions }) {
  const equippedBlaster = blasters.find((b) => b.id === mod.equippedBlasterId);
  const isDraggable = draggable && !equippedBlaster;

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
          <WrenchIcon weight="duotone" />
        </div>
        <div className="mod-card-identity">
          <h3 className="mod-card-name">{mod.name}</h3>
          <div className="mod-card-bonuses">
            {mod.accuracyBonus !== 0 && (
              <span className="mod-card-bonus">Accuracy {formatSigned(mod.accuracyBonus)}</span>
            )}
            {mod.reloadApBonus !== 0 && (
              <span className="mod-card-bonus">Reload AP {formatSigned(mod.reloadApBonus)}</span>
            )}
          </div>
        </div>
      </div>

      {mod.effect && <p className="mod-card-effect">{mod.effect}</p>}

      {editable && (
        <div className="mod-card-equip" onClick={(e) => e.stopPropagation()}>
          {equippedBlaster ? (
            <>
              <span className="mod-card-equipped-label">Equipped: {equippedBlaster.name}</span>
              <button type="button" className="mod-card-unequip" onClick={() => onUnequip?.(mod)}>
                Unequip
              </button>
            </>
          ) : (
            <span className="mod-card-drag-hint">Drag onto a blaster to equip</span>
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
