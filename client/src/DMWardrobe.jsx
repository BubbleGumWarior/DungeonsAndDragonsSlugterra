import { useEffect, useState } from "react";
import { PlusIcon, ThermometerHotIcon, TrashIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import CollapseTitle from "./CollapseTitle.jsx";
import { formatRange, outfitChips } from "./outfitData.js";
import "./DMWardrobe.css";

// The catalog sorted into climates by the middle of each comfort range, so a
// 60-outfit dropdown reads as "what do I hand someone for a hot world".
const CLIMATE_GROUPS = [
  { label: "Any climate", test: (t) => t.comfortMax >= 500 },
  { label: "Freezing", test: (t) => (t.comfortMin + t.comfortMax) / 2 < -10 },
  { label: "Cold", test: (t) => (t.comfortMin + t.comfortMax) / 2 < 10 },
  { label: "Mild", test: (t) => (t.comfortMin + t.comfortMax) / 2 < 25 },
  { label: "Hot", test: () => true },
];

function groupTemplates(templates) {
  const groups = CLIMATE_GROUPS.map((g) => ({ label: g.label, items: [] }));
  for (const t of templates) groups[CLIMATE_GROUPS.findIndex((g) => g.test(t))].items.push(t);
  return groups.filter((g) => g.items.length > 0);
}

// The DM's side of the Wardrobe: see what everyone owns and is wearing, hand
// someone an outfit from the catalog, or take one away.
export default function DMWardrobe() {
  const { token } = useAuth();
  const { outfitsChanged } = useLiveState();
  const [open, setOpen] = useState(false);
  const [characters, setCharacters] = useState([]);
  const [outfits, setOutfits] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [picks, setPicks] = useState({});
  const [error, setError] = useState(null);
  const headers = { Authorization: `Bearer ${token}` };

  function load() {
    fetch("/api/outfits", { headers })
      .then((res) => res.json())
      .then((data) => setOutfits(data.outfits || []))
      .catch(() => {});
  }

  useEffect(() => {
    fetch("/api/characters", { headers })
      .then((res) => res.json())
      .then((data) => setCharacters(data.characters || []))
      .catch(() => {});
    fetch("/api/outfits/templates", { headers })
      .then((res) => res.json())
      .then((data) => setTemplates(data.templates || []))
      .catch(() => {});
  }, [token]);

  useEffect(load, [token, outfitsChanged]);

  async function grant(userId) {
    const templateId = Number(picks[userId]);
    if (!templateId) return;
    setError(null);
    const res = await fetch("/api/outfits", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ userId, templateId }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error || "Could not grant that outfit.");
    setPicks((p) => ({ ...p, [userId]: "" }));
    load();
  }

  async function remove(outfit) {
    setError(null);
    const res = await fetch(`/api/outfits/${outfit.id}`, { method: "DELETE", headers });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error || "Could not remove that outfit.");
    load();
  }

  return (
    <section className="slug-management-section">
      <div className="slug-management-section-header">
        <CollapseTitle title="Wardrobes" count={outfits.length} open={open} onToggle={() => setOpen((v) => !v)} />
      </div>
      {open && (
        <>
          {error && (
            <p className="panel-error" role="alert">
              {error}
            </p>
          )}
          {characters.length === 0 ? (
            <p className="slug-management-empty">No characters yet.</p>
          ) : (
            <div className="dm-wardrobe-players">
              {characters.map((character) => {
                const owned = outfits.filter((o) => o.userId === character.userId);
                const worn = owned.find((o) => o.equipped);
                const ownedTemplateIds = new Set(owned.map((o) => o.templateId));
                const groups = groupTemplates(templates.filter((t) => !ownedTemplateIds.has(t.id)));
                return (
                  <article className="dm-wardrobe-player" key={character.userId}>
                    <header className="dm-wardrobe-player-head">
                      <div className="dm-wardrobe-player-who">
                        <h3>{character.name}</h3>
                        {character.ill && (
                          <span className="dm-wardrobe-ill">
                            <ThermometerHotIcon weight="fill" aria-hidden="true" /> Ill
                          </span>
                        )}
                      </div>
                      <p className="dm-wardrobe-player-meta">
                        {worn ? (
                          <>
                            Wearing <b>{worn.name}</b>
                          </>
                        ) : (
                          "Nothing worn"
                        )}
                        <span aria-hidden="true"> · </span>
                        {owned.length} {owned.length === 1 ? "outfit" : "outfits"}
                      </p>
                    </header>

                    {owned.length === 0 ? (
                      <p className="dm-wardrobe-none">No outfits yet.</p>
                    ) : (
                      <ul className="dm-wardrobe-list">
                        {owned.map((o) => {
                          const chips = outfitChips(o);
                          return (
                            <li key={o.id} className={`dm-wardrobe-row ${o.equipped ? "dm-wardrobe-row--worn" : ""}`}>
                              <div className="dm-wardrobe-row-text">
                                <span className="dm-wardrobe-name">{o.name}</span>
                                <span className="dm-wardrobe-range">{formatRange({ min: o.comfortMin, max: o.comfortMax })}</span>
                                {(o.equipped || chips.length > 0) && (
                                  <span className="dm-wardrobe-tags">
                                    {o.equipped && <span className="dm-wardrobe-tag">Worn</span>}
                                    {chips.map((c) => (
                                      <span key={c.label} className={`dm-wardrobe-chip ${c.good ? "dm-wardrobe-chip--good" : "dm-wardrobe-chip--bad"}`}>
                                        {c.label}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                className="slug-management-icon-btn slug-management-icon-btn--danger"
                                onClick={() => remove(o)}
                                title={`Take away ${o.name}`}
                                aria-label={`Take away ${o.name}`}
                              >
                                <TrashIcon weight="bold" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <div className="dm-wardrobe-grant">
                      <select
                        value={picks[character.userId] ?? ""}
                        onChange={(e) => setPicks((p) => ({ ...p, [character.userId]: e.target.value }))}
                        aria-label={`Outfit to give ${character.name}`}
                      >
                        <option value="">Give an outfit...</option>
                        {groups.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.items.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} ({formatRange({ min: t.comfortMin, max: t.comfortMax })})
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <button type="button" className="panel-btn" disabled={!picks[character.userId]} onClick={() => grant(character.userId)}>
                        <PlusIcon weight="bold" />
                        Give
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
