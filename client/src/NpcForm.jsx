import { useState } from "react";
import ImageCropper from "./ImageCropper.jsx";
import { typeColor } from "./slugData.js";
import "./SlugForm.css";
import "./NpcForm.css";

function defaultFields() {
  return {
    name: "",
    image: null,
    maxGrit: 20,
    maxAp: 2,
    dexModifier: 0,
    conModifier: 0,
    slugTemplateIds: [],
    blasterTemplateIds: [],
    mechaTemplateId: null,
    revealed: false,
  };
}

export default function NpcForm({ initialValues, slugTemplates, blasterTemplates, mechaTemplates, onSubmit, onCancel, submitLabel }) {
  const [fields, setFields] = useState(() => ({ ...defaultFields(), ...initialValues }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function update(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function toggleId(key, id) {
    setFields((prev) => {
      const list = prev[key];
      const next = list.includes(id) ? list.filter((v) => v !== id) : [...list, id];
      return { ...prev, [key]: next };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(fields);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="slug-form npc-form" onSubmit={handleSubmit}>
      <div className="slug-form-image-field npc-form-image">
        <label>Portrait</label>
        <ImageCropper value={fields.image} onChange={(v) => update("image", v)} />
      </div>

      <div className="slug-form-field">
        <label htmlFor="npc-form-name">Name</label>
        <input id="npc-form-name" type="text" maxLength={40} value={fields.name} onChange={(e) => update("name", e.target.value)} />
      </div>

      <div className="slug-form-steppers npc-form-stats">
        <div className="panel-field">
          <label>Max Grit</label>
          <input type="number" min={1} max={500} value={fields.maxGrit} onChange={(e) => update("maxGrit", Number(e.target.value))} />
        </div>
        <div className="panel-field">
          <label>Max AP</label>
          <input type="number" min={1} max={10} value={fields.maxAp} onChange={(e) => update("maxAp", Number(e.target.value))} />
        </div>
        <div className="panel-field">
          <label>DEX Modifier</label>
          <input type="number" min={-5} max={10} value={fields.dexModifier} onChange={(e) => update("dexModifier", Number(e.target.value))} />
        </div>
        <div className="panel-field">
          <label>CON Modifier</label>
          <input type="number" min={-5} max={10} value={fields.conModifier} onChange={(e) => update("conModifier", Number(e.target.value))} />
        </div>
      </div>

      <div className="npc-form-picker">
        <label>Slugs</label>
        <div className="npc-form-picker-list">
          {slugTemplates.length === 0 && <p className="npc-form-picker-empty">No slug templates yet.</p>}
          {slugTemplates.map((t) => (
            <button
              type="button"
              key={t.id}
              className={`npc-form-picker-item ${fields.slugTemplateIds.includes(t.id) ? "npc-form-picker-item--picked" : ""}`}
              style={{ "--type-color": typeColor(t.type) }}
              onClick={() => toggleId("slugTemplateIds", t.id)}
            >
              {t.protoformImage ? <img src={t.protoformImage} alt="" /> : <span className="npc-form-picker-placeholder" />}
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="npc-form-picker">
        <label>Blasters</label>
        <div className="npc-form-picker-list">
          {blasterTemplates.length === 0 && <p className="npc-form-picker-empty">No blaster templates yet.</p>}
          {blasterTemplates.map((t) => (
            <button
              type="button"
              key={t.id}
              className={`npc-form-picker-item ${fields.blasterTemplateIds.includes(t.id) ? "npc-form-picker-item--picked" : ""}`}
              onClick={() => toggleId("blasterTemplateIds", t.id)}
            >
              {t.image ? <img src={t.image} alt="" /> : <span className="npc-form-picker-placeholder" />}
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="slug-form-checkboxes">
        <label className="slug-form-checkbox">
          <input type="checkbox" checked={fields.revealed} onChange={(e) => update("revealed", e.target.checked)} />
          Revealed to players (their stats show in combat instead of just name/photo)
        </label>
      </div>

      <div className="slug-form-field">
        <label htmlFor="npc-form-mecha">Mecha</label>
        <select
          id="npc-form-mecha"
          value={fields.mechaTemplateId ?? ""}
          onChange={(e) => update("mechaTemplateId", e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">None</option>
          {mechaTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="slug-form-error">{error}</div>}

      <div className="slug-form-actions">
        <div className="slug-form-actions-buttons">
          {onCancel && (
            <button type="button" className="slug-form-cancel" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="slug-form-submit" disabled={!fields.name.trim() || submitting}>
            {submitting ? "Saving..." : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
