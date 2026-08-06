import { useEffect, useState } from "react";
import { PencilSimpleIcon, PlusIcon, TrashIcon, UserPlusIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import MechaCard from "./MechaCard.jsx";
import MechaModCard from "./MechaModCard.jsx";
import MechaForm from "./MechaForm.jsx";
import MechaModForm from "./MechaModForm.jsx";
import "./SlugManagement.css";

export default function MechaManagement() {
  const { token } = useAuth();
  const [mechaTemplates, setMechaTemplates] = useState([]);
  const [modTemplates, setModTemplates] = useState([]);
  const [players, setPlayers] = useState([]);
  const [mechas, setMechas] = useState([]);
  const [mods, setMods] = useState([]);
  const [modal, setModal] = useState(null);

  function authHeaders(extra) {
    return { Authorization: `Bearer ${token}`, ...extra };
  }

  function loadMechaTemplates() {
    fetch("/api/mecha-templates", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setMechaTemplates(data.templates || []))
      .catch(() => {});
  }

  function loadModTemplates() {
    fetch("/api/mecha-mod-templates", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setModTemplates(data.templates || []))
      .catch(() => {});
  }

  function loadMechas() {
    fetch("/api/mechas", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setMechas(data.mechas || []))
      .catch(() => {});
  }

  function loadMods() {
    fetch("/api/mecha-mods", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setMods(data.mods || []))
      .catch(() => {});
  }

  useEffect(() => {
    loadMechaTemplates();
    loadModTemplates();
    loadMechas();
    loadMods();
    fetch("/api/admin/users", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setPlayers((data.users || []).filter((u) => u.role === "Player")))
      .catch(() => {});
  }, [token]);

  async function submitJson(url, method, payload) {
    const res = await fetch(url, {
      method,
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  async function createMechaTemplate(payload) {
    await submitJson("/api/mecha-templates", "POST", payload);
    setModal(null);
    loadMechaTemplates();
  }

  async function updateMechaTemplate(id, payload) {
    await submitJson(`/api/mecha-templates/${id}`, "PATCH", payload);
    setModal(null);
    loadMechaTemplates();
  }

  async function deleteMechaTemplate(id) {
    await fetch(`/api/mecha-templates/${id}`, { method: "DELETE", headers: authHeaders() });
    loadMechaTemplates();
  }

  async function assignMecha(payload) {
    await submitJson("/api/mechas", "POST", payload);
    setModal(null);
    loadMechas();
  }

  async function updateMechaInstance(id, payload) {
    await submitJson(`/api/mechas/${id}`, "PATCH", payload);
    setModal(null);
    loadMechas();
  }

  async function deleteMechaInstance(id) {
    await fetch(`/api/mechas/${id}`, { method: "DELETE", headers: authHeaders() });
    setModal(null);
    loadMechas();
    loadMods();
  }

  async function createModTemplate(payload) {
    await submitJson("/api/mecha-mod-templates", "POST", payload);
    setModal(null);
    loadModTemplates();
  }

  async function updateModTemplate(id, payload) {
    await submitJson(`/api/mecha-mod-templates/${id}`, "PATCH", payload);
    setModal(null);
    loadModTemplates();
  }

  async function deleteModTemplate(id) {
    await fetch(`/api/mecha-mod-templates/${id}`, { method: "DELETE", headers: authHeaders() });
    loadModTemplates();
  }

  async function assignMod(payload) {
    await submitJson("/api/mecha-mods", "POST", payload);
    setModal(null);
    loadMods();
  }

  async function updateModInstance(id, payload) {
    await submitJson(`/api/mecha-mods/${id}`, "PATCH", payload);
    setModal(null);
    loadMods();
  }

  async function deleteModInstance(id) {
    await fetch(`/api/mecha-mods/${id}`, { method: "DELETE", headers: authHeaders() });
    setModal(null);
    loadMods();
  }

  const inventoryByPlayer = players.map((player) => ({
    player,
    mechas: mechas.filter((m) => m.userId === player.id),
    mods: mods.filter((m) => m.userId === player.id),
  }));

  return (
    <div className="slug-management">
      <section className="slug-management-section">
        <div className="slug-management-section-header">
          <h2>Mecha-Beast Templates</h2>
          <button type="button" className="slug-management-new" onClick={() => setModal({ type: "new-mecha-template" })}>
            <PlusIcon weight="bold" />
            New Mecha
          </button>
        </div>

        {mechaTemplates.length === 0 ? (
          <p className="slug-management-empty">No mecha templates yet.</p>
        ) : (
          <div className="slug-management-grid">
            {mechaTemplates.map((template) => (
              <MechaCard
                key={template.id}
                mecha={template}
                onClick={() => setModal({ type: "edit-mecha-template", template })}
                actions={
                  <>
                    <button
                      type="button"
                      className="slug-management-icon-btn"
                      onClick={() => setModal({ type: "assign-mecha", template })}
                      title="Assign to player"
                    >
                      <UserPlusIcon weight="bold" />
                    </button>
                    <button
                      type="button"
                      className="slug-management-icon-btn slug-management-icon-btn--danger"
                      onClick={() => deleteMechaTemplate(template.id)}
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
      </section>

      <section className="slug-management-section">
        <div className="slug-management-section-header">
          <h2>Mecha Mod Templates</h2>
          <button type="button" className="slug-management-new" onClick={() => setModal({ type: "new-mod-template" })}>
            <PlusIcon weight="bold" />
            New Mod
          </button>
        </div>

        {modTemplates.length === 0 ? (
          <p className="slug-management-empty">No mecha mod templates yet.</p>
        ) : (
          <div className="slug-management-grid">
            {modTemplates.map((template) => (
              <MechaModCard
                key={template.id}
                mod={template}
                actions={
                  <>
                    <button
                      type="button"
                      className="slug-management-icon-btn"
                      onClick={() => setModal({ type: "assign-mod", template })}
                      title="Assign to player"
                    >
                      <UserPlusIcon weight="bold" />
                    </button>
                    <button
                      type="button"
                      className="slug-management-icon-btn"
                      onClick={() => setModal({ type: "edit-mod-template", template })}
                      title="Edit template"
                    >
                      <PencilSimpleIcon weight="bold" />
                    </button>
                    <button
                      type="button"
                      className="slug-management-icon-btn slug-management-icon-btn--danger"
                      onClick={() => deleteModTemplate(template.id)}
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
      </section>

      <section className="slug-management-section">
        <h2>Players &amp; Their Mecha-Beasts</h2>
        {players.length === 0 ? (
          <p className="slug-management-empty">No players yet.</p>
        ) : (
          <div className="slug-management-players">
            {inventoryByPlayer.map(({ player, mechas: playerMechas, mods: playerMods }) => (
              <div className="slug-management-player" key={player.id}>
                <h3>{player.username}</h3>
                {playerMechas.length === 0 && playerMods.length === 0 ? (
                  <p className="slug-management-empty">No mecha-beasts assigned.</p>
                ) : (
                  <div className="slug-management-grid">
                    {playerMechas.map((mecha) => (
                      <MechaCard
                        key={`mecha-${mecha.id}`}
                        mecha={mecha}
                        equippedMods={mods.filter((m) => m.equippedMechaId === mecha.id)}
                        onClick={() => setModal({ type: "edit-mecha-instance", mecha })}
                      />
                    ))}
                    {playerMods.map((mod) => (
                      <MechaModCard
                        key={`mod-${mod.id}`}
                        mod={mod}
                        mechas={playerMechas}
                        onClick={() => setModal({ type: "edit-mod-instance", mod })}
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
              {modal.type === "new-mecha-template" && "New Mecha Template"}
              {modal.type === "edit-mecha-template" && "Edit Mecha Template"}
              {modal.type === "assign-mecha" && `Assign "${modal.template.name}"`}
              {modal.type === "edit-mecha-instance" && `Edit ${modal.mecha.name}`}
              {modal.type === "new-mod-template" && "New Mecha Mod Template"}
              {modal.type === "edit-mod-template" && "Edit Mecha Mod Template"}
              {modal.type === "assign-mod" && `Assign "${modal.template.name}"`}
              {modal.type === "edit-mod-instance" && `Edit ${modal.mod.name}`}
            </h2>

            {modal.type === "new-mecha-template" && (
              <MechaForm mode="template" onSubmit={createMechaTemplate} onCancel={() => setModal(null)} submitLabel="Create Mecha" />
            )}
            {modal.type === "edit-mecha-template" && (
              <MechaForm
                mode="template"
                initialValues={modal.template}
                onSubmit={(payload) => updateMechaTemplate(modal.template.id, payload)}
                onCancel={() => setModal(null)}
                submitLabel="Save Mecha"
              />
            )}
            {modal.type === "assign-mecha" && (
              <MechaForm
                mode="assign"
                initialValues={{ ...modal.template, templateId: modal.template.id }}
                players={players}
                onSubmit={assignMecha}
                onCancel={() => setModal(null)}
                submitLabel="Assign Mecha"
              />
            )}
            {modal.type === "edit-mecha-instance" && (
              <>
                <MechaForm
                  mode="instance"
                  initialValues={modal.mecha}
                  onSubmit={(payload) => updateMechaInstance(modal.mecha.id, payload)}
                  onCancel={() => setModal(null)}
                  submitLabel="Save Mecha"
                />
                <button type="button" className="slug-management-remove" onClick={() => deleteMechaInstance(modal.mecha.id)}>
                  <TrashIcon weight="bold" />
                  Remove from Player
                </button>
              </>
            )}

            {modal.type === "new-mod-template" && (
              <MechaModForm mode="template" onSubmit={createModTemplate} onCancel={() => setModal(null)} submitLabel="Create Mod" />
            )}
            {modal.type === "edit-mod-template" && (
              <MechaModForm
                mode="template"
                initialValues={modal.template}
                onSubmit={(payload) => updateModTemplate(modal.template.id, payload)}
                onCancel={() => setModal(null)}
                submitLabel="Save Mod"
              />
            )}
            {modal.type === "assign-mod" && (
              <MechaModForm
                mode="assign"
                initialValues={{ ...modal.template, templateId: modal.template.id }}
                players={players}
                onSubmit={assignMod}
                onCancel={() => setModal(null)}
                submitLabel="Assign Mod"
              />
            )}
            {modal.type === "edit-mod-instance" && (
              <>
                <MechaModForm
                  mode="instance"
                  initialValues={modal.mod}
                  onSubmit={(payload) => updateModInstance(modal.mod.id, payload)}
                  onCancel={() => setModal(null)}
                  submitLabel="Save Mod"
                />
                <button type="button" className="slug-management-remove" onClick={() => deleteModInstance(modal.mod.id)}>
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
