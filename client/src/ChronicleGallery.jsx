import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EyeIcon, EyeSlashIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import ChronicleCard from "./ChronicleCard.jsx";
import ChronicleForm from "./ChronicleForm.jsx";
import GruntForm from "./GruntForm.jsx";
import NpcSlugGuesses from "./NpcSlugGuesses.jsx";
import NpcGuessedChips from "./NpcGuessedChips.jsx";
import "./SlugManagement.css";
import "./Chronicle.css";

const LINE_DEFS = [
  ["role", "Role"],
  ["faction", "Faction"],
  ["age", "Age"],
  ["species", "Species"],
  ["firstMetLocation", "First met"],
  ["firstMetSession", "Session"],
];

const FILTERS = [
  { key: "all", label: "All" },
  { key: "ally", label: "Allies", rels: ["Ally", "Friend"], dot: "var(--rel-ally)" },
  { key: "rival", label: "Rivals", rels: ["Rival"], dot: "var(--rel-rival)" },
  { key: "enemy", label: "Enemies", rels: ["Enemy"], dot: "var(--rel-enemy)" },
  { key: "gone", label: "Deceased & missing", statuses: ["Deceased", "Missing"], dot: "var(--rel-neutral)" },
];

const REL_DOT = {
  Ally: "var(--rel-ally)",
  Friend: "var(--rel-friend)",
  Neutral: "var(--rel-neutral)",
  Rival: "var(--rel-rival)",
  Enemy: "var(--rel-enemy)",
  Unknown: "var(--rel-unknown)",
};
const relDot = (rel) => REL_DOT[rel] || REL_DOT.Enemy;

function normNpcDm(t) {
  const pf = t.profile?.fields || {};
  const lines = LINE_DEFS.map(([key, label]) => ({
    key,
    label,
    value: (pf[key]?.value || "").trim(),
    shown: Boolean(pf[key]?.shown),
  })).filter((l) => l.value);
  return {
    key: `npc-${t.id}`,
    kind: "npc",
    id: t.id,
    name: t.name,
    image: t.image,
    revealed: t.revealed,
    relationship: pf.relationship?.value || "Unknown",
    relationshipShown: Boolean(pf.relationship?.shown),
    status: pf.status?.value || "Alive",
    statusShown: Boolean(pf.status?.shown),
    lines,
    bio: (t.profile?.bio || []).filter((b) => b.text).map((b) => ({ text: b.text, shown: Boolean(b.shown) })),
    connections: (t.profile?.connections || [])
      .filter((c) => c.text)
      .map((c) => ({ text: c.text, shown: Boolean(c.shown) })),
    combat: t.combatReady
      ? { maxGrit: t.maxGrit, maxAp: t.maxAp, dexModifier: t.dexModifier, conModifier: t.conModifier }
      : null,
    combatShown: Boolean(t.profile?.combatShown),
    combatReady: t.combatReady,
    dmNotes: t.dmNotes,
    guessedSlugTemplateIds: t.guessedSlugTemplateIds || [],
    raw: t,
  };
}

function normNpcPlayer(t) {
  const f = t.fields || {};
  const lines = LINE_DEFS.map(([key, label]) => ({
    key,
    label,
    value: (f[key] || "").trim(),
    shown: true,
  })).filter((l) => l.value);
  return {
    key: `npc-${t.id}`,
    kind: "npc",
    id: t.id,
    name: t.name,
    image: t.image,
    revealed: true,
    relationship: f.relationship || null,
    status: f.status || "Alive",
    lines,
    bio: (t.bio || []).map((text) => ({ text, shown: true })),
    connections: (t.connections || []).map((text) => ({ text, shown: true })),
    combat: t.combat || null,
    guessedSlugTemplateIds: t.guessedSlugTemplateIds || [],
  };
}

function normPc(c) {
  const hasAge = c.age !== null && c.age !== undefined && `${c.age}`.trim() !== "";
  return {
    key: `pc-${c.userId}`,
    kind: "pc",
    id: c.userId,
    name: c.name,
    image: c.portrait,
    revealed: true,
    relationship: "Party",
    status: "Alive",
    lines: hasAge ? [{ key: "age", label: "Age", value: String(c.age), shown: true }] : [],
    bio: [],
    connections: [],
    slugs: c.slugs || [],
    combat: null,
  };
}

export default function ChronicleGallery() {
  const { token, user } = useAuth();
  const isDungeonMaster = user?.role === "Dungeon Master";
  const { npcTemplatesUpdate, gruntTemplatesUpdate, characterUpdate, characterCreated, slugUpdate, partyHealed, slugpediaUpdate } = useLiveState();

  const [npcs, setNpcs] = useState([]);
  const [grunts, setGrunts] = useState([]);
  const [party, setParty] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [knownTemplateIds, setKnownTemplateIds] = useState(() => new Set());
  const [slugTemplates, setSlugTemplates] = useState([]);
  const [blasterTemplates, setBlasterTemplates] = useState([]);
  const [mechaTemplates, setMechaTemplates] = useState([]);

  const [segment, setSegment] = useState("met");
  const [filter, setFilter] = useState("all");
  const [gridPhase, setGridPhase] = useState("in"); // "in" | "out" -- drives the grid shrink/grow transition
  const [modal, setModal] = useState(null); // { type: "new" } | { type: "edit", id } | { type: "guess", id }

  // Switch the visible segment/filter with a shrink-out then grow-in on the
  // card grid, rather than swapping the contents instantly.
  const swapTimer = useRef(null);
  const changeView = useCallback(
    (next) => {
      const nextSegment = next.segment ?? segment;
      const nextFilter = next.filter ?? filter;
      if (nextSegment === segment && nextFilter === filter) return;
      if (swapTimer.current) clearTimeout(swapTimer.current);
      setGridPhase("out");
      swapTimer.current = setTimeout(() => {
        setSegment(nextSegment);
        setFilter(nextFilter);
        setGridPhase("in");
        swapTimer.current = null;
      }, 180);
    },
    [segment, filter]
  );
  useEffect(() => () => swapTimer.current && clearTimeout(swapTimer.current), []);

  // Sliding pill behind the active segment tab.
  const segmentRef = useRef(null);
  const [thumb, setThumb] = useState(null); // { left, width } | null
  useLayoutEffect(() => {
    const root = segmentRef.current;
    if (!root) return;
    const measure = () => {
      const active = root.querySelector('[aria-selected="true"]');
      if (active) setThumb({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [segment, isDungeonMaster]);

  const authHeaders = useCallback((extra) => ({ Authorization: `Bearer ${token}`, ...extra }), [token]);

  const loadNpcs = useCallback(() => {
    fetch("/api/npc-templates", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setNpcs(data.templates || []))
      .catch(() => {});
  }, [authHeaders]);

  const loadGrunts = useCallback(() => {
    if (!isDungeonMaster) return;
    fetch("/api/grunt-templates", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setGrunts(data.templates || []))
      .catch(() => {});
  }, [authHeaders, isDungeonMaster]);

  const loadParty = useCallback(() => {
    fetch("/api/chronicle/party", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setParty(data.party || []))
      .catch(() => {});
  }, [authHeaders]);

  const loadKnown = useCallback(() => {
    fetch("/api/slugpedia/known-template-ids", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setKnownTemplateIds(new Set(data.templateIds || [])))
      .catch(() => {});
  }, [authHeaders]);

  useEffect(() => {
    loadNpcs();
    loadGrunts();
    loadParty();
    loadKnown();
    fetch("/api/slug-templates/gallery", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setGallery(data.templates || []))
      .catch(() => {});
    if (isDungeonMaster) {
      fetch("/api/slug-templates", { headers: authHeaders() })
        .then((res) => res.json())
        .then((data) => setSlugTemplates(data.templates || []))
        .catch(() => {});
      fetch("/api/blaster-templates", { headers: authHeaders() })
        .then((res) => res.json())
        .then((data) => setBlasterTemplates(data.templates || []))
        .catch(() => {});
      fetch("/api/mecha-templates", { headers: authHeaders() })
        .then((res) => res.json())
        .then((data) => setMechaTemplates(data.templates || []))
        .catch(() => {});
    }
  }, [authHeaders, isDungeonMaster, loadNpcs, loadGrunts, loadParty, loadKnown]);

  useEffect(() => {
    if (npcTemplatesUpdate) loadNpcs();
  }, [npcTemplatesUpdate, loadNpcs]);
  useEffect(() => {
    if (gruntTemplatesUpdate) loadGrunts();
  }, [gruntTemplatesUpdate, loadGrunts]);
  useEffect(() => {
    if (characterUpdate || characterCreated || slugUpdate || partyHealed) loadParty();
  }, [characterUpdate, characterCreated, slugUpdate, partyHealed, loadParty]);
  useEffect(() => {
    if (slugpediaUpdate) loadKnown();
  }, [slugpediaUpdate, loadKnown]);

  const entries = useMemo(() => {
    if (segment === "party") return party.map(normPc);
    return npcs.map((t) => (isDungeonMaster ? normNpcDm(t) : normNpcPlayer(t)));
  }, [segment, party, npcs, isDungeonMaster]);

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    const def = FILTERS.find((f) => f.key === filter);
    if (!def) return entries;
    return entries.filter((e) => {
      if (def.statuses) return def.statuses.includes(e.status);
      if (def.rels) return def.rels.includes(e.relationship);
      return true;
    });
  }, [entries, filter]);

  const filteredGrunts = useMemo(() => {
    const def = FILTERS.find((f) => f.key === filter);
    if (!def || !def.rels) return grunts; // "all" and status-only filters don't narrow grunts
    return grunts.filter((g) => def.rels.includes(g.relationship || "Enemy"));
  }, [grunts, filter]);

  // --- DM actions -----------------------------------------------------------
  async function createNpc(payload) {
    const res = await fetch("/api/npc-templates", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not create the card.");
    setModal(null);
    loadNpcs();
  }
  async function updateNpc(id, payload) {
    const res = await fetch(`/api/npc-templates/${id}`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not update the card.");
    setModal(null);
    loadNpcs();
  }
  async function deleteNpc(id) {
    const entry = npcs.find((n) => n.id === id);
    if (!window.confirm(`Delete ${entry?.name || "this card"} from the Chronicle? This can't be undone.`)) return;
    await fetch(`/api/npc-templates/${id}`, { method: "DELETE", headers: authHeaders() });
    setModal(null);
    loadNpcs();
  }
  async function createGrunt(payload) {
    const res = await fetch("/api/grunt-templates", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not create the grunt.");
    setModal(null);
    loadGrunts();
  }
  async function updateGrunt(id, payload) {
    const res = await fetch(`/api/grunt-templates/${id}`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not update the grunt.");
    setModal(null);
    loadGrunts();
  }
  async function deleteGrunt(id) {
    const entry = grunts.find((g) => g.id === id);
    if (!window.confirm(`Delete ${entry?.name || "this grunt"}? This can't be undone.`)) return;
    await fetch(`/api/grunt-templates/${id}`, { method: "DELETE", headers: authHeaders() });
    setModal(null);
    loadGrunts();
  }

  async function toggleReveal(entry) {
    const nextRevealed = !entry.revealed;
    setNpcs((prev) => prev.map((n) => (n.id === entry.id ? { ...n, revealed: nextRevealed } : n)));
    try {
      const res = await fetch(`/api/npc-templates/${entry.id}/reveal`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ revealed: nextRevealed }),
      });
      if (res.ok) loadNpcs();
    } catch {
      loadNpcs();
    }
  }
  async function patchProfile(id, patch) {
    try {
      const res = await fetch(`/api/npc-templates/${id}/profile`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ profile: patch }),
      });
      if (res.ok) loadNpcs();
    } catch {
      loadNpcs();
    }
  }

  // --- shared: collective slug guesses ------------------------------------
  async function toggleGuess(npcId, slugTemplateId) {
    setNpcs((prev) =>
      prev.map((n) => {
        if (n.id !== npcId) return n;
        const has = (n.guessedSlugTemplateIds || []).includes(slugTemplateId);
        return {
          ...n,
          guessedSlugTemplateIds: has
            ? n.guessedSlugTemplateIds.filter((x) => x !== slugTemplateId)
            : [...(n.guessedSlugTemplateIds || []), slugTemplateId],
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
        setNpcs((prev) =>
          prev.map((n) => (n.id === npcId ? { ...n, guessedSlugTemplateIds: data.guessedSlugTemplateIds } : n))
        );
      }
    } catch {
      /* optimistic update stands; a later toggle or broadcast reconciles */
    }
  }

  const guessableGallery = gallery.filter((t) => knownTemplateIds.has(t.id));
  const editingRaw = modal?.type === "edit" ? npcs.find((n) => n.id === modal.id) : null;
  const editingGrunt = modal?.type === "grunt" && modal.id != null ? grunts.find((g) => g.id === modal.id) : null;
  const guessingNpc =
    modal?.type === "guess"
      ? (isDungeonMaster ? npcs.map(normNpcDm) : npcs.map(normNpcPlayer)).find((n) => n.id === modal.id)
      : null;

  return (
    <div className="chronicle">
      <div className="chronicle-toolbar">
        <div className="chronicle-segment" role="tablist" aria-label="Chronicle segment" ref={segmentRef}>
          {thumb && (
            <span
              className="chronicle-segment-thumb"
              aria-hidden="true"
              style={{ transform: `translateX(${thumb.left}px)`, width: `${thumb.width}px` }}
            />
          )}
          <button role="tab" aria-selected={segment === "met"} onClick={() => changeView({ segment: "met" })}>
            Met
          </button>
          <button role="tab" aria-selected={segment === "party"} onClick={() => changeView({ segment: "party" })}>
            Party
          </button>
          {isDungeonMaster && (
            <button role="tab" aria-selected={segment === "grunts"} onClick={() => changeView({ segment: "grunts" })}>
              Grunts
            </button>
          )}
        </div>

        <div className="chronicle-chips" aria-label="Filter">
          {FILTERS
            // Grunts carry a relationship but no life status, so drop the
            // status-only filter from their chip row.
            .filter((f) => segment !== "grunts" || f.key === "all" || f.rels)
            .map((f) => (
              <button
                key={f.key}
                type="button"
                className="chronicle-chip"
                aria-pressed={filter === f.key}
                onClick={() => changeView({ filter: f.key })}
              >
                {f.dot && <span className="chronicle-chip-dot" style={{ "--dot": f.dot }} />}
                {f.label}
              </button>
            ))}
        </div>

        {isDungeonMaster && segment === "met" && (
          <button type="button" className="chronicle-new" onClick={() => setModal({ type: "new" })}>
            <PlusIcon weight="bold" /> New character
          </button>
        )}
        {isDungeonMaster && segment === "grunts" && (
          <button type="button" className="chronicle-new" onClick={() => setModal({ type: "grunt" })}>
            <PlusIcon weight="bold" /> New grunt
          </button>
        )}
      </div>

      <div className={`chronicle-view ${gridPhase === "out" ? "is-leaving" : "is-entering"}`}>
      {segment === "grunts" ? (
        grunts.length === 0 ? (
          <p className="chronicle-empty">No grunts yet. Add a minion type the party keeps running into.</p>
        ) : filteredGrunts.length === 0 ? (
          <p className="chronicle-empty">No grunts match this filter.</p>
        ) : (
          <div className="chronicle-grid">
            {filteredGrunts.map((g, i) => (
              <div key={g.id} className="chronicle-cell" style={{ "--i": i }}>
                <div className="chronicle-grunt-card" style={{ "--rel": relDot(g.relationship) }}>
                  {g.image ? (
                    <img className="chronicle-grunt-img" src={g.image} alt="" />
                  ) : (
                    <div className="chronicle-grunt-img chronicle-grunt-img--blank" />
                  )}
                  <div className="chronicle-grunt-name">{g.name}</div>
                  <div className="chronicle-grunt-rel">
                    <span className="chronicle-grunt-rel-dot" />
                    {g.relationship || "Enemy"}
                  </div>
                  <div className="chronicle-grunt-meta">
                    {g.slugTemplateIds.length} slug{g.slugTemplateIds.length === 1 ? "" : "s"} ·{" "}
                    {g.blasterTemplateIds.length} blaster{g.blasterTemplateIds.length === 1 ? "" : "s"} in pool
                  </div>
                </div>
                <div className="chronicle-cell-actions">
                  <button type="button" className="chronicle-cell-btn" onClick={() => setModal({ type: "grunt", id: g.id })}>
                    <PencilSimpleIcon weight="bold" /> Edit
                  </button>
                  <button
                    type="button"
                    className="chronicle-cell-btn chronicle-cell-btn--danger"
                    onClick={() => deleteGrunt(g.id)}
                  >
                    <TrashIcon weight="bold" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <p className="chronicle-empty">
          {segment === "party"
            ? "No player characters yet."
            : isDungeonMaster
              ? "No cards yet. Add the first person the party has met."
              : "Your Dungeon Master hasn't revealed anyone yet."}
        </p>
      ) : (
        <div className="chronicle-grid">
          {filtered.map((entry, i) => (
            <div
              key={entry.key}
              className={`chronicle-cell ${entry.kind === "npc" && !entry.revealed ? "chronicle-cell--hidden" : ""}`}
              style={{ "--i": i }}
            >
              <ChronicleCard
                entry={entry}
                dm={isDungeonMaster && entry.kind === "npc"}
                onReveal={entry.kind === "npc" ? (patch) => patchProfile(entry.id, patch) : undefined}
              />

              {isDungeonMaster && entry.kind === "npc" && (
                <div className="chronicle-cell-actions">
                  <button
                    type="button"
                    className={`chronicle-cell-btn ${entry.revealed ? "chronicle-cell-btn--reveal-on" : ""}`}
                    onClick={() => toggleReveal(entry)}
                    title={entry.revealed ? "Revealed to players" : "Hidden from players"}
                  >
                    {entry.revealed ? <EyeIcon weight="bold" /> : <EyeSlashIcon weight="bold" />}
                    {entry.revealed ? "Revealed" : "Hidden"}
                  </button>
                  <button type="button" className="chronicle-cell-btn" onClick={() => setModal({ type: "edit", id: entry.id })}>
                    <PencilSimpleIcon weight="bold" /> Edit
                  </button>
                  <button
                    type="button"
                    className="chronicle-cell-btn"
                    onClick={() => setModal({ type: "guess", id: entry.id })}
                    title="View / edit slug guesses"
                  >
                    Guesses
                  </button>
                  <button
                    type="button"
                    className="chronicle-cell-btn chronicle-cell-btn--danger"
                    onClick={() => deleteNpc(entry.id)}
                  >
                    <TrashIcon weight="bold" />
                  </button>
                </div>
              )}

              {!isDungeonMaster && entry.kind === "npc" && (
                <>
                  <button
                    type="button"
                    className="chronicle-cell-btn chronicle-cell-btn--guess"
                    onClick={() => setModal({ type: "guess", id: entry.id })}
                  >
                    Guess its slugs
                  </button>
                  {entry.guessedSlugTemplateIds.length > 0 && (
                    <div className="chronicle-guessed">
                      <NpcGuessedChips gallery={gallery} guessedIds={entry.guessedSlugTemplateIds} />
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
      </div>

      {modal?.type && modal.type !== "guess" && modal.type !== "grunt" && (
        <div className="slug-modal-backdrop" onClick={() => setModal(null)}>
          <div className="slug-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{modal.type === "new" ? "New character" : `Edit ${editingRaw?.name || ""}`}</h2>
            {(modal.type === "new" || editingRaw) && (
              <ChronicleForm
                key={modal.type === "edit" ? editingRaw.id : "new"}
                initialValues={modal.type === "edit" ? editingRaw : undefined}
                slugTemplates={slugTemplates}
                blasterTemplates={blasterTemplates}
                mechaTemplates={mechaTemplates}
                onSubmit={modal.type === "new" ? createNpc : (payload) => updateNpc(editingRaw.id, payload)}
                onCancel={() => setModal(null)}
                submitLabel={modal.type === "new" ? "Create card" : "Save card"}
              />
            )}
          </div>
        </div>
      )}

      {modal?.type === "grunt" && (modal.id == null || editingGrunt) && (
        <div className="slug-modal-backdrop" onClick={() => setModal(null)}>
          <div className="slug-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{modal.id == null ? "New grunt" : `Edit ${editingGrunt?.name || ""}`}</h2>
            <GruntForm
              key={modal.id ?? "new"}
              initialValues={editingGrunt || undefined}
              slugTemplates={slugTemplates}
              blasterTemplates={blasterTemplates}
              onSubmit={modal.id == null ? createGrunt : (payload) => updateGrunt(editingGrunt.id, payload)}
              onCancel={() => setModal(null)}
              submitLabel={modal.id == null ? "Create grunt" : "Save grunt"}
            />
          </div>
        </div>
      )}

      {modal?.type === "guess" && guessingNpc && (
        <div className="slug-modal-backdrop" onClick={() => setModal(null)}>
          <div className="slug-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{guessingNpc.name}: what is it carrying?</h2>
            <p className="chronicle-modal-guess-hint">
              Everyone at the table sees and can change these picks. Only slugs the party has already seen can be
              guessed.
            </p>
            <NpcGuessedChips
              gallery={gallery}
              guessedIds={guessingNpc.guessedSlugTemplateIds}
              onRemove={(id) => toggleGuess(guessingNpc.id, id)}
              emptyText="No guesses yet."
            />
            <div className="chronicle-modal-guesses">
              <label>Add a guess</label>
              {guessableGallery.length === 0 ? (
                <p className="slug-management-empty">The party hasn't seen any slugs yet.</p>
              ) : (
                <NpcSlugGuesses
                  gallery={guessableGallery}
                  guessedIds={guessingNpc.guessedSlugTemplateIds}
                  onToggle={(id) => toggleGuess(guessingNpc.id, id)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
