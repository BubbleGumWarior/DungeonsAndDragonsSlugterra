import { useState } from "react";
import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import {
  ARMOR_MAX_GRIT,
  BELT_MAX_EXTRA_SLOTS,
  EQUIPMENT_KINDS,
  EQUIPMENT_KIND_KEYS,
  MELEE_MAX_AP_COST,
  MELEE_MAX_DAMAGE,
  MELEE_MAX_REACH,
  MELEE_TYPES,
  MELEE_TYPE_KEYS,
  SHIELD_MAX_ABSORB,
  STAT_MAX,
  STAT_MIN,
  defaultEquipmentFields,
} from "./itemData.js";
import "./SlugForm.css";

function Stepper({ label, value, min, max, step = 1, onChange }) {
  return (
    <div className="slug-form-stepper">
      <label>{label}</label>
      <div className="slug-form-stepper-control">
        <button type="button" onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min}>
          <MinusIcon weight="bold" />
        </button>
        <span>{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max}>
          <PlusIcon weight="bold" />
        </button>
      </div>
    </div>
  );
}

// The DM's form for a melee weapon or ammo belt: "template" (the catalog the
// Market sells from), "assign" (give one to a player) or "instance" (edit one).
export default function EquipmentForm({ mode, initialValues, players, onSubmit, onCancel, submitLabel }) {
  const [fields, setFields] = useState(() => ({ ...defaultEquipmentFields(), ...initialValues }));
  const [selectedPlayerId, setSelectedPlayerId] = useState(players?.[0]?.id ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function update(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload = { ...fields };
      if (mode === "assign") {
        payload.userId = selectedPlayerId;
        payload.templateId = initialValues?.templateId ?? null;
      }
      await onSubmit(payload);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = fields.name.trim().length > 0 && (mode !== "assign" || selectedPlayerId);

  return (
    <form className="slug-form" onSubmit={handleSubmit}>
      <div className="slug-form-bar">
        {error && <div className="slug-form-error">{error}</div>}

        <div className="slug-form-actions">
          {mode === "assign" && (
            <div className="slug-form-assign-field">
              <label htmlFor="equipment-form-player">Assign To</label>
              <select
                id="equipment-form-player"
                value={selectedPlayerId ?? ""}
                onChange={(e) => setSelectedPlayerId(Number(e.target.value))}
              >
                {(players || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.characterName || p.username}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="slug-form-actions-buttons">
            {onCancel && (
              <button type="button" className="slug-form-cancel" onClick={onCancel}>
                Cancel
              </button>
            )}
            <button type="submit" className="slug-form-submit" disabled={!canSubmit || submitting}>
              {submitting ? "Saving..." : submitLabel}
            </button>
          </div>
        </div>
      </div>

      <div className="slug-form-field">
        <label htmlFor="equipment-form-name">Name</label>
        <input
          id="equipment-form-name"
          type="text"
          maxLength={40}
          value={fields.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </div>

      <div className="slug-form-field">
        <label htmlFor="equipment-form-kind">Type</label>
        <select id="equipment-form-kind" value={fields.kind} onChange={(e) => update("kind", e.target.value)}>
          {EQUIPMENT_KIND_KEYS.map((k) => (
            <option key={k} value={k}>
              {EQUIPMENT_KINDS[k].label}
            </option>
          ))}
        </select>
        <p className="slug-form-hint">
          {fields.kind === "melee"
            ? "Swung in combat for its Damage, multiplied by the wielder's STR modifier when it is positive and added to it otherwise (min 1). Hit roll is d20 + STR modifier (+ Accuracy). Secondary slot."
            : fields.kind === "shield"
              ? "Secondary slot. Soaks this much damage per fight, then breaks -- unusable for the rest of that fight, fine again afterwards."
              : fields.kind === "armor"
                ? "Its own Armor slot, worn alongside a Secondary item. Adds flat max Grit; can be swapped between fights."
                : "Secondary slot. Gives the Primary blaster extra magazine slots -- one blaster, more slugs."}
        </p>
      </div>

      {fields.kind === "melee" && (
        <div className="slug-form-field">
          <label htmlFor="equipment-form-melee-type">Weapon Type</label>
          <select id="equipment-form-melee-type" value={fields.meleeType} onChange={(e) => update("meleeType", e.target.value)}>
            {MELEE_TYPE_KEYS.map((t) => (
              <option key={t} value={t}>
                {MELEE_TYPES[t].label} -- {MELEE_TYPES[t].note}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="slug-form-steppers">
        {fields.kind === "melee" ? (
          <>
            <Stepper label="Damage (before STR)" value={fields.damage} min={0} max={MELEE_MAX_DAMAGE} onChange={(v) => update("damage", v)} />
            <Stepper label="Accuracy" value={fields.accuracy} min={STAT_MIN} max={STAT_MAX} onChange={(v) => update("accuracy", v)} />
            <Stepper label="AP Cost" value={fields.apCost} min={1} max={MELEE_MAX_AP_COST} onChange={(v) => update("apCost", v)} />
            <Stepper label="Reach" value={fields.reach} min={10} max={MELEE_MAX_REACH} step={10} onChange={(v) => update("reach", v)} />
          </>
        ) : fields.kind === "shield" ? (
          <Stepper label="Damage Absorbed" value={fields.absorb} min={1} max={SHIELD_MAX_ABSORB} onChange={(v) => update("absorb", v)} />
        ) : fields.kind === "armor" ? (
          <Stepper label="Bonus Grit" value={fields.gritBonus} min={1} max={ARMOR_MAX_GRIT} onChange={(v) => update("gritBonus", v)} />
        ) : (
          <Stepper label="Extra Slug Slots" value={fields.extraSlots} min={1} max={BELT_MAX_EXTRA_SLOTS} onChange={(v) => update("extraSlots", v)} />
        )}
      </div>
    </form>
  );
}
