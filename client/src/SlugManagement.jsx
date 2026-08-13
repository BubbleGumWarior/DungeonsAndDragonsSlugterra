import { useEffect, useMemo, useState } from "react";
import { PlusIcon, TrashIcon, UserPlusIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import SlugCard from "./SlugCard.jsx";
import SlugForm from "./SlugForm.jsx";
import SlugToolbar, { filterTemplates, sortTemplates } from "./SlugToolbar.jsx";
import "./SlugManagement.css";

export default function SlugManagement() {
  const { token } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [players, setPlayers] = useState([]);
  const [slugs, setSlugs] = useState([]);
  const [modal, setModal] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedTypes, setSelectedTypes] = useState(() => new Set());
  const [selectedFlags, setSelectedFlags] = useState(() => new Set());
  const [sortKey, setSortKey] = useState("name-asc");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkStatus, setBulkStatus] = useState(null);

  function toggleType(type) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function toggleFlag(flag) {
    setSelectedFlags((prev) => {
      const next = new Set(prev);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      return next;
    });
  }

  function clearFilters() {
    setQuery("");
    setSelectedTypes(new Set());
    setSelectedFlags(new Set());
  }

  const visibleTemplates = useMemo(() => {
    const filtered = filterTemplates(templates, { query, types: selectedTypes, flags: selectedFlags });
    return sortTemplates(filtered, sortKey);
  }, [templates, query, selectedTypes, selectedFlags, sortKey]);

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

  async function deleteTemplate(id) {
    await fetch(`/api/slug-templates/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    loadTemplates();
  }

  async function removeAllTemplates() {
    if (templates.length === 0 || bulkBusy) return;
    const confirmed = window.confirm(
      `Delete all ${templates.length} slug templates? This can't be undone -- any custom templates go with it ` +
        `(slugs already assigned to players are unaffected, but the party's slugpedia is wiped along with it). ` +
        `You can re-import the default roster afterward.`
    );
    if (!confirmed) return;
    setBulkBusy(true);
    setBulkStatus(null);
    try {
      const res = await fetch("/api/slug-templates", { method: "DELETE", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove templates.");
      setBulkStatus(`Removed ${data.deletedCount} template${data.deletedCount === 1 ? "" : "s"}.`);
      loadTemplates();
    } catch (err) {
      setBulkStatus(err.message || "Could not remove templates.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function importDefaultTemplates() {
    if (bulkBusy) return;
    setBulkBusy(true);
    setBulkStatus(null);
    try {
      const res = await fetch("/api/slug-templates/import-defaults", { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not import default slugs.");
      setBulkStatus(
        data.seeded > 0
          ? `Imported ${data.seeded} of ${data.total} default slugs.`
          : `All ${data.total} default slugs are already here.`
      );
      setTemplates(data.templates);
    } catch (err) {
      setBulkStatus(err.message || "Could not import default slugs.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function assignSlug(payload) {
    const res = await fetch("/api/slugs", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not assign slug.");
    setModal(null);
    loadSlugs();
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

  async function deleteSlugInstance(id) {
    await fetch(`/api/slugs/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    setModal(null);
    loadSlugs();
  }

  const slugsByPlayer = players.map((player) => ({
    player,
    slugs: slugs.filter((s) => s.userId === player.id),
  }));

  return (
    <div className="slug-management">
      <section className="slug-management-section">
        <div className="slug-management-section-header">
          <h2>Slug Templates</h2>
          <div className="slug-management-header-actions">
            <button
              type="button"
              className="slug-management-ghost-btn"
              onClick={importDefaultTemplates}
              disabled={bulkBusy}
            >
              <DownloadSimpleIcon weight="bold" />
              Import Default Slugs
            </button>
            <button
              type="button"
              className="slug-management-ghost-btn slug-management-ghost-btn--danger"
              onClick={removeAllTemplates}
              disabled={bulkBusy || templates.length === 0}
            >
              <TrashIcon weight="bold" />
              Remove All
            </button>
            <button type="button" className="slug-management-new" onClick={() => setModal({ type: "new-template" })}>
              <PlusIcon weight="bold" />
              New Template
            </button>
          </div>
        </div>

        {bulkStatus && <p className="slug-management-bulk-status">{bulkStatus}</p>}

        {templates.length === 0 ? (
          <p className="slug-management-empty">No templates yet. Create one to start assigning slugs.</p>
        ) : (
          <>
            <SlugToolbar
              query={query}
              onQueryChange={setQuery}
              selectedTypes={selectedTypes}
              onToggleType={toggleType}
              selectedFlags={selectedFlags}
              onToggleFlag={toggleFlag}
              sortKey={sortKey}
              onSortChange={setSortKey}
              resultCount={visibleTemplates.length}
              totalCount={templates.length}
              onClear={clearFilters}
            />
            {visibleTemplates.length === 0 ? (
              <p className="slug-management-empty">No slugs match those filters.</p>
            ) : (
              <div className="slug-management-grid">
                {visibleTemplates.map((template) => (
                  <SlugCard
                    key={template.id}
                    slug={template}
                    onClick={() => setModal({ type: "edit-template", template })}
                    actions={
                      <>
                        <button
                          type="button"
                          className="slug-management-icon-btn"
                          onClick={() => setModal({ type: "assign", template })}
                          title="Assign to player"
                        >
                          <UserPlusIcon weight="bold" />
                        </button>
                        <button
                          type="button"
                          className="slug-management-icon-btn slug-management-icon-btn--danger"
                          onClick={() => deleteTemplate(template.id)}
                          title="Delete template"
                        >
                          <TrashIcon weight="bold" />
                        </button>
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="slug-management-section">
        <h2>Players &amp; Their Slugs</h2>
        {players.length === 0 ? (
          <p className="slug-management-empty">No players yet.</p>
        ) : (
          <div className="slug-management-players">
            {slugsByPlayer.map(({ player, slugs: playerSlugs }) => (
              <div className="slug-management-player" key={player.id}>
                <h3>{player.username}</h3>
                {playerSlugs.length === 0 ? (
                  <p className="slug-management-empty">No slugs assigned.</p>
                ) : (
                  <div className="slug-management-grid">
                    {playerSlugs.map((slug) => (
                      <SlugCard
                        key={slug.id}
                        slug={slug}
                        onClick={() => setModal({ type: "edit-instance", slug })}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

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
                onSubmit={assignSlug}
                onCancel={() => setModal(null)}
                submitLabel="Assign Slug"
              />
            )}
            {modal.type === "edit-instance" && (
              <>
                <SlugForm
                  mode="instance"
                  initialValues={modal.slug}
                  slugId={modal.slug.id}
                  onSubmit={(payload) => updateSlugInstance(modal.slug.id, payload)}
                  onCancel={() => setModal(null)}
                  submitLabel="Save Slug"
                />
                <button
                  type="button"
                  className="slug-management-remove"
                  onClick={() => deleteSlugInstance(modal.slug.id)}
                >
                  <TrashIcon weight="bold" />
                  Remove from Player
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
