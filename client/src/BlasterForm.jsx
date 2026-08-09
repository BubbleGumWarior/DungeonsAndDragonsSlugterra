import { useState } from "react";
import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import ImageCropper from "./ImageCropper.jsx";
import {
  BASE_TYPES,
  BASE_TYPE_KEYS,
  QUALITY_TIERS,
  STAT_MIN,
  STAT_MAX,
  MOD_SLOTS_MIN,
  MOD_SLOTS_MAX,
  RANGE_MIN,
  RANGE_MAX,
  defaultBlasterFields,
} from "./itemData.js";
import "./SlugForm.css";

function Stepper({ label, value, min, max, step = 1, onChange, formatValue }) {
  return (
    <div className="slug-form-stepper">
      <label>{label}</label>
      <div className="slug-form-stepper-control">
        <button type="button" onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min}>
          <MinusIcon weight="bold" />
        </button>
        <span>{formatValue ? formatValue(value) : value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max}>
          <PlusIcon weight="bold" />
        </button>
      </div>
    </div>
  );
}

export default function BlasterForm({ mode, initialValues, players, onSubmit, onCancel, submitLabel }) {
  const [fields, setFields] = useState(() => ({ ...defaultBlasterFields(), ...initialValues }));
  const [selectedPlayerId, setSelectedPlayerId] = useState(players?.[0]?.id ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function update(key, value) {
    setFields((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "baseType" && mode !== "instance") {
        const base = BASE_TYPES[value];
        return { ...next, accuracy: base.accuracy, reloadApCost: base.reloadApCost, range: base.range, modSlots: base.modSlots, magazineSize: base.magazineSize };
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
        <label htmlFor="blaster-form-name">Name</label>
        <input
          id="blaster-form-name"
          type="text"
          maxLength={40}
          value={fields.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </div>

      <div className="slug-form-field">
        <label htmlFor="blaster-form-base-type">Base Type</label>
        <select id="blaster-form-base-type" value={fields.baseType} onChange={(e) => update("baseType", e.target.value)}>
          {BASE_TYPE_KEYS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="slug-form-field">
        <label htmlFor="blaster-form-quality">Quality</label>
        <select id="blaster-form-quality" value={fields.quality} onChange={(e) => update("quality", Number(e.target.value))}>
          {QUALITY_TIERS.map((q) => (
            <option key={q.tier} value={q.tier}>
              {q.label} (+{q.accuracyBonus} Accuracy, {q.failRate}% Fail Rate)
            </option>
          ))}
        </select>
      </div>

      <div className="slug-form-steppers">
        <Stepper label="Accuracy" value={fields.accuracy} min={STAT_MIN} max={STAT_MAX} onChange={(v) => update("accuracy", v)} />
        <Stepper label="Reload AP Cost" value={fields.reloadApCost} min={1} max={STAT_MAX} onChange={(v) => update("reloadApCost", v)} />
        <Stepper label="Range" value={fields.range} min={Math.max(1, RANGE_MIN)} max={RANGE_MAX} step={10} onChange={(v) => update("range", v)} />
        <Stepper label="Magazine Size" value={fields.magazineSize} min={1} max={STAT_MAX} onChange={(v) => update("magazineSize", v)} />
        <Stepper label="Mod Slots" value={fields.modSlots} min={MOD_SLOTS_MIN} max={MOD_SLOTS_MAX} onChange={(v) => update("modSlots", v)} />
      </div>

      {error && <div className="slug-form-error">{error}</div>}

      <div className="slug-form-actions">
        {mode === "assign" && (
          <div className="slug-form-assign-field">
            <label htmlFor="blaster-form-player">Assign To</label>
            <select
              id="blaster-form-player"
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
