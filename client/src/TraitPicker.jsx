import { useMemo, useState } from "react";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { SLUG_TRAIT_GROUPS } from "./slugTraits.jsx";
import "./TraitPicker.css";

// Replaces the flat wall of ~37 ability checkboxes in SlugForm. Traits are
// bucketed into named groups, filterable by a search box, and toggled as
// compact chips; whatever is switched on is mirrored in an "Active
// abilities" summary at the top with its full description, so the authoring
// context the old checkbox labels carried isn't lost.
export default function TraitPicker({ fields, onToggle }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const selected = useMemo(
    () => SLUG_TRAIT_GROUPS.flatMap((g) => g.traits).filter((t) => Boolean(fields[t.key])),
    [fields]
  );

  const groups = useMemo(() => {
    if (!q) return SLUG_TRAIT_GROUPS.map((g) => ({ ...g, matches: g.traits }));
    return SLUG_TRAIT_GROUPS.map((g) => ({
      ...g,
      matches: g.traits.filter(
        (t) => t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      ),
    })).filter((g) => g.matches.length > 0);
  }, [q]);

  return (
    <div className="trait-picker">
      <div className="trait-picker-head">
        <span className="trait-picker-title">Abilities</span>
        <span className="trait-picker-count" data-empty={selected.length === 0}>
          {selected.length} active
        </span>
        {selected.length > 0 && (
          <button
            type="button"
            className="trait-picker-clear"
            onClick={() => selected.forEach((t) => onToggle(t.key, false))}
          >
            Clear all
          </button>
        )}
      </div>

      {selected.length > 0 && (
        <ul className="trait-picker-active">
          {selected.map((t) => {
            const Icon = t.icon;
            return (
              <li key={t.key}>
                <Icon weight="fill" className="trait-picker-active-icon" />
                <div className="trait-picker-active-text">
                  <span className="trait-picker-active-label">{t.label}</span>
                  <span className="trait-picker-active-desc">{t.description}</span>
                </div>
                <button
                  type="button"
                  className="trait-picker-active-remove"
                  onClick={() => onToggle(t.key, false)}
                  aria-label={`Remove ${t.label}`}
                >
                  <XIcon weight="bold" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="trait-picker-search">
        <MagnifyingGlassIcon weight="bold" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter abilities…"
          aria-label="Filter abilities"
        />
        {query && (
          <button type="button" className="trait-picker-search-clear" onClick={() => setQuery("")} aria-label="Clear filter">
            <XIcon weight="bold" />
          </button>
        )}
      </div>

      <div className="trait-picker-groups">
        {groups.length === 0 && <p className="trait-picker-nomatch">No abilities match “{query}”.</p>}
        {groups.map((g) => {
          const activeInGroup = g.traits.filter((t) => Boolean(fields[t.key])).length;
          return (
            <section key={g.key} className="trait-picker-group">
              <header className="trait-picker-group-head">
                <span className="trait-picker-group-label">{g.label}</span>
                <span className="trait-picker-group-tally">
                  {activeInGroup > 0 ? `${activeInGroup} / ${g.traits.length}` : g.traits.length}
                </span>
              </header>
              <div className="trait-picker-grid">
                {g.matches.map((t) => {
                  const Icon = t.icon;
                  const on = Boolean(fields[t.key]);
                  return (
                    <button
                      type="button"
                      key={t.key}
                      className={`trait-chip ${on ? "trait-chip--on" : ""}`}
                      onClick={() => onToggle(t.key, !on)}
                      aria-pressed={on}
                      title={t.description}
                    >
                      <Icon weight={on ? "fill" : "regular"} />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
