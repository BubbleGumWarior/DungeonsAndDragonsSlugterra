import { UserCircleIcon } from "@phosphor-icons/react";
import "./NpcSlugGuesses.css";

// A shared checklist, not a private guess -- every pick here is visible to
// (and toggleable by) every player and the DM. `gallery` is the player-safe
// slug list (name + protoform art, no stats) from /api/slug-templates/gallery.
export default function NpcSlugGuesses({ gallery, guessedIds, onToggle, readOnly = false }) {
  if (gallery.length === 0) {
    return <p className="slug-management-empty">No slugs have been catalogued yet.</p>;
  }

  return (
    <div className="npc-guess-grid">
      {gallery.map((t) => {
        const picked = guessedIds.includes(t.id);
        return (
          <button
            type="button"
            key={t.id}
            className={`npc-guess-item ${picked ? "npc-guess-item--picked" : ""}`}
            onClick={() => onToggle(t.id)}
            disabled={readOnly}
          >
            <span className="npc-guess-item-portrait">
              {t.protoformImage ? <img src={t.protoformImage} alt="" /> : <UserCircleIcon weight="duotone" />}
            </span>
            <span className="npc-guess-item-name">{t.name}</span>
          </button>
        );
      })}
    </div>
  );
}
