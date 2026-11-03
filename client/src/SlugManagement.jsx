import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlassIcon, SparkleIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import SlugCard from "./SlugCard.jsx";
import SlugForm from "./SlugForm.jsx";
import SlugCatalog from "./SlugCatalog.jsx";
import { NarrowSwitch, QuickRemove, RecipientRail, useRecipient, useStatus } from "./DeskParts.jsx";
import { defaultSlugFields } from "./slugData.js";
import "./SlugManagement.css";
import "./InventoryDesk.css";

// One player's slugs, with the per-slug Mega Morph permission on each card.
function PlayerSlugPanel({ recipient, slugs, onEdit, onToggleMega, onRemove }) {
  const [query, setQuery] = useState("");

  if (!recipient) {
    return (
      <section className="desk-satchel desk-satchel--empty" aria-label="Slugs">
        <p className="desk-satchel-hint">No players yet. Once someone joins, you can hand them slugs from the catalog.</p>
      </section>
    );
  }

  const q = query.trim().toLowerCase();
  const shown = q ? slugs.filter((s) => s.name.toLowerCase().includes(q) || s.type.toLowerCase().includes(q)) : slugs;
  const megaCount = slugs.filter((s) => s.megaMorphAllowed).length;

  return (
    <section className="desk-satchel" aria-label={`${recipient.name}'s slugs`}>
      <header className="desk-satchel-head">
        <div className="desk-satchel-who">
          <h2>{recipient.name}</h2>
        </div>
        {slugs.length > 6 && (
          <label className="desk-search desk-search--head">
            <MagnifyingGlassIcon weight="bold" aria-hidden="true" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find one of theirs" aria-label={`Search ${recipient.name}'s slugs`} />
          </label>
        )}
        <p className="desk-satchel-meta">
          {slugs.length === 0 ? "No slugs yet" : `${slugs.length} ${slugs.length === 1 ? "slug" : "slugs"}`}
          {megaCount > 0 && ` · ${megaCount} can Mega Morph`}
        </p>
      </header>

      {slugs.length === 0 ? (
        <div className="desk-empty desk-empty--big">
          <p>{recipient.name} has no slugs.</p>
          <p>Pick one from the catalog and press Give.</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="desk-empty">
          <p>None of {recipient.name}'s slugs match "{query.trim()}".</p>
        </div>
      ) : (
        <div className="desk-cards">
          {shown.map((slug) => (
            <SlugCard
              key={slug.id}
              slug={slug}
              onClick={() => onEdit(slug)}
              actions={
                <div className="desk-card-actions">
                  <QuickRemove name={slug.name} onRemove={() => onRemove(slug)} />
                  <button
                    type="button"
                    className={`slug-management-mega-toggle ${slug.megaMorphAllowed ? "slug-management-mega-toggle--on" : ""}`}
                    aria-pressed={Boolean(slug.megaMorphAllowed)}
                    onClick={() => onToggleMega(slug)}
                    title={slug.megaMorphAllowed ? "This slug can Mega Morph in combat -- click to revoke" : "Allow this slug to Mega Morph in combat"}
                  >
                    <SparkleIcon weight={slug.megaMorphAllowed ? "fill" : "bold"} />
                    {slug.megaMorphAllowed ? "Can Mega Morph" : "Allow Mega Morph"}
                  </button>
                </div>
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

// The DM's slug desk: pick who you are giving to, hand them slugs from the
// catalog in one click, and see their roster beside it.
export default function SlugManagement() {
  const { token } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [players, setPlayers] = useState([]);
  const [slugs, setSlugs] = useState([]);
  const [modal, setModal] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [narrowView, setNarrowView] = useState("catalog");
  const [status, setStatus] = useStatus();

  function authHeaders(extra) {
    return { Authorization: `Bearer ${token}`, ...extra };
  }

  function loadTemplates() {
    fetch("/api/slug-templates", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setTemplates(data.templates || []))
      .catch(() => {});
  }

  function loadSlugs() {
    fetch("/api/slugs", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setSlugs(data.slugs || []))
      .catch(() => {});
  }

  // Slugs earn loyalty as they're fired: refetch so the shot counts stay current.
  const { slugLoyaltyChanged } = useLiveState();
  useEffect(() => {
    if (slugLoyaltyChanged) loadSlugs();
  }, [slugLoyaltyChanged]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadTemplates();
    loadSlugs();
    fetch("/api/admin/users", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setPlayers((data.users || []).filter((u) => u.role === "Player")))
      .catch(() => {});
  }, [token]);

  async function createTemplate(payload) {
    const res = await fetch("/api/slug-templates", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not create template.");
    setModal(null);
    loadTemplates();
  }

  async function updateTemplate(id, payload) {
    const res = await fetch(`/api/slug-templates/${id}`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not update template.");
    setModal(null);
    loadTemplates();
  }

  async function toggleMegaMorph(slug) {
    const res = await fetch(`/api/slugs/${slug.id}/mega-morph`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ allowed: !slug.megaMorphAllowed }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setSlugs((prev) => prev.map((s) => (s.id === data.slug.id ? data.slug : s)));
  }

  async function deleteTemplate(template) {
    await fetch(`/api/slug-templates/${template.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    loadTemplates();
  }

  async function removeAllTemplates() {
    if (templates.length === 0 || bulkBusy) return;
    const confirmed = window.confirm(
      `Delete all ${templates.length} slug templates AND every slug assigned to a player? This can't be undone -- ` +
        `any custom templates go with it, and the party's slugpedia is wiped along with it. ` +
        `You can re-import the default roster afterward.`
    );
    if (!confirmed) return;
    setBulkBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/slug-templates", { method: "DELETE", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove templates.");
      const slugCount = data.slugsDeletedCount ?? 0;
      setStatus({
        text:
          `Removed ${data.deletedCount} template${data.deletedCount === 1 ? "" : "s"} and ` +
          `${slugCount} player slug${slugCount === 1 ? "" : "s"}.`,
      });
      loadTemplates();
      loadSlugs();
    } catch (err) {
      setStatus({ text: err.message || "Could not remove templates.", error: true });
    } finally {
      setBulkBusy(false);
    }
  }

  async function importDefaultTemplates() {
    if (bulkBusy) return;
    setBulkBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/slug-templates/import-defaults", { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not import default slugs.");
      setStatus({
        text: data.seeded > 0 ? `Imported ${data.seeded} of ${data.total} default slugs.` : `All ${data.total} default slugs are already here.`,
      });
      setTemplates(data.templates);
    } catch (err) {
      setStatus({ text: err.message || "Could not import default slugs.", error: true });
    } finally {
      setBulkBusy(false);
    }
  }

  // TEST-ONLY: remove with the /api/slugs/test/* routes before production.
  async function giveRandomSlugs() {
    if (bulkBusy || players.length === 0) return;
    setBulkBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/slugs/test/give-random", { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not give random slugs.");
      setStatus({
        text:
          data.given > 0
            ? `Gave ${data.given} random slug${data.given === 1 ? "" : "s"} to ${data.players} player${data.players === 1 ? "" : "s"}.`
            : "Every equipped blaster slot is already full.",
      });
      loadSlugs();
    } catch (err) {
      setStatus({ text: err.message || "Could not give random slugs.", error: true });
    } finally {
      setBulkBusy(false);
    }
  }

  // TEST-ONLY: see giveRandomSlugs.
  async function removeAllPlayerSlugs() {
    if (bulkBusy || slugs.length === 0) return;
    if (!window.confirm(`Remove all ${slugs.length} slugs from every player? This can't be undone.`)) return;
    setBulkBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/slugs/test/player-slugs", { method: "DELETE", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove player slugs.");
      setStatus({ text: `Removed ${data.deletedCount} player slug${data.deletedCount === 1 ? "" : "s"}.` });
      loadSlugs();
    } catch (err) {
      setStatus({ text: err.message || "Could not remove player slugs.", error: true });
    } finally {
      setBulkBusy(false);
    }
  }

  async function postSlug(payload) {
    const res = await fetch("/api/slugs", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not assign slug.");
    loadSlugs();
  }

  async function assignSlug(payload) {
    await postSlug(payload);
    setModal(null);
  }

  async function updateSlugInstance(id, payload) {
    const res = await fetch(`/api/slugs/${id}`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not update slug.");
    setModal(null);
    loadSlugs();
  }

  async function removeSlug(slug) {
    await fetch(`/api/slugs/${slug.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    loadSlugs();
    setStatus({ text: `Took ${slug.name} from ${recipient?.name ?? "the player"}.` });
  }

  const roster = players.map((player) => ({ id: player.id, name: player.characterName || player.username }));
  const [recipient, chooseRecipient] = useRecipient(roster);
  const heldCount = (id) => slugs.filter((s) => s.userId === id).length;
  const held = useMemo(() => (recipient ? slugs.filter((s) => s.userId === recipient.id) : []), [slugs, recipient]);
  const heldByTemplate = useMemo(() => {
    const counts = new Map();
    for (const s of held) if (s.templateId != null) counts.set(s.templateId, (counts.get(s.templateId) ?? 0) + 1);
    return counts;
  }, [held]);

  // One click: hand a template to the chosen player exactly as it is.
  async function give(template) {
    if (!recipient) return false;
    try {
      await postSlug({ ...defaultSlugFields(), ...template, templateId: template.id, userId: recipient.id });
      setStatus({ text: `Gave ${template.name} to ${recipient.name}.` });
      return true;
    } catch (err) {
      setStatus({ text: err.message || "Could not give that slug.", error: true });
      return false;
    }
  }

  return (
    <div className="slug-management desk">
      <RecipientRail roster={roster} recipient={recipient} countFor={heldCount} onChoose={chooseRecipient} />
      <NarrowSwitch view={narrowView} onView={setNarrowView} recipient={recipient} count={held.length} noun="slugs" />

      <div className="desk-layout">
        <div className={`desk-pane desk-pane--catalog ${narrowView !== "catalog" ? "desk-pane--away" : ""}`}>
          <SlugCatalog
            templates={templates}
            recipient={recipient}
            heldByTemplate={heldByTemplate}
            status={status}
            bulk={{
              busy: bulkBusy,
              canGiveRandom: players.length > 0 && templates.length > 0,
              canRemovePlayerSlugs: slugs.length > 0,
              importDefaults: importDefaultTemplates,
              removeAll: removeAllTemplates,
              giveRandom: giveRandomSlugs,
              removePlayerSlugs: removeAllPlayerSlugs,
            }}
            onGive={give}
            onCustomize={(template) => setModal({ type: "assign", template })}
            onEdit={(template) => setModal({ type: "edit-template", template })}
            onDelete={deleteTemplate}
            onNew={() => setModal({ type: "new-template" })}
          />
        </div>
        <div className={`desk-pane desk-pane--gear ${narrowView !== "gear" ? "desk-pane--away" : ""}`}>
          <PlayerSlugPanel key={recipient?.id} recipient={recipient} slugs={held} onEdit={(slug) => setModal({ type: "edit-instance", slug })} onToggleMega={toggleMegaMorph} onRemove={removeSlug} />
        </div>
      </div>

      {modal && (
        <div className="slug-modal-backdrop" onClick={() => setModal(null)}>
          <div className="slug-modal" onClick={(e) => e.stopPropagation()}>
            <h2>
              {modal.type === "new-template" && "New Slug Template"}
              {modal.type === "edit-template" && "Edit Slug Template"}
              {modal.type === "assign" && `Assign "${modal.template.name}"`}
              {modal.type === "edit-instance" && `Edit ${modal.slug.name}`}
            </h2>

            {modal.type === "new-template" && (
              <SlugForm mode="template" onSubmit={createTemplate} onCancel={() => setModal(null)} submitLabel="Create Template" />
            )}
            {modal.type === "edit-template" && (
              <SlugForm
                mode="template"
                initialValues={modal.template}
                onSubmit={(payload) => updateTemplate(modal.template.id, payload)}
                onCancel={() => setModal(null)}
                submitLabel="Save Template"
              />
            )}
            {modal.type === "assign" && (
              <SlugForm
                mode="assign"
                initialValues={{ ...modal.template, templateId: modal.template.id }}
                players={players}
                defaultPlayerId={recipient?.id}
                onSubmit={assignSlug}
                onCancel={() => setModal(null)}
                submitLabel="Assign Slug"
              />
            )}
            {modal.type === "edit-instance" && (
              <SlugForm
                mode="instance"
                initialValues={modal.slug}
                slugId={modal.slug.id}
                onSubmit={(payload) => updateSlugInstance(modal.slug.id, payload)}
                onCancel={() => setModal(null)}
                submitLabel="Save Slug"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
