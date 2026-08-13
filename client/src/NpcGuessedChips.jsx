import { UserCircleIcon, XIcon } from "@phosphor-icons/react";
import "./NpcSlugGuesses.css";

// The compact, always-visible summary of a collective guess list -- sits at
// the bottom of an NPC card so the current picks are readable at a glance,
// without opening the full picker grid (NpcSlugGuesses) just to see them.
export default function NpcGuessedChips({ gallery, guessedIds, onRemove, emptyText = "No guesses yet." }) {
  if (guessedIds.length === 0) {
    return <p className="npc-guessed-chips-empty">{emptyText}</p>;
  }

  return (
    <div className="npc-guessed-chips">
      {guessedIds.map((id) => {
        const slug = gallery.find((t) => t.id === id);
        return (
          <span key={id} className="npc-guessed-chip">
            <span className="npc-guessed-chip-portrait">
              {slug?.protoformImage ? <img src={slug.protoformImage} alt="" /> : <UserCircleIcon weight="duotone" />}
            </span>
            <span className="npc-guessed-chip-name">{slug?.name || "Unknown slug"}</span>
            {onRemove && (
              <button
                type="button"
                className="npc-guessed-chip-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(id);
                }}
                title="Remove this guess"
              >
                <XIcon weight="bold" />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
