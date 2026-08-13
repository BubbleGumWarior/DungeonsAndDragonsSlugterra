import { useEffect, useState } from "react";
import { CaretDownIcon, UserCircleIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import NpcSlugGuesses from "./NpcSlugGuesses.jsx";
import NpcGuessedChips from "./NpcGuessedChips.jsx";
import "./SlugManagement.css";
import "./NpcPlayerBoard.css";

export default function NpcPlayerBoard() {
  const { token } = useAuth();
  const { npcTemplatesUpdate, slugpediaUpdate } = useLiveState();
  const [npcs, setNpcs] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [knownTemplateIds, setKnownTemplateIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  function authHeaders(extra) {
    return { Authorization: `Bearer ${token}`, ...extra };
  }

  function loadNpcs() {
    return fetch("/api/npc-templates", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setNpcs(data.templates || []))
      .catch(() => {});
  }

  function loadKnownTemplateIds() {
    return fetch("/api/slugpedia/known-template-ids", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setKnownTemplateIds(new Set(data.templateIds || [])))
      .catch(() => {});
  }

  useEffect(() => {
    Promise.all([
      loadNpcs(),
      loadKnownTemplateIds(),
      fetch("/api/slug-templates/gallery", { headers: authHeaders() })
        .then((res) => res.json())
        .then((data) => setGallery(data.templates || []))
        .catch(() => {}),
    ]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (npcTemplatesUpdate) loadNpcs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [npcTemplatesUpdate]);

  // A newly-assigned slug (or an NPC that just joined combat carrying one)
  // can unlock a guessable slug mid-session -- keep the picker in sync.
  useEffect(() => {
    if (slugpediaUpdate) loadKnownTemplateIds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugpediaUpdate]);

  // Players can only guess slugs the party has actually encountered before
  // (see routes/npcTemplates.js's matching server-side check) -- the DM's
  // full template gallery is still used to look up names/art for chips
  // already guessed.
  const guessableGallery = gallery.filter((t) => knownTemplateIds.has(t.id));

  async function toggleGuess(npcId, slugTemplateId) {
    setNpcs((prev) =>
      prev.map((n) => {
        if (n.id !== npcId) return n;
        const has = n.guessedSlugTemplateIds.includes(slugTemplateId);
        return {
          ...n,
          guessedSlugTemplateIds: has
            ? n.guessedSlugTemplateIds.filter((id) => id !== slugTemplateId)
            : [...n.guessedSlugTemplateIds, slugTemplateId],
        };
      })
    );
    try {
      const res = await fetch(`/api/npc-templates/${npcId}/guesses/toggle`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ slugTemplateId }),
      });
      const data = await res.json();
      if (res.ok) {
        setNpcs((prev) => prev.map((n) => (n.id === npcId ? { ...n, guessedSlugTemplateIds: data.guessedSlugTemplateIds } : n)));
      }
    } catch {
      // optimistic update stands; the next successful toggle (or the live
      // broadcast from someone else's toggle) reconciles it
    }
  }

  if (loading) return null;

  return (
    <div className="slug-management">
      <section className="slug-management-section">
        <div className="slug-management-section-header">
          <h2>NPCs</h2>
        </div>

        {npcs.length === 0 ? (
          <p className="slug-management-empty">Your Dungeon Master hasn't revealed any NPCs yet.</p>
        ) : (
          <div className="npc-player-list">
            {npcs.map((npc) => {
              const open = openId === npc.id;
              return (
                <div key={npc.id} className="npc-player-card">
                  <button
                    type="button"
                    className="npc-player-card-header"
                    onClick={() => setOpenId(open ? null : npc.id)}
                  >
                    <span className="npc-player-card-portrait">
                      {npc.image ? <img src={npc.image} alt={npc.name} /> : <UserCircleIcon weight="duotone" />}
                    </span>
                    <span className="npc-player-card-info">
                      <span className="npc-player-card-name">{npc.name}</span>
                      <span className="npc-player-card-hint">{open ? "Done guessing" : "Guess its slugs"}</span>
                    </span>
                    <span className={`npc-player-card-caret ${open ? "npc-player-card-caret--open" : ""}`}>
                      <CaretDownIcon weight="bold" />
                    </span>
                  </button>

                  <div className="npc-player-card-guessed">
                    <NpcGuessedChips
                      gallery={gallery}
                      guessedIds={npc.guessedSlugTemplateIds}
                      onRemove={(slugTemplateId) => toggleGuess(npc.id, slugTemplateId)}
                      emptyText="No guesses yet -- what is it carrying?"
                    />
                  </div>

                  {open && (
                    <div className="npc-player-card-body">
                      <p className="npc-player-card-body-hint">
                        Pick every slug the party thinks {npc.name} is carrying -- everyone sees and can change these picks.
                        Only slugs the party has already seen (in the Slugpedia) can be guessed.
                      </p>
                      {guessableGallery.length === 0 ? (
                        <p className="slug-management-empty">
                          The party hasn't seen any slugs yet -- nothing to guess with.
                        </p>
                      ) : (
                        <NpcSlugGuesses
                          gallery={guessableGallery}
                          guessedIds={npc.guessedSlugTemplateIds}
                          onToggle={(slugTemplateId) => toggleGuess(npc.id, slugTemplateId)}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
