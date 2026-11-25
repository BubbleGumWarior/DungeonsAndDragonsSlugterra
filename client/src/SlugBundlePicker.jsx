import { useMemo, useState } from "react";
import { CheckIcon, CircleDashedIcon, GiftIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { typeColor } from "./slugData.js";
import { filterTemplates, sortTemplates } from "./SlugToolbar.jsx";
import "./SlugBundle.css";

const NO_SET = new Set();

// The DM's "Give Slug Bundle" chooser: tick any number of slug templates, then
// send them out. Sending opens the shared bundle modal on every screen
// (SlugBundleModal), where the DM calls players up one by one.
export default function SlugBundlePicker({ templates, onClose }) {
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState([]); // template ids, in the order chosen
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const visible = useMemo(() => sortTemplates(filterTemplates(templates, { query, types: NO_SET, flags: NO_SET }), "name-asc"), [templates, query]);
  const byId = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);

  function toggle(id) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function send() {
    if (picked.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/slug-bundle", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ templateIds: picked }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not open the bundle.");
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="slug-modal-backdrop" onClick={onClose}>
      <div className="slug-modal slug-bundle-picker" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="slug-bundle-picker-title">
        <h2 id="slug-bundle-picker-title">Give Slug Bundle</h2>
        <p className="slug-bundle-picker-lede">Pick the slugs to offer. Everyone sees the bundle, and you call players up one at a time to take one each.</p>

        <label className="desk-search">
          <MagnifyingGlassIcon weight="bold" aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or element" aria-label="Search slug templates" autoFocus />
        </label>

        <div className="slug-bundle-tray" aria-live="polite">
          {picked.length === 0 ? (
            <span className="slug-bundle-tray-empty">No slugs picked yet.</span>
          ) : (
            picked.map((id) => (
              <button key={id} type="button" className="slug-bundle-chip" onClick={() => toggle(id)} title="Remove from the bundle">
                {byId.get(id)?.name ?? "Unknown"}
                <XIcon weight="bold" aria-hidden="true" />
              </button>
            ))
          )}
        </div>

        {visible.length === 0 ? (
          <p className="desk-empty">{templates.length === 0 ? "No slug templates yet." : "No slugs match that search."}</p>
        ) : (
          <ul className="slug-bundle-slugs slug-bundle-slugs--picker" aria-label="Slug templates">
            {visible.map((t) => {
              const on = picked.includes(t.id);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    className={`slug-bundle-slug slug-bundle-slug--pickable ${on ? "slug-bundle-slug--chosen" : ""}`}
                    style={{ "--type-color": typeColor(t.type) }}
                    aria-pressed={on}
                    onClick={() => toggle(t.id)}
                  >
                    <span className="slug-bundle-art">
                      {t.protoformImage ? <img src={t.protoformImage} alt="" loading="lazy" decoding="async" /> : <CircleDashedIcon weight="duotone" />}
                      {on && (
                        <span className="slug-bundle-check" aria-hidden="true">
                          <CheckIcon weight="bold" />
                        </span>
                      )}
                    </span>
                    <span className="slug-bundle-name">{t.name}</span>
                    <span className="slug-bundle-meta">
                      {t.type} · P{t.clashPower}/D{t.clashDefense}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {error && <p className="panel-error">{error}</p>}

        <div className="slug-bundle-foot">
          <button type="button" className="panel-btn slug-bundle-claim" onClick={send} disabled={picked.length === 0 || busy}>
            <GiftIcon weight="bold" />
            {busy ? "Opening…" : picked.length === 0 ? "Pick slugs to send" : `Send bundle of ${picked.length}`}
          </button>
          <button type="button" className="panel-btn panel-btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
