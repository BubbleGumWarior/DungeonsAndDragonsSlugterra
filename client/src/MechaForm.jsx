import { useState } from "react";
import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import ImageCropper from "./ImageCropper.jsx";
import {
  FRAME_TYPES,
  FRAME_TYPE_KEYS,
  TIER_LABELS,
  STAT_MIN,
  STAT_MAX,
  PASSENGER_MIN,
  PASSENGER_MAX,
  MOD_SLOTS_MIN,
  MOD_SLOTS_MAX,
  defaultMechaFields,
} from "./mechaData.js";
import "./SlugForm.css";

function Stepper({ label, value, min, max, onChange, formatValue }) {
  return (
    <div className="slug-form-stepper">
      <label>{label}</label>
      <div className="slug-form-stepper-control">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
          <MinusIcon weight="bold" />
        </button>
        <span>{formatValue ? formatValue(value) : value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
          <PlusIcon weight="bold" />
        </button>
      </div>
    </div>
  );
}

export default function MechaForm({ mode, initialValues, players, onSubmit, onCancel, submitLabel }) {
  const [fields, setFields] = useState(() => ({ ...defaultMechaFields(), ...initialValues }));
  const [selectedPlayerId, setSelectedPlayerId] = useState(players?.[0]?.id ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function update(key, value) {
    setFields((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "frameType" && mode !== "instance") {
        const base = FRAME_TYPES[value];
        return {
          ...next,
          speed: base.speed,
          handling: base.handling,
          armor: base.armor,
          rammingPower: base.rammingPower,
          passengerCapacity: base.passengerCapacity,
          modSlots: base.modSlots,
        };
      }
      return next;
    });
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
      <div className="slug-form-image-field" style={{ margin: "0 auto" }}>
        <label>Image</label>
        <ImageCropper value={fields.image} onChange={(v) => update("image", v)} />
      </div>

      <div className="slug-form-field">
        <label htmlFor="mecha-form-name">Name</label>
        <input
          id="mecha-form-name"
          type="text"
          maxLength={40}
          value={fields.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </div>

      <div className="slug-form-field">
        <label htmlFor="mecha-form-frame-type">Frame Type</label>
        <select id="mecha-form-frame-type" value={fields.frameType} onChange={(e) => update("frameType", e.target.value)}>
          {FRAME_TYPE_KEYS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="slug-form-field">
        <label htmlFor="mecha-form-tier">Tier</label>
        <select id="mecha-form-tier" value={fields.tier} onChange={(e) => update("tier", Number(e.target.value))}>
          {TIER_LABELS.map((t) => (
            <option key={t.tier} value={t.tier}>
              {t.label} (+{t.statBonus} all stats, {t.breakdownChance}% Breakdown)
            </option>
          ))}
        </select>
      </div>

      <div className="slug-form-steppers">
        <Stepper label="Speed" value={fields.speed} min={STAT_MIN} max={STAT_MAX} onChange={(v) => update("speed", v)} />
        <Stepper label="Handling" value={fields.handling} min={STAT_MIN} max={STAT_MAX} onChange={(v) => update("handling", v)} />
        <Stepper label="Armor" value={fields.armor} min={STAT_MIN} max={STAT_MAX} onChange={(v) => update("armor", v)} />
        <Stepper label="Ramming Power" value={fields.rammingPower} min={STAT_MIN} max={STAT_MAX} onChange={(v) => update("rammingPower", v)} />
        <Stepper
          label="Passenger Capacity"
          value={fields.passengerCapacity}
          min={PASSENGER_MIN}
          max={PASSENGER_MAX}
          onChange={(v) => update("passengerCapacity", v)}
        />
        <Stepper label="Mod Slots" value={fields.modSlots} min={MOD_SLOTS_MIN} max={MOD_SLOTS_MAX} onChange={(v) => update("modSlots", v)} />
      </div>

      {error && <div className="slug-form-error">{error}</div>}

      <div className="slug-form-actions">
        {mode === "assign" && (
          <div className="slug-form-assign-field">
            <label htmlFor="mecha-form-player">Assign To</label>
            <select
              id="mecha-form-player"
              value={selectedPlayerId ?? ""}
              onChange={(e) => setSelectedPlayerId(Number(e.target.value))}
            >
              {(players || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.username}
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
    </form>
  );
}
