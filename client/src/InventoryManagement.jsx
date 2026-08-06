import { useEffect, useState } from "react";
import { PencilSimpleIcon, PlusIcon, TrashIcon, UserPlusIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import BlasterCard from "./BlasterCard.jsx";
import ModCard from "./ModCard.jsx";
import BlasterForm from "./BlasterForm.jsx";
import ModForm from "./ModForm.jsx";
import "./SlugManagement.css";

export default function InventoryManagement() {
  const { token } = useAuth();
  const [blasterTemplates, setBlasterTemplates] = useState([]);
  const [modTemplates, setModTemplates] = useState([]);
  const [players, setPlayers] = useState([]);
  const [blasters, setBlasters] = useState([]);
  const [mods, setMods] = useState([]);
  const [modal, setModal] = useState(null);

  function authHeaders(extra) {
    return { Authorization: `Bearer ${token}`, ...extra };
  }

  function loadBlasterTemplates() {
    fetch("/api/blaster-templates", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setBlasterTemplates(data.templates || []))
      .catch(() => {});
  }

  function loadModTemplates() {
    fetch("/api/mod-templates", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setModTemplates(data.templates || []))
      .catch(() => {});
  }

  function loadBlasters() {
    fetch("/api/blasters", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setBlasters(data.blasters || []))
      .catch(() => {});
  }

  function loadMods() {
    fetch("/api/mods", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setMods(data.mods || []))
      .catch(() => {});
  }

  useEffect(() => {
    loadBlasterTemplates();
    loadModTemplates();
    loadBlasters();
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

  async function createBlasterTemplate(payload) {
    await submitJson("/api/blaster-templates", "POST", payload);
    setModal(null);
    loadBlasterTemplates();
  }

  async function updateBlasterTemplate(id, payload) {
    await submitJson(`/api/blaster-templates/${id}`, "PATCH", payload);
    setModal(null);
    loadBlasterTemplates();
  }

  async function deleteBlasterTemplate(id) {
    await fetch(`/api/blaster-templates/${id}`, { method: "DELETE", headers: authHeaders() });
    loadBlasterTemplates();
  }

  async function assignBlaster(payload) {
    await submitJson("/api/blasters", "POST", payload);
    setModal(null);
    loadBlasters();
  }

  async function updateBlasterInstance(id, payload) {
    await submitJson(`/api/blasters/${id}`, "PATCH", payload);
    setModal(null);
    loadBlasters();
  }

  async function deleteBlasterInstance(id) {
    await fetch(`/api/blasters/${id}`, { method: "DELETE", headers: authHeaders() });
    setModal(null);
    loadBlasters();
    loadMods();
  }

  async function createModTemplate(payload) {
    await submitJson("/api/mod-templates", "POST", payload);
    setModal(null);
    loadModTemplates();
  }

  async function updateModTemplate(id, payload) {
    await submitJson(`/api/mod-templates/${id}`, "PATCH", payload);
    setModal(null);
    loadModTemplates();
  }

  async function deleteModTemplate(id) {
    await fetch(`/api/mod-templates/${id}`, { method: "DELETE", headers: authHeaders() });
    loadModTemplates();
  }

  async function assignMod(payload) {
    await submitJson("/api/mods", "POST", payload);
    setModal(null);
    loadMods();
  }

  async function updateModInstance(id, payload) {
    await submitJson(`/api/mods/${id}`, "PATCH", payload);
    setModal(null);
    loadMods();
  }

  async function deleteModInstance(id) {
    await fetch(`/api/mods/${id}`, { method: "DELETE", headers: authHeaders() });
    setModal(null);
    loadMods();
  }

  const inventoryByPlayer = players.map((player) => ({
    player,
    blasters: blasters.filter((b) => b.userId === player.id),
    mods: mods.filter((m) => m.userId === player.id),
  }));

  return (
    <div className="slug-management">
      <section className="slug-management-section">
        <div className="slug-management-section-header">
          <h2>Blaster Templates</h2>
          <button type="button" className="slug-management-new" onClick={() => setModal({ type: "new-blaster-template" })}>
            <PlusIcon weight="bold" />
            New Blaster
          </button>
        </div>

        {blasterTemplates.length === 0 ? (
          <p className="slug-management-empty">No blaster templates yet.</p>
        ) : (
          <div className="slug-management-grid">
            {blasterTemplates.map((template) => (
              <BlasterCard
                key={template.id}
                blaster={template}
                onClick={() => setModal({ type: "edit-blaster-template", template })}
                actions={
                  <>
                    <button
                      type="button"
                      className="slug-management-icon-btn"
                      onClick={() => setModal({ type: "assign-blaster", template })}
                      title="Assign to player"
                    >
                      <UserPlusIcon weight="bold" />
                    </button>
                    <button
                      type="button"
                      className="slug-management-icon-btn slug-management-icon-btn--danger"
                      onClick={() => deleteBlasterTemplate(template.id)}
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
          <h2>Mod Templates</h2>
          <button type="button" className="slug-management-new" onClick={() => setModal({ type: "new-mod-template" })}>
            <PlusIcon weight="bold" />
            New Mod
          </button>
        </div>

        {modTemplates.length === 0 ? (
          <p className="slug-management-empty">No mod templates yet.</p>
        ) : (
          <div className="slug-management-grid">
            {modTemplates.map((template) => (
              <ModCard
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
        <h2>Players &amp; Their Inventory</h2>
        {players.length === 0 ? (
          <p className="slug-management-empty">No players yet.</p>
        ) : (
          <div className="slug-management-players">
            {inventoryByPlayer.map(({ player, blasters: playerBlasters, mods: playerMods }) => (
              <div className="slug-management-player" key={player.id}>
                <h3>{player.username}</h3>
                {playerBlasters.length === 0 && playerMods.length === 0 ? (
                  <p className="slug-management-empty">No items assigned.</p>
                ) : (
                  <div className="slug-management-grid">
                    {playerBlasters.map((blaster) => (
                      <BlasterCard
                        key={`blaster-${blaster.id}`}
                        blaster={blaster}
                        equippedMods={mods.filter((m) => m.equippedBlasterId === blaster.id)}
                        onClick={() => setModal({ type: "edit-blaster-instance", blaster })}
                      />
                    ))}
                    {playerMods.map((mod) => (
                      <ModCard key={`mod-${mod.id}`} mod={mod} blasters={playerBlasters} onClick={() => setModal({ type: "edit-mod-instance", mod })} />
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
              {modal.type === "new-blaster-template" && "New Blaster Template"}
              {modal.type === "edit-blaster-template" && "Edit Blaster Template"}
              {modal.type === "assign-blaster" && `Assign "${modal.template.name}"`}
              {modal.type === "edit-blaster-instance" && `Edit ${modal.blaster.name}`}
              {modal.type === "new-mod-template" && "New Mod Template"}
              {modal.type === "edit-mod-template" && "Edit Mod Template"}
              {modal.type === "assign-mod" && `Assign "${modal.template.name}"`}
              {modal.type === "edit-mod-instance" && `Edit ${modal.mod.name}`}
            </h2>

            {modal.type === "new-blaster-template" && (
              <BlasterForm mode="template" onSubmit={createBlasterTemplate} onCancel={() => setModal(null)} submitLabel="Create Blaster" />
            )}
            {modal.type === "edit-blaster-template" && (
              <BlasterForm
                mode="template"
                initialValues={modal.template}
                onSubmit={(payload) => updateBlasterTemplate(modal.template.id, payload)}
                onCancel={() => setModal(null)}
                submitLabel="Save Blaster"
              />
            )}
            {modal.type === "assign-blaster" && (
              <BlasterForm
                mode="assign"
                initialValues={{ ...modal.template, templateId: modal.template.id }}
                players={players}
                onSubmit={assignBlaster}
                onCancel={() => setModal(null)}
                submitLabel="Assign Blaster"
              />
            )}
            {modal.type === "edit-blaster-instance" && (
              <>
                <BlasterForm
                  mode="instance"
                  initialValues={modal.blaster}
                  onSubmit={(payload) => updateBlasterInstance(modal.blaster.id, payload)}
                  onCancel={() => setModal(null)}
                  submitLabel="Save Blaster"
                />
                <button type="button" className="slug-management-remove" onClick={() => deleteBlasterInstance(modal.blaster.id)}>
                  <TrashIcon weight="bold" />
                  Remove from Player
                </button>
              </>
            )}

            {modal.type === "new-mod-template" && (
              <ModForm mode="template" onSubmit={createModTemplate} onCancel={() => setModal(null)} submitLabel="Create Mod" />
            )}
            {modal.type === "edit-mod-template" && (
              <ModForm
                mode="template"
                initialValues={modal.template}
                onSubmit={(payload) => updateModTemplate(modal.template.id, payload)}
                onCancel={() => setModal(null)}
                submitLabel="Save Mod"
              />
            )}
            {modal.type === "assign-mod" && (
              <ModForm
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
                <ModForm
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
