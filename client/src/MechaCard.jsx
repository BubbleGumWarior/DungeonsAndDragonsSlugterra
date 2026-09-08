import { useState } from "react";
import {
  ArrowLeftIcon,
  ArrowsClockwiseIcon,
  PawPrintIcon,
  PlusIcon,
  DropIcon,
  WindIcon,
  MotorcycleIcon,
  ShovelIcon,
  EngineIcon,
  XIcon,
} from "@phosphor-icons/react";
import { tierInfo, tierColor, effectiveStats, unlockedModes, TERRAIN_MODES } from "./mechaData.js";
import "./MechaCard.css";

const TERRAIN_ICONS = {
  glide: WindIcon,
  aquatic: DropIcon,
  burrow: ShovelIcon,
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
  const [flipped, setFlipped] = useState(false);
  const [modDragOver, setModDragOver] = useState(false);
  const tier = tierInfo(mecha.tier);
  const stats = effectiveStats(mecha, equippedMods);
  const modModes = unlockedModes(equippedMods);
  const bikeActive = modModes.has("bike");
  const openSlots = Math.max(0, mecha.modSlots - equippedMods.length);
  const acceptsModDrop = editableSlots && Boolean(onDropMod) && openSlots > 0;

  return (
    <div
      className={`mecha-card mecha-card--${size} ${onClick ? "mecha-card--clickable" : ""} ${flipped ? "mecha-card--flipped" : ""}`}
      style={{ "--tier-color": tierColor(mecha.tier) }}
    >
      <div className="mecha-card-inner">
        <div className="mecha-card-face mecha-card-face--front" onClick={onClick}>
          <div className="mecha-card-top">
            <div className="mecha-card-image">
              {mecha.image ? <img src={mecha.image} alt={mecha.name} /> : <PawPrintIcon weight="duotone" />}
            </div>
            <div className="mecha-card-identity">
              <h3 className="mecha-card-name">
                <span className="mecha-card-name-tier">{tier.label}</span> {mecha.name}
              </h3>
              <div className="mecha-card-badges">
                <span className="mecha-card-frame">{mecha.frameType}</span>
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
            <div className="mecha-card-stat mecha-card-stat--wide">
              <span className="mecha-card-stat-value">{mecha.passengerCapacity}</span>
              <span className="mecha-card-stat-label">Passengers</span>
            </div>
          </div>

          <div className="mecha-card-breakdown">
            Breakdown Chance <strong>{tier.breakdownChance}%</strong>
          </div>

          <div className="mecha-card-modes">
            {TERRAIN_MODES.map(({ key, label, flag }) => {
              const Icon = TERRAIN_ICONS[key];
              const on = Boolean(mecha[flag]);
              return (
                <span
                  className={`mecha-card-mode ${on ? "mecha-card-mode--on" : "mecha-card-mode--off"}`}
                  key={key}
                  title={on ? `${label}: enabled by an equipped mod` : `${label}: needs a mod that unlocks it`}
                >
                  {Icon && <Icon weight="bold" />}
                  {label}
                </span>
              );
            })}
            {bikeActive && (
              <span className="mecha-card-mode mecha-card-mode--on" title="Bike form: enabled by an equipped mod">
                <MotorcycleIcon weight="bold" />
                Bike
              </span>
            )}
          </div>

          <button
            type="button"
            className="mecha-card-flip"
            onClick={(e) => {
              e.stopPropagation();
              setFlipped(true);
            }}
            // Dragging a mod onto this strip turns the card over to the slots.
            onDragEnter={editableSlots ? () => setFlipped(true) : undefined}
            onDragOver={editableSlots ? (e) => e.preventDefault() : undefined}
          >
            <ArrowsClockwiseIcon weight="bold" />
            Mod Slots ({equippedMods.length}/{mecha.modSlots})
          </button>

          {actions && (
            <div className="mecha-card-actions" onClick={(e) => e.stopPropagation()}>
              {actions}
            </div>
          )}
        </div>

        <div className="mecha-card-face mecha-card-face--back">
          <button
            type="button"
            className="mecha-card-flip mecha-card-flip--back"
            onClick={(e) => {
              e.stopPropagation();
              setFlipped(false);
            }}
          >
            <ArrowLeftIcon weight="bold" />
            {mecha.name}
          </button>

          <div className={`mecha-card-slots ${editableSlots ? "mecha-card-slots--editable" : ""}`}>
            <span className="mecha-card-slots-label">
              Mod Slots &middot; {equippedMods.length}/{mecha.modSlots}
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
                  title={editableSlots ? `Remove ${mod.name}` : mod.name}
                >
                  <EngineIcon weight="bold" />
                  <span className="mecha-card-slot-name">{mod.name}</span>
                  {editableSlots && <XIcon weight="bold" className="mecha-card-slot-remove" />}
                </div>
              ))}
              {Array.from({ length: openSlots }, (_, i) => (
                <div className="mecha-card-slot mecha-card-slot--empty" key={`empty-${i}`}>
                  <PlusIcon weight="bold" />
                  <span>Empty slot</span>
                </div>
              ))}
            </div>
            {equippedMods.length === 0 && openSlots === 0 && (
              <p className="mecha-card-slots-empty">This frame has no mod slots.</p>
            )}
            {editableSlots && openSlots > 0 && (
              <p className="mecha-card-slots-hint">Drag a mod from below onto an empty slot.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
