import { useEffect, useState } from "react";
import { PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import NpcCard from "./NpcCard.jsx";
import NpcForm from "./NpcForm.jsx";
import "./SlugManagement.css";

export default function NpcManagement() {
  const { token } = useAuth();
  const [npcs, setNpcs] = useState([]);
  const [slugTemplates, setSlugTemplates] = useState([]);
  const [blasterTemplates, setBlasterTemplates] = useState([]);
  const [mechaTemplates, setMechaTemplates] = useState([]);
  const [modal, setModal] = useState(null);

  function authHeaders(extra) {
    return { Authorization: `Bearer ${token}`, ...extra };
  }

  function loadNpcs() {
    fetch("/api/npc-templates", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setNpcs(data.templates || []))
      .catch(() => {});
  }

  useEffect(() => {
    loadNpcs();
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
  }, [token]);

  async function createNpc(payload) {
    const res = await fetch("/api/npc-templates", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not create NPC.");
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
    if (!res.ok) throw new Error(data.error || "Could not update NPC.");
    setModal(null);
    loadNpcs();
  }

  async function deleteNpc(id) {
    await fetch(`/api/npc-templates/${id}`, { method: "DELETE", headers: authHeaders() });
    setModal(null);
    loadNpcs();
  }

  return (
    <div className="slug-management">
      <section className="slug-management-section">
        <div className="slug-management-section-header">
          <h2>NPC Roster</h2>
          <button type="button" className="slug-management-new" onClick={() => setModal({ type: "new" })}>
            <PlusIcon weight="bold" />
            New NPC
          </button>
        </div>

        {npcs.length === 0 ? (
          <p className="slug-management-empty">No NPCs yet. Create one, then pull it into combat from the Combat page.</p>
        ) : (
          <div className="slug-management-grid">
            {npcs.map((npc) => (
              <NpcCard
                key={npc.id}
                npc={npc}
                mechaTemplates={mechaTemplates}
                onClick={() => setModal({ type: "edit", npc })}
                actions={
                  <>
                    <button type="button" className="slug-management-icon-btn" onClick={() => setModal({ type: "edit", npc })} title="Edit">
                      <PencilSimpleIcon weight="bold" />
                    </button>
                    <button
                      type="button"
                      className="slug-management-icon-btn slug-management-icon-btn--danger"
                      onClick={() => deleteNpc(npc.id)}
                      title="Delete"
                    >
                      <TrashIcon weight="bold" />
                    </button>
                  </>
                }
              />
            ))}
          </div>
        )}
      </section>

      {modal && (
        <div className="slug-modal-backdrop" onClick={() => setModal(null)}>
          <div className="slug-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{modal.type === "new" ? "New NPC" : `Edit ${modal.npc.name}`}</h2>
            <NpcForm
              initialValues={modal.type === "edit" ? modal.npc : undefined}
              slugTemplates={slugTemplates}
              blasterTemplates={blasterTemplates}
              mechaTemplates={mechaTemplates}
              onSubmit={modal.type === "new" ? createNpc : (payload) => updateNpc(modal.npc.id, payload)}
              onCancel={() => setModal(null)}
              submitLabel={modal.type === "new" ? "Create NPC" : "Save NPC"}
            />
            {modal.type === "edit" && (
              <button type="button" className="slug-management-remove" onClick={() => deleteNpc(modal.npc.id)}>
                <TrashIcon weight="bold" />
                Delete NPC
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
