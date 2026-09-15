import { useState } from "react";
import { PlusIcon, TargetIcon, WrenchIcon } from "@phosphor-icons/react";
import {
  BASE_TYPE_EFFECT_NOTES,
  effectiveAccuracy,
  effectiveReloadApCost,
  formatSigned,
  qualityColor,
  qualityInfo,
} from "./itemData.js";
import "./BlasterCard.css";

const EQUIP_SLOT_LABELS = ["Primary", "Secondary"];

export default function BlasterCard({
  blaster,
  equippedMods = [],
  size = "sm",
  onClick,
  actions,
  onUnequipMod,
  editableSlots = false,
  draggableEquip = false,
  onDragStart,
  onDragEnd,
  onDropMod,
}) {
  const [modDragOver, setModDragOver] = useState(false);
  const [replaceDragOverModId, setReplaceDragOverModId] = useState(null);
  const quality = qualityInfo(blaster.quality);
  const accuracy = effectiveAccuracy(blaster, equippedMods);
  const reloadApCost = effectiveReloadApCost(blaster, equippedMods);
  const openSlots = Math.max(0, blaster.modSlots - equippedMods.length);
  const equipSlotLabel = blaster.equipSlot != null ? EQUIP_SLOT_LABELS[blaster.equipSlot] : null;
  const canDropMods = editableSlots && Boolean(onDropMod);
  const acceptsModDrop = canDropMods && openSlots > 0;

  // Dropping a mod onto a filled slot swaps it out -- no need to unequip first.
  function handleReplaceDrop(occupantModId, e) {
    e.preventDefault();
    e.stopPropagation();
    setReplaceDragOverModId(null);
    setModDragOver(false);
    const modId = Number(e.dataTransfer.getData("text/plain"));
    if (Number.isInteger(modId) && modId !== occupantModId) onDropMod?.(modId, occupantModId);
  }
  const effectNote = BASE_TYPE_EFFECT_NOTES[blaster.baseType];

  return (
    <div
      className={`blaster-card blaster-card--${size} ${onClick ? "blaster-card--clickable" : ""} ${draggableEquip ? "blaster-card--draggable" : ""}`}
      style={{ "--quality-color": qualityColor(blaster.quality) }}
      onClick={onClick}
      draggable={draggableEquip}
      onDragStart={draggableEquip ? (e) => { e.dataTransfer.setData("text/plain", String(blaster.id)); e.dataTransfer.effectAllowed = "move"; onDragStart?.(blaster); } : undefined}
      onDragEnd={draggableEquip ? () => onDragEnd?.() : undefined}
    >
      <div className="blaster-card-top">
        <div className="blaster-card-image">
          {blaster.image ? <img src={blaster.image} alt={blaster.name} /> : <TargetIcon weight="duotone" />}
        </div>
        <div className="blaster-card-identity">
          <h3 className="blaster-card-name">{blaster.name}</h3>
          <div className="blaster-card-badges">
            <span className="blaster-card-type">{blaster.baseType}</span>
            <span className={`blaster-card-quality blaster-card-quality--${blaster.quality}`}>{quality.label}</span>
            {equipSlotLabel && (
              <span className={`blaster-card-equipped-badge blaster-card-equipped-badge--${blaster.equipSlot}`}>
                {equipSlotLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="blaster-card-stats">
        <div className="blaster-card-stat">
          <span className="blaster-card-stat-value">{formatSigned(accuracy)}</span>
          <span className="blaster-card-stat-label">Accuracy</span>
        </div>
        <div className="blaster-card-stat">
          <span className="blaster-card-stat-value">{reloadApCost}</span>
          <span className="blaster-card-stat-label">Reload AP</span>
        </div>
        <div className="blaster-card-stat">
          <span className="blaster-card-stat-value">{blaster.range}</span>
          <span className="blaster-card-stat-label">Range</span>
        </div>
        <div className="blaster-card-stat">
          <span className="blaster-card-stat-value">{blaster.magazineSize}</span>
          <span className="blaster-card-stat-label">Magazine</span>
        </div>
      </div>

      <div className="blaster-card-fail-rate">
        Fail Rate <strong>{quality.failRate}%</strong>
      </div>

      {effectNote && (
        <div className="blaster-card-effect">
          <span className="blaster-card-effect-label">{blaster.baseType} effect</span>
          <span className="blaster-card-effect-text">{effectNote}</span>
        </div>
      )}

      <div className="blaster-card-slots">
        <span className="blaster-card-slots-label">
          Mod Slots ({equippedMods.length}/{blaster.modSlots})
        </span>
        <div
          className={`blaster-card-slots-row ${acceptsModDrop && modDragOver ? "blaster-card-slots-row--dragover" : ""}`}
          onDragOver={
            acceptsModDrop
              ? (e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setModDragOver(true);
                }
              : undefined
          }
          onDragLeave={acceptsModDrop ? () => setModDragOver(false) : undefined}
          onDrop={
            acceptsModDrop
              ? (e) => {
                  e.preventDefault();
                  setModDragOver(false);
                  const modId = Number(e.dataTransfer.getData("text/plain"));
                  if (Number.isInteger(modId)) onDropMod?.(modId);
                }
              : undefined
          }
        >
          {equippedMods.map((mod) => (
            <div
              className={`blaster-card-slot blaster-card-slot--filled ${replaceDragOverModId === mod.id ? "blaster-card-slot--dragover" : ""}`}
              key={mod.id}
              onClick={editableSlots ? (e) => { e.stopPropagation(); onUnequipMod?.(mod); } : undefined}
              onDragOver={
                canDropMods
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = "move";
                      setReplaceDragOverModId(mod.id);
                      setModDragOver(false);
                    }
                  : undefined
              }
              onDragLeave={canDropMods ? () => setReplaceDragOverModId((prev) => (prev === mod.id ? null : prev)) : undefined}
              onDrop={canDropMods ? (e) => handleReplaceDrop(mod.id, e) : undefined}
              title={editableSlots ? `Unequip ${mod.name}` : mod.name}
            >
              <WrenchIcon weight="bold" />
              <span>{mod.name}</span>
            </div>
          ))}
          {Array.from({ length: openSlots }, (_, i) => (
            <div className="blaster-card-slot blaster-card-slot--empty" key={`empty-${i}`}>
              <PlusIcon weight="bold" />
            </div>
          ))}
        </div>
      </div>

      {actions && (
        <div className="blaster-card-actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
}
