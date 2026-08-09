import { useEffect, useState } from "react";
import { UserCircleIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import "./SlugManagement.css";
import "./NpcGuessModal.css";

export default function NpcGuessModal({ combatant, onClose }) {
  const { token } = useAuth();
  const [gallery, setGallery] = useState([]);
  const [guessedIds, setGuessedIds] = useState([]);
  const [loading, setLoading] = useState(true);

  function authHeaders(extra) {
    return { Authorization: `Bearer ${token}`, ...extra };
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/slug-templates/gallery", { headers: authHeaders() }).then((r) => r.json()),
      fetch(`/api/combat/npc-guesses/${combatant.id}`, { headers: authHeaders() }).then((r) => r.json()),
    ])
      .then(([galleryData, guessData]) => {
        setGallery(galleryData.templates || []);
        setGuessedIds(guessData.slugTemplateIds || []);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combatant.id, token]);

  async function toggleGuess(slugTemplateId) {
    const optimistic = guessedIds.includes(slugTemplateId)
      ? guessedIds.filter((id) => id !== slugTemplateId)
      : [...guessedIds, slugTemplateId];
    setGuessedIds(optimistic);
    try {
      const res = await fetch("/api/combat/npc-guesses/toggle", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ combatantId: combatant.id, slugTemplateId }),
      });
      const data = await res.json();
      if (res.ok) setGuessedIds(data.slugTemplateIds || []);
    } catch {
      // keep the optimistic state -- a failed toggle just means it'll be
      // out of sync until the next successful one, not worth a hard error
    }
  }

  return (
    <div className="slug-modal-backdrop" onClick={onClose}>
      <div className="slug-modal npc-guess-modal" onClick={(e) => e.stopPropagation()}>
        <h2>What is {combatant.name} carrying?</h2>
        <p className="npc-guess-modal-hint">
          Your guess -- pick every slug you think it has. Nobody else can see your picks.
        </p>
        {loading ? (
          <p className="slug-management-empty">Loading...</p>
        ) : gallery.length === 0 ? (
          <p className="slug-management-empty">No slugs have been catalogued yet.</p>
        ) : (
          <div className="npc-guess-grid">
            {gallery.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`npc-guess-item ${guessedIds.includes(t.id) ? "npc-guess-item--picked" : ""}`}
                onClick={() => toggleGuess(t.id)}
              >
                <span className="npc-guess-item-portrait">
                  {t.protoformImage ? <img src={t.protoformImage} alt="" /> : <UserCircleIcon weight="duotone" />}
                </span>
                <span className="npc-guess-item-name">{t.name}</span>
              </button>
            ))}
          </div>
        )}
        <button type="button" className="slug-form-cancel npc-guess-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
