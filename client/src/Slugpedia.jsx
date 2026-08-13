import { useEffect, useMemo, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import SlugCard from "./SlugCard.jsx";
import "./SlugManagement.css";
import "./Slugpedia.css";

// Every distinct slug variant the party has ever encountered -- assigned to
// a player, or carried by an NPC that joined combat -- grouped by name.
// Identical variants (same name AND every stat) collapse into one entry;
// anything that differs (even just AP cost) is its own variant, tucked
// behind the group's expander.
export default function Slugpedia({ onClose }) {
  const { token } = useAuth();
  const { slugpediaUpdate } = useLiveState();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    fetch("/api/slugpedia", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setEntries(data.entries || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!slugpediaUpdate) return;
    fetch("/api/slugpedia", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setEntries(data.entries || []))
      .catch(() => {});
  }, [slugpediaUpdate, token]);

  const groups = useMemo(() => {
    const byName = new Map();
    for (const entry of entries) {
      if (!byName.has(entry.name)) byName.set(entry.name, []);
      byName.get(entry.name).push(entry);
    }
    return [...byName.entries()]
      .map(([name, variants]) => ({ name, variants }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  function toggleExpanded(name) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="slug-modal-backdrop" onClick={onClose}>
      <div className="slug-modal slug-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h2>Slugpedia</h2>
        <p className="slugpedia-hint">
          Every slug the party has ever encountered -- assigned to a player, or seen on an NPC in combat.
        </p>

        {loading ? (
          <p className="slug-management-empty">Loading...</p>
        ) : groups.length === 0 ? (
          <p className="slug-management-empty">No slugs discovered yet.</p>
        ) : (
          <div className="slug-management-grid">
            {groups.map(({ name, variants }) => {
              const open = expanded.has(name);
              const primary = variants[0];
              return (
                <div key={name} className="slugpedia-group">
                  <SlugCard slug={primary} size="sm" />
                  {variants.length > 1 && (
                    <button type="button" className="slugpedia-expand" onClick={() => toggleExpanded(name)}>
                      <span>
                        {variants.length} variants seen
                      </span>
                      <span className={`slugpedia-expand-caret ${open ? "slugpedia-expand-caret--open" : ""}`}>
                        <CaretDownIcon weight="bold" />
                      </span>
                    </button>
                  )}
                  {open && (
                    <div className="slugpedia-variants">
                      {variants.map((variant) => (
                        <SlugCard key={variant.id} slug={variant} size="sm" />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button type="button" className="slugpedia-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
