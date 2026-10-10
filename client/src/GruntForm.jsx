import { useEffect, useRef, useState } from "react";
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
  const [tab, setTab] = useState("grunt");
  const nameRef = useRef(null);
  const errorRef = useRef(null);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [error]);

  const sortedSlugTemplates = [...slugTemplates].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  const pooledSlugs = sortedSlugTemplates.filter((t) => fields.slugTemplateIds.includes(t.id));

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
    setError("");
    if (!fields.name.trim()) {
      setTab("grunt");
      setError("Give the grunt a name before saving.");
      setTimeout(() => nameRef.current?.focus(), 0);
      return;
    }
    setSubmitting(true);
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
      <div className="chronicle-form-bar">
        <div className="chronicle-form-bar-row">
        <div className="chronicle-form-tabs" role="tablist">
            {[
              ["grunt", "Grunt"],
              ["slugs", "Slugs"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`chronicle-form-tab ${tab === id ? "chronicle-form-tab--active" : ""}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        <div className="chronicle-form-actions">
          {onCancel && (
            <button type="button" className="chronicle-form-cancel" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="chronicle-form-submit" disabled={submitting}>
            {submitting ? "Saving..." : submitLabel}
          </button>
        </div>
        </div>
        {error && (
          <div className="chronicle-form-error" role="alert" ref={errorRef}>
            {error}
          </div>
        )}
      </div>

      {tab === "grunt" && (
      <div className="chronicle-form-panel">
        <div className="chronicle-form-image">
          <ImageCropper value={fields.image} onChange={(v) => update("image", v)} />
        </div>

        <div className="chronicle-form-grid2">
          <div className="chronicle-field">
            <label htmlFor="grunt-name">Name</label>
            <div className="chronicle-field-input">
              <input
                id="grunt-name"
                ref={nameRef}
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
      )}

      {tab === "slugs" && (
        <div className="chronicle-form-panel slugpick">
          <section className="slugpick-meter" aria-label="Slug pool">
            <div className="slugpick-meter-head">
              <h3>Slug pool</h3>
              <p className="slugpick-meter-count" aria-live="polite">
                <strong>{pooledSlugs.length}</strong>
                <span> in pool</span>
              </p>
            </div>
            <p className="slugpick-meter-note">
              Each grunt sent into a fight fills its whole magazine by rolling from this pool, leaning toward the
              commoner, lower-rarity picks. A slug can come up more than once, so the pool needs no magazine limit.
            </p>
          </section>

          <section className="slugpick-section">
            <h3>
              Slug library <span>click to add or remove</span>
            </h3>
            {slugTemplates.length === 0 && <p className="slugpick-empty">No slug templates yet.</p>}
            <div className="slugpick-grid">
              {sortedSlugTemplates.map((t) => {
                const picked = fields.slugTemplateIds.includes(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    className={`slugpick-tile ${picked ? "slugpick-tile--picked" : ""}`}
                    style={{ "--type-color": typeColor(t.type) }}
                    aria-pressed={picked}
                    onClick={() => toggleId("slugTemplateIds", t.id)}
                  >
                    {t.protoformImage ? <img src={t.protoformImage} alt="" /> : <span className="slugpick-thumb" />}
                    <span className="slugpick-tile-name">{t.name}</span>
                    {Number.isInteger(t.rarity) && <span className="slugpick-tile-count">R{t.rarity}</span>}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="slugpick-section">
            <h3>In the pool</h3>
            {pooledSlugs.length === 0 ? (
              <p className="slugpick-empty">Nothing picked yet. Choose slugs below.</p>
            ) : (
              <ul className="slugpick-loadout">
                {pooledSlugs.map((t) => (
                  <li key={t.id} className="slugpick-row" style={{ "--type-color": typeColor(t.type) }}>
                    {t.protoformImage ? <img src={t.protoformImage} alt="" /> : <span className="slugpick-thumb" />}
                    <span className="slugpick-row-name">
                      {t.name}
                      <small>
                        {t.type}
                        {Number.isInteger(t.rarity) ? ` · Rarity ${t.rarity}` : ""}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="slugpick-row-remove"
                      onClick={() => toggleId("slugTemplateIds", t.id)}
                      aria-label={`Remove ${t.name} from the pool`}
                    >
                      <XIcon weight="bold" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </form>
  );
}
