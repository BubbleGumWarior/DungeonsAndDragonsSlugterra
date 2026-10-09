import { useState } from "react";
import { MinusIcon, PlusIcon, WrenchIcon } from "@phosphor-icons/react";
import { STAT_MIN, STAT_MAX, SPEED_BONUS_MIN, SPEED_BONUS_MAX, QUALITY_TIERS, defaultModFields } from "./itemData.js";
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

export default function ModForm({ mode, initialValues, players, onSubmit, onCancel, submitLabel }) {
  const [fields, setFields] = useState(() => ({ ...defaultModFields(), ...initialValues }));
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
        <WrenchIcon weight="duotone" />
      </div>

      <div className="slug-form-field">
        <label htmlFor="mod-form-name">Name</label>
        <input
          id="mod-form-name"
          type="text"
          maxLength={40}
          value={fields.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </div>

      <div className="slug-form-field">
        <label htmlFor="mod-form-quality">Quality</label>
        <select id="mod-form-quality" value={fields.quality} onChange={(e) => update("quality", Number(e.target.value))}>
          {QUALITY_TIERS.map((q) => (
            <option key={q.tier} value={q.tier}>
              {q.label}
            </option>
          ))}
        </select>
      </div>

      <div className="slug-form-steppers">
        <Stepper label="Accuracy Bonus" value={fields.accuracyBonus} min={STAT_MIN} max={STAT_MAX} onChange={(v) => update("accuracyBonus", v)} />
        <Stepper label="Reload AP Bonus" value={fields.reloadApBonus} min={STAT_MIN} max={STAT_MAX} onChange={(v) => update("reloadApBonus", v)} />
        <Stepper
          label="Speed Bonus"
          value={fields.speedBonus}
          min={SPEED_BONUS_MIN}
          max={SPEED_BONUS_MAX}
          step={4}
          onChange={(v) => update("speedBonus", v)}
        />
      </div>

      <div className="slug-form-field">
        <label htmlFor="mod-form-effect">Effect</label>
        <textarea
          id="mod-form-effect"
          maxLength={500}
          value={fields.effect}
          onChange={(e) => update("effect", e.target.value)}
          placeholder="What this mod does when equipped."
        />
      </div>

      <label className="mod-form-check">
        <input
          type="checkbox"
          checked={Boolean(fields.grantsDualShot)}
          onChange={(e) => update("grantsDualShot", e.target.checked)}
        />
        <span>
          <strong>Allows Dual Shot</strong> -- the blaster this is equipped on can fire two fully bonded slugs as one fused bolt.
        </span>
      </label>

      <label className="mod-form-check">
        <input
          type="checkbox"
          checked={Boolean(fields.grantsRangeFinder)}
          onChange={(e) => update("grantsRangeFinder", e.target.checked)}
        />
        <span>
          <strong>Range Finder</strong> -- shows the range ring on the map while aiming with the blaster this is equipped on.
        </span>
      </label>

      {error && <div className="slug-form-error">{error}</div>}

      <div className="slug-form-actions">
        {mode === "assign" && (
          <div className="slug-form-assign-field">
            <label htmlFor="mod-form-player">Assign To</label>
            <select
              id="mod-form-player"
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
