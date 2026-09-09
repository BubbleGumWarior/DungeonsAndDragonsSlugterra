import { useState } from "react";
import { XIcon } from "@phosphor-icons/react";
import ImageCropper from "./ImageCropper.jsx";
import { typeColor } from "./slugData.js";
import "./ChronicleForm.css";

const RELATIONSHIPS = ["Enemy", "Rival", "Neutral", "Friend", "Ally", "Unknown"];

function fromInitial(initial) {
  return {
    name: initial?.name || "",
    image: initial?.image || null,
    relationship: RELATIONSHIPS.includes(initial?.relationship) ? initial.relationship : "Enemy",
    dexModifier: Number.isInteger(initial?.dexModifier) ? initial.dexModifier : 0,
    conModifier: Number.isInteger(initial?.conModifier) ? initial.conModifier : 0,
    slugTemplateIds: Array.isArray(initial?.slugTemplateIds) ? [...initial.slugTemplateIds] : [],
    blasterTemplateIds: Array.isArray(initial?.blasterTemplateIds) ? [...initial.blasterTemplateIds] : [],
  };
}

export default function GruntForm({ initialValues, slugTemplates, blasterTemplates, onSubmit, onCancel, submitLabel }) {
  const [fields, setFields] = useState(() => fromInitial(initialValues));
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
      await onSubmit({
        name: fields.name,
        image: fields.image,
        relationship: fields.relationship,
        dexModifier: fields.dexModifier,
        conModifier: fields.conModifier,
        slugTemplateIds: fields.slugTemplateIds,
        blasterTemplateIds: fields.blasterTemplateIds,
      });
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="chronicle-form" onSubmit={handleSubmit}>
      <div className="chronicle-form-panel">
        <p className="chronicle-form-hint">
          Each grunt sent into a fight rolls one blaster (leaning toward the lower-quality picks) and a full magazine of
          slugs (leaning toward the commoner, lower-rarity picks) from these pools. Repeated grunts auto-number.
        </p>

        <div className="chronicle-form-image">
          <ImageCropper value={fields.image} onChange={(v) => update("image", v)} />
        </div>

        <div className="chronicle-form-grid2">
          <div className="chronicle-field">
            <label htmlFor="grunt-name">Name</label>
            <div className="chronicle-field-input">
              <input
                id="grunt-name"
                type="text"
                maxLength={40}
                value={fields.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </div>
          </div>
          <div className="chronicle-field">
            <label htmlFor="grunt-rel">Relationship</label>
            <div className="chronicle-field-input">
              <select
                id="grunt-rel"
                value={fields.relationship}
                onChange={(e) => update("relationship", e.target.value)}
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="chronicle-form-grid2">
          <div className="chronicle-field">
            <label htmlFor="grunt-dex">DEX Modifier</label>
            <div className="chronicle-field-input">
              <input
                id="grunt-dex"
                type="number"
                min={-5}
                max={10}
                value={fields.dexModifier}
                onChange={(e) => update("dexModifier", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="chronicle-field">
            <label htmlFor="grunt-con">CON Modifier</label>
            <div className="chronicle-field-input">
              <input
                id="grunt-con"
                type="number"
                min={-5}
                max={10}
                value={fields.conModifier}
                onChange={(e) => update("conModifier", Number(e.target.value))}
              />
            </div>
          </div>
        </div>
        <p className="chronicle-form-hint">Max Grit and Max AP are derived from these modifiers, the same as an NPC's.</p>

        <div className="npc-form-picker">
          <label>Slug pool <span className="npc-form-picker-note">click to add / remove</span></label>
          <div className="npc-form-picker-list">
            {slugTemplates.length === 0 && <p className="npc-form-picker-empty">No slug templates yet.</p>}
            {slugTemplates.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`npc-form-picker-item npc-form-picker-item--slug ${fields.slugTemplateIds.includes(t.id) ? "npc-form-picker-item--picked" : ""}`}
                style={{ "--type-color": typeColor(t.type) }}
                onClick={() => toggleId("slugTemplateIds", t.id)}
              >
                {t.protoformImage ? <img src={t.protoformImage} alt="" /> : <span className="npc-form-picker-placeholder" />}
                <span className="npc-form-picker-item-label">
                  {t.name}
                  {Number.isInteger(t.rarity) ? ` · R${t.rarity}` : ""}
                </span>
                {fields.slugTemplateIds.includes(t.id) && (
                  <span className="npc-form-picker-item-x" aria-hidden="true">
                    <XIcon weight="bold" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="npc-form-picker">
          <label>Blaster pool</label>
          <div className="npc-form-picker-list">
            {blasterTemplates.length === 0 && <p className="npc-form-picker-empty">No blaster templates yet.</p>}
            {blasterTemplates.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`npc-form-picker-item npc-form-picker-item--blaster ${fields.blasterTemplateIds.includes(t.id) ? "npc-form-picker-item--picked" : ""}`}
                onClick={() => toggleId("blasterTemplateIds", t.id)}
              >
                {t.image ? <img src={t.image} alt="" /> : <span className="npc-form-picker-placeholder" />}
                <span>
                  {t.name}
                  {Number.isInteger(t.quality) ? ` · Q${t.quality}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="chronicle-form-error">{error}</div>}

      <div className="chronicle-form-actions">
        {onCancel && (
          <button type="button" className="chronicle-form-cancel" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="chronicle-form-submit" disabled={!fields.name.trim() || submitting}>
          {submitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
