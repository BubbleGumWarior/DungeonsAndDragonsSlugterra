import { useState } from "react";
import { EyeIcon, EyeSlashIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import ImageCropper from "./ImageCropper.jsx";
import { typeColor } from "./slugData.js";
import "./ChronicleForm.css";

const RELATIONSHIPS = ["Unknown", "Ally", "Friend", "Neutral", "Rival", "Enemy"];
const STATUSES = ["Alive", "Deceased", "Missing", "Unknown"];

const IDENTITY_FIELDS = [
  { key: "species", label: "Species" },
  { key: "age", label: "Age" },
  { key: "faction", label: "Faction / affiliation" },
  { key: "role", label: "Role / occupation" },
  { key: "firstMetLocation", label: "First met, where" },
  { key: "firstMetSession", label: "First met, when" },
];

function blankField(value = "") {
  return { value, shown: false };
}

function fromInitial(initial) {
  const profile = initial?.profile || {};
  const pf = profile.fields || {};
  const field = (key, dflt = "") => ({
    value: typeof pf[key]?.value === "string" ? pf[key].value : dflt,
    shown: Boolean(pf[key]?.shown),
  });
  return {
    name: initial?.name || "",
    image: initial?.image || null,
    dmNotes: initial?.dmNotes || "",
    revealed: Boolean(initial?.revealed),
    combatReady: initial?.combatReady === undefined ? true : Boolean(initial.combatReady),
    combatShown: Boolean(profile.combatShown),
    dexModifier: Number.isInteger(initial?.dexModifier) ? initial.dexModifier : 0,
    conModifier: Number.isInteger(initial?.conModifier) ? initial.conModifier : 0,
    slugTemplateIds: Array.isArray(initial?.slugTemplateIds) ? [...initial.slugTemplateIds] : [],
    blasterTemplateIds: Array.isArray(initial?.blasterTemplateIds) ? [...initial.blasterTemplateIds] : [],
    mechaTemplateId: initial?.mechaTemplateId ?? null,
    fields: {
      species: field("species"),
      age: field("age"),
      relationship: field("relationship", "Unknown"),
      status: field("status", "Alive"),
      faction: field("faction"),
      role: field("role"),
      firstMetLocation: field("firstMetLocation"),
      firstMetSession: field("firstMetSession"),
    },
    bio: Array.isArray(profile.bio) && profile.bio.length ? profile.bio.map((b) => ({ ...b })) : [blankField()],
    connections:
      Array.isArray(profile.connections) && profile.connections.length
        ? profile.connections.map((c) => ({ text: c.text || "", shown: Boolean(c.shown) }))
        : [],
  };
}

function EyeToggle({ shown, onToggle, label }) {
  return (
    <button
      type="button"
      className={`chronicle-form-eye ${shown ? "" : "chronicle-form-eye--off"}`}
      aria-label={shown ? `${label}: shown to players` : `${label}: hidden from players`}
      title={shown ? "Players can see this line" : "Hidden from players"}
      onClick={onToggle}
    >
      {shown ? <EyeIcon weight="bold" /> : <EyeSlashIcon weight="bold" />}
    </button>
  );
}

export default function ChronicleForm({
  initialValues,
  slugTemplates,
  blasterTemplates,
  mechaTemplates,
  onSubmit,
  onCancel,
  submitLabel,
}) {
  const [tab, setTab] = useState("identity");
  const [fields, setFields] = useState(() => fromInitial(initialValues));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function update(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }
  function setProfileField(key, patch) {
    setFields((prev) => ({ ...prev, fields: { ...prev.fields, [key]: { ...prev.fields[key], ...patch } } }));
  }
  function toggleId(key, id) {
    setFields((prev) => {
      const list = prev[key];
      const next = list.includes(id) ? list.filter((v) => v !== id) : [...list, id];
      return { ...prev, [key]: next };
    });
  }
  function addSlug(id) {
    setFields((prev) => ({ ...prev, slugTemplateIds: [...prev.slugTemplateIds, id] }));
  }
  function removeSlug(id) {
    setFields((prev) => ({ ...prev, slugTemplateIds: prev.slugTemplateIds.filter((v) => v !== id) }));
  }

  function setBio(index, patch) {
    setFields((prev) => ({ ...prev, bio: prev.bio.map((b, i) => (i === index ? { ...b, ...patch } : b)) }));
  }
  function addBio() {
    setFields((prev) => ({ ...prev, bio: [...prev.bio, blankField()] }));
  }
  function removeBio(index) {
    setFields((prev) => {
      const next = prev.bio.filter((_, i) => i !== index);
      return { ...prev, bio: next.length ? next : [blankField()] };
    });
  }
  function setConn(index, patch) {
    setFields((prev) => ({
      ...prev,
      connections: prev.connections.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  }
  function addConn() {
    setFields((prev) => ({ ...prev, connections: [...prev.connections, { text: "", shown: false }] }));
  }
  function removeConn(index) {
    setFields((prev) => ({ ...prev, connections: prev.connections.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const payload = {
      name: fields.name,
      image: fields.image,
      dexModifier: fields.dexModifier,
      conModifier: fields.conModifier,
      slugTemplateIds: fields.slugTemplateIds,
      blasterTemplateIds: fields.blasterTemplateIds,
      mechaTemplateId: fields.mechaTemplateId,
      revealed: fields.revealed,
      combatReady: fields.combatReady,
      dmNotes: fields.dmNotes,
      profile: {
        fields: fields.fields,
        bio: fields.bio.filter((b) => b.text.trim() || b.shown),
        connections: fields.connections.filter((c) => c.text.trim() || c.shown),
        combatShown: fields.combatShown,
      },
    };
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="chronicle-form" onSubmit={handleSubmit}>
      <div className="chronicle-form-tabs" role="tablist">
        {[
          ["identity", "Identity"],
          ["story", "Story"],
          ["combat", "Combat"],
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

      {tab === "identity" && (
        <div className="chronicle-form-panel">
          <div className="chronicle-form-image">
            <ImageCropper value={fields.image} onChange={(v) => update("image", v)} />
          </div>

          <div className="chronicle-field">
            <label htmlFor="chronicle-name">Name</label>
            <div className="chronicle-field-input">
              <input
                id="chronicle-name"
                type="text"
                maxLength={40}
                value={fields.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </div>
          </div>

          <div className="chronicle-form-grid2">
            <div className="chronicle-field">
              <label htmlFor="chronicle-rel">Relationship</label>
              <div className="chronicle-field-input">
                <select
                  id="chronicle-rel"
                  value={fields.fields.relationship.value || "Unknown"}
                  onChange={(e) => setProfileField("relationship", { value: e.target.value })}
                >
                  {RELATIONSHIPS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <EyeToggle
                  label="Relationship"
                  shown={fields.fields.relationship.shown}
                  onToggle={() => setProfileField("relationship", { shown: !fields.fields.relationship.shown })}
                />
              </div>
            </div>
            <div className="chronicle-field">
              <label htmlFor="chronicle-status">Status</label>
              <div className="chronicle-field-input">
                <select
                  id="chronicle-status"
                  value={fields.fields.status.value || "Alive"}
                  onChange={(e) => setProfileField("status", { value: e.target.value })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <EyeToggle
                  label="Status"
                  shown={fields.fields.status.shown}
                  onToggle={() => setProfileField("status", { shown: !fields.fields.status.shown })}
                />
              </div>
            </div>
          </div>

          {IDENTITY_FIELDS.map(({ key, label }) => (
            <div className="chronicle-field" key={key}>
              <label htmlFor={`chronicle-${key}`}>{label}</label>
              <div className="chronicle-field-input">
                <input
                  id={`chronicle-${key}`}
                  type="text"
                  maxLength={120}
                  value={fields.fields[key].value}
                  onChange={(e) => setProfileField(key, { value: e.target.value })}
                />
                <EyeToggle
                  label={label}
                  shown={fields.fields[key].shown}
                  onToggle={() => setProfileField(key, { shown: !fields.fields[key].shown })}
                />
              </div>
            </div>
          ))}

          <p className="chronicle-form-hint">
            The eye on each row decides whether players see that one line. Name and portrait show as soon as the card
            is revealed.
          </p>
        </div>
      )}

      {tab === "story" && (
        <div className="chronicle-form-panel">
          <div className="chronicle-field">
            <label>Bio</label>
            <div className="chronicle-form-list">
              {fields.bio.map((b, i) => (
                <div className="chronicle-form-list-row" key={i}>
                  <EyeToggle label="This paragraph" shown={b.shown} onToggle={() => setBio(i, { shown: !b.shown })} />
                  <textarea
                    maxLength={400}
                    placeholder="A paragraph the party might learn about this person."
                    value={b.text}
                    onChange={(e) => setBio(i, { text: e.target.value })}
                  />
                  <button type="button" className="chronicle-form-list-remove" onClick={() => removeBio(i)} aria-label="Remove paragraph">
                    <XIcon weight="bold" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="chronicle-form-add" onClick={addBio}>
              <PlusIcon weight="bold" /> Add paragraph
            </button>
          </div>

          <div className="chronicle-field">
            <label>Connections</label>
            <div className="chronicle-form-list">
              {fields.connections.length === 0 && (
                <p className="chronicle-form-hint">Links to other people, e.g. "Sister of Kord" or "Works for Blakk".</p>
              )}
              {fields.connections.map((c, i) => (
                <div className="chronicle-form-list-row" key={i}>
                  <EyeToggle label="This connection" shown={c.shown} onToggle={() => setConn(i, { shown: !c.shown })} />
                  <textarea
                    maxLength={120}
                    placeholder="Sister of Kord Zane"
                    value={c.text}
                    onChange={(e) => setConn(i, { text: e.target.value })}
                  />
                  <button type="button" className="chronicle-form-list-remove" onClick={() => removeConn(i)} aria-label="Remove connection">
                    <XIcon weight="bold" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="chronicle-form-add" onClick={addConn}>
              <PlusIcon weight="bold" /> Add connection
            </button>
          </div>

          <div className="chronicle-field">
            <label htmlFor="chronicle-dmnotes">DM notes</label>
            <div className="chronicle-field-input">
              <textarea
                id="chronicle-dmnotes"
                maxLength={4000}
                placeholder="Private. Never sent to a player, no matter what."
                value={fields.dmNotes}
                onChange={(e) => update("dmNotes", e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {tab === "combat" && (
        <div className="chronicle-form-panel">
          <label className="chronicle-form-toggle">
            <input
              type="checkbox"
              checked={fields.combatReady}
              onChange={(e) => update("combatReady", e.target.checked)}
            />
            Combat-ready (appears in the Combat page's NPC picker)
          </label>
          <label className="chronicle-form-toggle">
            <input
              type="checkbox"
              checked={fields.combatShown}
              onChange={(e) => update("combatShown", e.target.checked)}
            />
            Show the stat block (Grit / AP) to players
          </label>

          <div className="chronicle-form-grid2">
            <div className="chronicle-field">
              <label htmlFor="chronicle-dex">DEX Modifier</label>
              <div className="chronicle-field-input">
                <input
                  id="chronicle-dex"
                  type="number"
                  min={-5}
                  max={10}
                  value={fields.dexModifier}
                  onChange={(e) => update("dexModifier", Number(e.target.value))}
                />
              </div>
            </div>
            <div className="chronicle-field">
              <label htmlFor="chronicle-con">CON Modifier</label>
              <div className="chronicle-field-input">
                <input
                  id="chronicle-con"
                  type="number"
                  min={-5}
                  max={10}
                  value={fields.conModifier}
                  onChange={(e) => update("conModifier", Number(e.target.value))}
                />
              </div>
            </div>
          </div>
          <p className="chronicle-form-hint">Max Grit and Max AP are derived from these modifiers, the same way a player character's are.</p>

          <div className="npc-form-picker">
            <label>
              Slugs <span className="npc-form-picker-note">click to add, click again for another copy</span>
            </label>
            <div className="npc-form-picker-list">
              {slugTemplates.length === 0 && <p className="npc-form-picker-empty">No slug templates yet.</p>}
              {slugTemplates.map((t) => {
                const count = fields.slugTemplateIds.filter((v) => v === t.id).length;
                return (
                  <button
                    type="button"
                    key={t.id}
                    className={`npc-form-picker-item npc-form-picker-item--slug ${count > 0 ? "npc-form-picker-item--picked" : ""}`}
                    style={{ "--type-color": typeColor(t.type) }}
                    onClick={() => addSlug(t.id)}
                  >
                    {t.protoformImage ? <img src={t.protoformImage} alt="" /> : <span className="npc-form-picker-placeholder" />}
                    <span className="npc-form-picker-item-label">{t.name}</span>
                    {count > 1 && <span className="npc-form-picker-item-count">&times;{count}</span>}
                    {count > 0 && (
                      <span
                        className="npc-form-picker-item-x"
                        role="button"
                        tabIndex={0}
                        aria-label={`Remove all ${t.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSlug(t.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            e.preventDefault();
                            removeSlug(t.id);
                          }
                        }}
                      >
                        <XIcon weight="bold" />
                      </span>
                    )}
                  </button>
                );
              })}
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
                  className={`npc-form-picker-item npc-form-picker-item--blaster ${fields.blasterTemplateIds.includes(t.id) ? "npc-form-picker-item--picked" : ""}`}
                  onClick={() => toggleId("blasterTemplateIds", t.id)}
                >
                  {t.image ? <img src={t.image} alt="" /> : <span className="npc-form-picker-placeholder" />}
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="chronicle-field">
            <label htmlFor="chronicle-mecha">Mecha</label>
            <div className="chronicle-field-input">
              <select
                id="chronicle-mecha"
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
          </div>
        </div>
      )}

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
