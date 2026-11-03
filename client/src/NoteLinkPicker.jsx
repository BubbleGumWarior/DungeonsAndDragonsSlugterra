import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { REF_GROUPS, REF_KINDS } from "./noteLinks.js";
import { RefIcon } from "./NoteRichText.jsx";

// The "Link to..." popover: search everything a note can point at, arrow keys
// and Enter to pick. Anchored by CSS under the editor toolbar.
export default function NoteLinkPicker({ entries, loaded, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (group === "all" || REF_KINDS[e.kind].group === group) &&
        (!q || e.name.toLowerCase().includes(q) || e.sub.toLowerCase().includes(q))
    );
  }, [entries, query, group]);

  const current = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [current, results]);

  // Outside press closes it -- except the toolbar trigger, which toggles it.
  useEffect(() => {
    function onDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target) && !e.target.closest?.("[data-nb-picker-trigger]")) onClose();
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onClose]);

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length) setActive((current + (e.key === "ArrowDown" ? 1 : results.length - 1)) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[current]) onPick(results[current]);
    }
  }

  return (
    <div className="nb-picker" ref={rootRef} role="dialog" aria-label="Link to an item, slug or person" onKeyDown={onKeyDown}>
      <label className="sp-search nb-picker-search">
        <MagnifyingGlassIcon weight="bold" />
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder="Find an item, slug or person"
          aria-label="Search things to link"
          role="combobox"
          aria-expanded="true"
          aria-controls="nb-picker-list"
        />
      </label>

      <div className="nb-picker-groups" role="group" aria-label="Show">
        {[{ key: "all", label: "All" }, ...REF_GROUPS].map((g) => (
          <button
            key={g.key}
            type="button"
            className="nb-picker-group"
            aria-pressed={group === g.key}
            onClick={() => {
              setGroup(g.key);
              setActive(0);
            }}
          >
            {g.label}
          </button>
        ))}
      </div>

      <ul className="nb-picker-list" id="nb-picker-list" role="listbox" ref={listRef}>
        {!loaded ? (
          <li className="nb-picker-empty">Looking through your pack…</li>
        ) : entries.length === 0 ? (
          <li className="nb-picker-empty">Nothing to link yet. Items, slugs and Chronicle cards show up here once you have them.</li>
        ) : results.length === 0 ? (
          <li className="nb-picker-empty">Nothing matches “{query}”.</li>
        ) : (
          results.map((e, i) => (
            <li key={`${e.kind}/${e.id}`} role="option" aria-selected={i === current}>
              <button
                type="button"
                className={`nb-pick${i === current ? " nb-pick--on" : ""}`}
                tabIndex={-1}
                onMouseMove={() => setActive(i)}
                onClick={() => onPick(e)}
              >
                <span className="nb-pick-art">
                  {e.image ? <img src={e.image} alt="" loading="lazy" decoding="async" /> : <RefIcon kind={e.kind} size={16} />}
                </span>
                <span className="nb-pick-name">{e.name}</span>
                <span className="sp-leader" aria-hidden="true" />
                <span className="nb-pick-kind">{REF_KINDS[e.kind].label}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
