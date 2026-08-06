import { useState } from "react";
import { PawPrintIcon, PlusIcon, DropIcon, WindIcon, MotorcycleIcon, ShovelIcon, EngineIcon } from "@phosphor-icons/react";
import { tierInfo, effectiveStats, unlockedModes } from "./mechaData.js";
import "./MechaCard.css";

const MODE_ICONS = {
  aquatic: DropIcon,
  glider: WindIcon,
  bike: MotorcycleIcon,
  burrow: ShovelIcon,
};

const MODE_LABELS = {
  aquatic: "Aquatic",
  glider: "Glider",
  bike: "Bike",
  burrow: "Burrow",
};

export default function MechaCard({
  mecha,
  equippedMods = [],
  size = "sm",
  onClick,
  actions,
  onUnequipMod,
  editableSlots = false,
  onDropMod,
}) {
  const [modDragOver, setModDragOver] = useState(false);
  const tier = tierInfo(mecha.tier);
  const stats = effectiveStats(mecha, equippedMods);
  const modes = unlockedModes(mecha, equippedMods);
  const openSlots = Math.max(0, mecha.modSlots - equippedMods.length);
  const acceptsModDrop = editableSlots && Boolean(onDropMod) && openSlots > 0;

  return (
    <div className={`mecha-card mecha-card--${size} ${onClick ? "mecha-card--clickable" : ""}`} onClick={onClick}>
      <div className="mecha-card-top">
        <div className="mecha-card-image">
          {mecha.image ? <img src={mecha.image} alt={mecha.name} /> : <PawPrintIcon weight="duotone" />}
        </div>
        <div className="mecha-card-identity">
          <h3 className="mecha-card-name">{mecha.name}</h3>
          <div className="mecha-card-badges">
            <span className="mecha-card-frame">{mecha.frameType}</span>
            <span className={`mecha-card-tier mecha-card-tier--${mecha.tier}`}>{tier.label}</span>
          </div>
        </div>
      </div>

      <div className="mecha-card-stats">
        <div className="mecha-card-stat">
          <span className="mecha-card-stat-value">{stats.speed}</span>
          <span className="mecha-card-stat-label">Speed</span>
        </div>
        <div className="mecha-card-stat">
          <span className="mecha-card-stat-value">{stats.handling}</span>
          <span className="mecha-card-stat-label">Handling</span>
        </div>
        <div className="mecha-card-stat">
          <span className="mecha-card-stat-value">{stats.armor}</span>
          <span className="mecha-card-stat-label">Armor</span>
        </div>
        <div className="mecha-card-stat">
          <span className="mecha-card-stat-value">{stats.rammingPower}</span>
          <span className="mecha-card-stat-label">Ramming</span>
        </div>
        <div className="mecha-card-stat">
          <span className="mecha-card-stat-value">{mecha.passengerCapacity}</span>
          <span className="mecha-card-stat-label">Passengers</span>
        </div>
      </div>

      <div className="mecha-card-breakdown">
        Breakdown Chance <strong>{tier.breakdownChance}%</strong>
      </div>

      {modes.size > 0 && (
        <div className="mecha-card-modes">
          {[...modes].map((mode) => {
            const Icon = MODE_ICONS[mode];
            return (
              <span className="mecha-card-mode" key={mode} title={MODE_LABELS[mode]}>
                {Icon && <Icon weight="bold" />}
                {MODE_LABELS[mode]}
              </span>
            );
          })}
        </div>
      )}

      <div className="mecha-card-slots">
        <span className="mecha-card-slots-label">
          Mod Slots ({equippedMods.length}/{mecha.modSlots})
        </span>
        <div
          className={`mecha-card-slots-row ${acceptsModDrop && modDragOver ? "mecha-card-slots-row--dragover" : ""}`}
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
              className="mecha-card-slot mecha-card-slot--filled"
              key={mod.id}
              onClick={editableSlots ? (e) => { e.stopPropagation(); onUnequipMod?.(mod); } : undefined}
              title={editableSlots ? `Unequip ${mod.name}` : mod.name}
            >
              <EngineIcon weight="bold" />
              <span>{mod.name}</span>
            </div>
          ))}
          {Array.from({ length: openSlots }, (_, i) => (
            <div className="mecha-card-slot mecha-card-slot--empty" key={`empty-${i}`}>
              <PlusIcon weight="bold" />
            </div>
          ))}
        </div>
      </div>

      {actions && (
        <div className="mecha-card-actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
}
