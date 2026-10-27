import { useEffect, useState } from "react";
import { TrashIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import EquipmentForm from "./EquipmentForm.jsx";
import BlasterForm from "./BlasterForm.jsx";
import ModForm from "./ModForm.jsx";
import GiftCatalog from "./GiftCatalog.jsx";
import PlayerSatchel from "./PlayerSatchel.jsx";
import useDmOutfits from "./useDmOutfits.js";
import { defaultBlasterFields, defaultEquipmentFields, defaultModFields } from "./itemData.js";
import "./SlugManagement.css";
import "./InventoryDesk.css";

const RECIPIENT_KEY = "dm-inventory-recipient";

function readSavedRecipient() {
  try {
    return Number(localStorage.getItem(RECIPIENT_KEY)) || null;
  } catch {
    return null;
  }
}

// The DM's handout desk: pick who you are giving to, then hand them things from
// the catalog with one click. Their inventory sits beside it so the result is
// visible at once.
export default function InventoryManagement() {
  const { token } = useAuth();
  const [blasterTemplates, setBlasterTemplates] = useState([]);
  const [modTemplates, setModTemplates] = useState([]);
  const [players, setPlayers] = useState([]);
  const [blasters, setBlasters] = useState([]);
  const [mods, setMods] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [equipmentTemplates, setEquipmentTemplates] = useState([]);
  const [modal, setModal] = useState(null);
  const [recipientId, setRecipientId] = useState(readSavedRecipient);
  const [narrowView, setNarrowView] = useState("catalog");
  const [status, setStatus] = useState(null);
  const outfitDesk = useDmOutfits();

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

  function loadEquipmentTemplates() {
    fetch("/api/equipment-templates", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setEquipmentTemplates(data.templates || []))
      .catch(() => {});
  }

  function loadEquipment() {
    fetch("/api/equipment", { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => setEquipment(data.equipment || []))
      .catch(() => {});
  }

  useEffect(() => {
    loadBlasterTemplates();
    loadModTemplates();
    loadBlasters();
    loadMods();
    loadEquipment();
    loadEquipmentTemplates();
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

  // The party visited an expert: put a worn or broken blaster back to 100%.
  async function restoreBlaster(id) {
    await fetch(`/api/blasters/${id}/restore`, { method: "POST", headers: authHeaders() });
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

  async function createEquipmentTemplate(payload) {
    await submitJson("/api/equipment-templates", "POST", payload);
    setModal(null);
    loadEquipmentTemplates();
  }

  async function updateEquipmentTemplate(id, payload) {
    await submitJson(`/api/equipment-templates/${id}`, "PATCH", payload);
    setModal(null);
    loadEquipmentTemplates();
  }

  async function deleteEquipmentTemplate(id) {
    await fetch(`/api/equipment-templates/${id}`, { method: "DELETE", headers: authHeaders() });
    loadEquipmentTemplates();
  }

  async function assignEquipment(payload) {
    await submitJson("/api/equipment", "POST", payload);
    setModal(null);
    loadEquipment();
  }

  async function updateEquipmentInstance(id, payload) {
    await submitJson(`/api/equipment/${id}`, "PATCH", payload);
    setModal(null);
    loadEquipment();
    loadBlasters();
  }

  async function deleteEquipmentInstance(id) {
    await fetch(`/api/equipment/${id}`, { method: "DELETE", headers: authHeaders() });
    setModal(null);
    loadEquipment();
    loadBlasters();
  }

  useEffect(() => {
    if (!status) return undefined;
    const timer = setTimeout(() => setStatus(null), 4500);
    return () => clearTimeout(timer);
  }, [status]);

  const characterByUser = new Map(outfitDesk.characters.map((c) => [c.userId, c]));
  const roster = players.map((player) => ({
    id: player.id,
    name: player.characterName || player.username,
    ill: Boolean(characterByUser.get(player.id)?.ill),
  }));
  const recipient = roster.find((p) => p.id === recipientId) ?? roster[0] ?? null;

  function chooseRecipient(id) {
    setRecipientId(id);
    try {
      localStorage.setItem(RECIPIENT_KEY, String(id));
    } catch {
      // Remembering the pick is a convenience; the page works without it.
    }
  }

  const inventoryFor = (id) => ({
    blasters: blasters.filter((b) => b.userId === id),
    mods: mods.filter((m) => m.userId === id),
    equipment: equipment.filter((e) => e.userId === id),
    outfits: outfitDesk.outfits.filter((o) => o.userId === id),
  });
  const heldCount = (id) => {
    const inv = inventoryFor(id);
    return inv.blasters.length + inv.mods.length + inv.equipment.length + inv.outfits.length;
  };
  const held = recipient ? inventoryFor(recipient.id) : { blasters: [], mods: [], equipment: [], outfits: [] };
  const ownedOutfitIds = new Set(held.outfits.map((o) => o.templateId));

  // One click: hand a template to the chosen player exactly as it is.
  async function give(type, template) {
    if (!recipient) return false;
    const common = { templateId: template.id, userId: recipient.id };
    try {
      if (type === "blaster") {
        await submitJson("/api/blasters", "POST", { ...defaultBlasterFields(), ...template, ...common });
        loadBlasters();
      } else if (type === "mod") {
        await submitJson("/api/mods", "POST", { ...defaultModFields(), ...template, ...common });
        loadMods();
      } else if (type === "equipment") {
        await submitJson("/api/equipment", "POST", { ...defaultEquipmentFields(), ...template, ...common });
        loadEquipment();
      } else {
        await outfitDesk.grant(recipient.id, template.id);
      }
      setStatus({ text: `Gave ${template.name} to ${recipient.name}.` });
      return true;
    } catch (err) {
      setStatus({ text: err.message || "Could not give that.", error: true });
      return false;
    }
  }

  async function removeOutfit(outfit) {
    try {
      await outfitDesk.remove(outfit);
      setStatus({ text: `Took ${outfit.name} from ${recipient?.name ?? "them"}.` });
    } catch (err) {
      setStatus({ text: err.message || "Could not remove that outfit.", error: true });
    }
  }

  const openNew = (type) => setModal({ type: `new-${type}-template` });
  const openEdit = (type, template) => setModal({ type: `edit-${type}-template`, template });
  const openTweak = (type, template) => setModal({ type: `assign-${type}`, template });
  const deleteTemplate = (type, template) =>
    ({ blaster: deleteBlasterTemplate, mod: deleteModTemplate, equipment: deleteEquipmentTemplate })[type](template.id);

  return (
    <div className="slug-management desk">
      <section className="desk-rail" aria-label="Giving to">
        <span className="desk-rail-label">Giving to</span>
        {roster.length === 0 ? (
          <span className="desk-rail-none">No players yet.</span>
        ) : (
          <div className="desk-rail-list" role="group" aria-label="Choose who receives items">
            {roster.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`desk-person ${recipient?.id === p.id ? "desk-person--on" : ""}`}
                aria-pressed={recipient?.id === p.id}
                onClick={() => chooseRecipient(p.id)}
              >
                <span className="desk-person-name">{p.name}</span>
                <span className="desk-person-count" aria-label={`${heldCount(p.id)} items held`}>
                  {heldCount(p.id)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="desk-switch" role="group" aria-label="Show">
        <button type="button" className={narrowView === "catalog" ? "desk-switch--on" : ""} aria-pressed={narrowView === "catalog"} onClick={() => setNarrowView("catalog")}>
          Catalog
        </button>
        <button type="button" className={narrowView === "gear" ? "desk-switch--on" : ""} aria-pressed={narrowView === "gear"} onClick={() => setNarrowView("gear")}>
          {recipient ? `${recipient.name.split(" ")[0]}'s gear` : "Gear"}
          {recipient && <span className="desk-tab-count">{heldCount(recipient.id)}</span>}
        </button>
      </div>

      <div className="desk-layout">
        <div className={`desk-pane desk-pane--catalog ${narrowView !== "catalog" ? "desk-pane--away" : ""}`}>
          <GiftCatalog
            catalog={{ blaster: blasterTemplates, mod: modTemplates, equipment: equipmentTemplates, outfit: outfitDesk.templates }}
            recipient={recipient}
            ownedOutfitIds={ownedOutfitIds}
            status={status}
            onGive={give}
            onCustomize={openTweak}
            onEdit={openEdit}
            onDelete={deleteTemplate}
            onNew={openNew}
          />
        </div>
        <div className={`desk-pane desk-pane--gear ${narrowView !== "gear" ? "desk-pane--away" : ""}`}>
          <PlayerSatchel
            key={recipient?.id}
            recipient={recipient}
            blasters={held.blasters}
            mods={held.mods}
            equipment={held.equipment}
            outfits={held.outfits}
            allMods={mods}
            onEditBlaster={(blaster) => setModal({ type: "edit-blaster-instance", blaster })}
            onEditMod={(mod) => setModal({ type: "edit-mod-instance", mod })}
            onEditEquipment={(item) => setModal({ type: "edit-equipment-instance", item })}
            onRestoreBlaster={restoreBlaster}
            onRemoveOutfit={removeOutfit}
          />
        </div>
      </div>

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
              {modal.type === "new-equipment-template" && "New Equipment Template"}
              {modal.type === "edit-equipment-template" && "Edit Equipment Template"}
              {modal.type === "assign-equipment" && `Assign "${modal.template.name}"`}
              {modal.type === "edit-equipment-instance" && `Edit ${modal.item.name}`}
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
                defaultPlayerId={recipient?.id}
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
                defaultPlayerId={recipient?.id}
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

            {modal.type === "new-equipment-template" && (
              <EquipmentForm mode="template" onSubmit={createEquipmentTemplate} onCancel={() => setModal(null)} submitLabel="Create Equipment" />
            )}
            {modal.type === "edit-equipment-template" && (
              <EquipmentForm
                mode="template"
                initialValues={modal.template}
                onSubmit={(payload) => updateEquipmentTemplate(modal.template.id, payload)}
                onCancel={() => setModal(null)}
                submitLabel="Save Equipment"
              />
            )}
            {modal.type === "assign-equipment" && (
              <EquipmentForm
                mode="assign"
                initialValues={{ ...modal.template, templateId: modal.template.id }}
                players={players}
                defaultPlayerId={recipient?.id}
                onSubmit={assignEquipment}
                onCancel={() => setModal(null)}
                submitLabel="Assign Equipment"
              />
            )}
            {modal.type === "edit-equipment-instance" && (
              <>
                <EquipmentForm
                  mode="instance"
                  initialValues={modal.item}
                  onSubmit={(payload) => updateEquipmentInstance(modal.item.id, payload)}
                  onCancel={() => setModal(null)}
                  submitLabel="Save Equipment"
                />
                <button type="button" className="slug-management-remove" onClick={() => deleteEquipmentInstance(modal.item.id)}>
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
