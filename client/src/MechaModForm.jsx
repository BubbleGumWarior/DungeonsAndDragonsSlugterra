import { useState } from "react";
import { MinusIcon, PlusIcon, EngineIcon } from "@phosphor-icons/react";
import { MOD_BONUS_MIN, MOD_BONUS_MAX, MODES, defaultMechaModFields } from "./mechaData.js";
import "./SlugForm.css";

function Stepper({ label, value, min, max, onChange }) {
  return (
    <div className="slug-form-stepper">
      <label>{label}</label>
      <div className="slug-form-stepper-control">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
          <MinusIcon weight="bold" />
        </button>
        <span>{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
          <PlusIcon weight="bold" />
        </button>
      </div>
    </div>
  );
}

export default function MechaModForm({ mode, initialValues, players, onSubmit, onCancel, submitLabel }) {
  const [fields, setFields] = useState(() => ({ ...defaultMechaModFields(), ...initialValues }));
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
      <div className="mod-form-icon-preview">
        <EngineIcon weight="duotone" />
      </div>

      <div className="slug-form-field">
        <label htmlFor="mecha-mod-form-name">Name</label>
        <input
          id="mecha-mod-form-name"
          type="text"
          maxLength={40}
          value={fields.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </div>

      <div className="slug-form-steppers">
        <Stepper label="Speed Bonus" value={fields.speedBonus} min={MOD_BONUS_MIN} max={MOD_BONUS_MAX} onChange={(v) => update("speedBonus", v)} />
        <Stepper label="Handling Bonus" value={fields.handlingBonus} min={MOD_BONUS_MIN} max={MOD_BONUS_MAX} onChange={(v) => update("handlingBonus", v)} />
        <Stepper label="Armor Bonus" value={fields.armorBonus} min={MOD_BONUS_MIN} max={MOD_BONUS_MAX} onChange={(v) => update("armorBonus", v)} />
        <Stepper label="Ramming Bonus" value={fields.rammingBonus} min={MOD_BONUS_MIN} max={MOD_BONUS_MAX} onChange={(v) => update("rammingBonus", v)} />
      </div>

      <div className="slug-form-field">
        <label htmlFor="mecha-mod-form-unlocks-mode">Unlocks Mode</label>
        <select
          id="mecha-mod-form-unlocks-mode"
          value={fields.unlocksMode ?? ""}
          onChange={(e) => update("unlocksMode", e.target.value || null)}
        >
          <option value="">None</option>
          {MODES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="slug-form-field">
        <label htmlFor="mecha-mod-form-effect">Effect</label>
        <textarea
          id="mecha-mod-form-effect"
          maxLength={500}
          value={fields.effect}
          onChange={(e) => update("effect", e.target.value)}
          placeholder="What this upgrade does when installed."
        />
      </div>

      {error && <div className="slug-form-error">{error}</div>}

      <div className="slug-form-actions">
        {mode === "assign" && (
          <div className="slug-form-assign-field">
            <label htmlFor="mecha-mod-form-player">Assign To</label>
            <select
              id="mecha-mod-form-player"
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
