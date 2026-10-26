import { useEffect, useState } from "react";
import { TargetIcon, WarningIcon, WrenchIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import BlasterCard from "./BlasterCard.jsx";
import EquipmentCard, { EQUIPMENT_DRAG_TYPE, EQUIPMENT_ICONS } from "./EquipmentCard.jsx";
import { ARMOR_SLOT, SECONDARY_SLOT, equipmentSummary, slotForKind } from "./itemData.js";
import ModCard from "./ModCard.jsx";
import RepairModal from "./RepairModal.jsx";
import Hint from "./Hint.jsx";
import { useDragScrollRestore } from "./useDragScrollRestore.js";
import "./PlayerSlugs.css";
import "./PlayerInventory.css";

const SLOT_LABELS = ["Primary", "Secondary", "Armor"];
const SLOT_HINTS = [
  "The weapon you start combat with.",
  "A second blaster to switch to mid-combat -- or a melee weapon, shield or ammo belt instead.",
  "Worn alongside your Secondary. Adds Grit. Changeable between fights.",
];

export default function PlayerInventory() {
  const { token, user } = useAuth();
  const { blasterUpdate, modUpdate, marketChanged, tradeCompleted, equipmentChanged } = useLiveState();
  const myEquipmentChange = equipmentChanged && equipmentChanged.userId === user?.id ? equipmentChanged.at : null;
  const [blasters, setBlasters] = useState([]);
  const [mods, setMods] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [repairKits, setRepairKits] = useState(0);
  const [repairing, setRepairing] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [equipError, setEquipError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [dragOverSlot, setDragOverSlot] = useState(null);
  useDragScrollRestore();

  useEffect(() => {
    Promise.all([
      fetch("/api/blasters/me", { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json()),
      fetch("/api/mods/me", { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json()),
      fetch("/api/characters/me", { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json()),
      fetch("/api/equipment/me", { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json()),
    ])
      .then(([blasterData, modData, charData, equipmentData]) => {
        setBlasters(blasterData.blasters || []);
        setMods(modData.mods || []);
        setEquipment(equipmentData.equipment || []);
        if (Number.isInteger(charData.character?.repairKits)) setRepairKits(charData.character.repairKits);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    // A completed trade (or a purchase) moves items in bulk, so refetch
    // everything rather than patching from individual socket updates. Same for
    // equipment-changed: an ammo belt resizes a blaster's magazine and can
    // unload slugs, all in one go.
  }, [token, tradeCompleted, marketChanged, myEquipmentChange, reloadTick]);

  useEffect(() => {
    if (!blasterUpdate || blasterUpdate.userId !== user?.id) return;
    setBlasters((prev) => {
      if (!blasterUpdate.blaster) {
        return prev.filter((b) => b.id !== blasterUpdate.blasterId);
      }
      const exists = prev.some((b) => b.id === blasterUpdate.blaster.id);
      if (exists) {
        return prev.map((b) => (b.id === blasterUpdate.blaster.id ? blasterUpdate.blaster : b));
      }
      return [...prev, blasterUpdate.blaster];
    });
  }, [blasterUpdate, user]);

  useEffect(() => {
    if (!modUpdate || modUpdate.userId !== user?.id) return;
    setMods((prev) => {
      if (!modUpdate.mod) {
        return prev.filter((m) => m.id !== modUpdate.modId);
      }
      const exists = prev.some((m) => m.id === modUpdate.mod.id);
      if (exists) {
        return prev.map((m) => (m.id === modUpdate.mod.id ? modUpdate.mod : m));
      }
      return [...prev, modUpdate.mod];
    });
  }, [modUpdate, user]);

  // `displaceModId` is the mod already sitting in the slot the new one was
  // dropped onto -- unequip it first so the blaster has an open slot (the
  // server rejects an equip when every slot is full).
  function equipMod(modId, blasterId, displaceModId = null) {
    setMods((prev) =>
      prev.map((m) => {
        if (m.id === modId) return { ...m, equippedBlasterId: blasterId };
        if (displaceModId != null && m.id === displaceModId) return { ...m, equippedBlasterId: null };
        return m;
      })
    );
    const displace =
      displaceModId != null
        ? fetch(`/api/mods/${displaceModId}/unequip`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}` },
          })
        : Promise.resolve();
    displace
      .then(() =>
        fetch(`/api/mods/${modId}/equip`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ blasterId }),
        })
      )
      .catch(() => {});
  }

  function unequipMod(mod) {
    setMods((prev) => prev.map((m) => (m.id === mod.id ? { ...m, equippedBlasterId: null } : m)));
    fetch(`/api/mods/${mod.id}/unequip`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  function equipBlaster(blasterId, slot) {
    if (slot === SECONDARY_SLOT) {
      setEquipment((prev) => prev.map((e) => (e.equipSlot === slot ? { ...e, equipSlot: null, equipped: false } : e)));
    }
    setBlasters((prev) =>
      prev.map((b) => {
        if (b.id === blasterId) return { ...b, equipSlot: slot, equipped: true };
        if (b.equipSlot === slot) return { ...b, equipSlot: null, equipped: false };
        return b;
      })
    );
    fetch(`/api/blasters/${blasterId}/equip`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ slot }),
    }).catch(() => {});
  }

  function unequipBlaster(blaster) {
    setBlasters((prev) => prev.map((b) => (b.id === blaster.id ? { ...b, equipSlot: null, equipped: false } : b)));
    fetch(`/api/blasters/${blaster.id}/unequip`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  // The server is the judge (armor can't change mid-fight) -- on a refusal, say why
  // and put the optimistic change back by refetching.
  function sendEquipment(path) {
    setEquipError(null);
    fetch(path, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (res.ok) return;
        const data = await res.json().catch(() => ({}));
        setEquipError(data.error || "That didn't work.");
        setReloadTick((n) => n + 1);
      })
      .catch(() => {});
  }

  function equipEquipment(itemId) {
    const item = equipment.find((e) => e.id === itemId);
    if (!item) return;
    const slot = slotForKind(item.kind);
    if (slot === SECONDARY_SLOT) {
      setBlasters((prev) => prev.map((b) => (b.equipSlot === SECONDARY_SLOT ? { ...b, equipSlot: null, equipped: false } : b)));
    }
    setEquipment((prev) =>
      prev.map((e) => {
        if (e.id === itemId) return { ...e, equipSlot: slot, equipped: true };
        if (e.equipSlot === slot) return { ...e, equipSlot: null, equipped: false };
        return e;
      })
    );
    sendEquipment(`/api/equipment/${itemId}/equip`);
  }

  function unequipEquipment(item) {
    setEquipment((prev) => prev.map((e) => (e.id === item.id ? { ...e, equipSlot: null, equipped: false } : e)));
    sendEquipment(`/api/equipment/${item.id}/unequip`);
  }

  function handleDrop(slot, e) {
    e.preventDefault();
    setDragOverSlot(null);
    // Equipment only fits the Secondary slot.
    if (Array.from(e.dataTransfer.types || []).includes(EQUIPMENT_DRAG_TYPE)) {
      const itemId = Number(e.dataTransfer.getData(EQUIPMENT_DRAG_TYPE));
      const item = equipment.find((x) => x.id === itemId);
      if (item && slot === slotForKind(item.kind) && item.equipSlot !== slot) equipEquipment(itemId);
      return;
    }
    if (slot > SECONDARY_SLOT) return; // blasters never go in the Armor slot
    const blasterId = Number(e.dataTransfer.getData("text/plain"));
    if (!Number.isInteger(blasterId)) return;
    const blaster = blasters.find((b) => b.id === blasterId);
    if (!blaster || blaster.equipSlot === slot) return;
    equipBlaster(blasterId, slot);
  }

  if (!loaded) {
    return null;
  }

  const unequippedMods = mods.filter((m) => !m.equippedBlasterId);

  // The repair button under a blaster's condition: a kit-powered patch-up, or
  // (once it hits 0%) a plain statement that only an expert can help.
  function blasterRepairAction(blaster) {
    const durability = blaster.durability ?? 100;
    if (durability >= 100) return undefined;
    if (durability <= 0) {
      return (
        <Hint align="end" title="Beyond a kit" tip={<p>This blaster is broken. A Repair Kit can't mend it -- visit an expert and ask your DM to have it restored.</p>}>
          <span className="blaster-broken-note">
            <WarningIcon weight="fill" /> Needs an expert
          </span>
        </Hint>
      );
    }
    return (
      <button
        type="button"
        className="panel-btn blaster-repair-btn"
        disabled={repairKits < 1}
        title={repairKits < 1 ? "You need a Repair Kit -- buy one at the Market" : undefined}
        onClick={() => setRepairing(blaster)}
      >
        <WrenchIcon weight="bold" />
        Repair{repairKits > 0 ? ` (${repairKits} ${repairKits === 1 ? "kit" : "kits"})` : ""}
      </button>
    );
  }

  if (blasters.length === 0 && mods.length === 0 && equipment.length === 0) {
    return (
      <div className="player-inventory">
        <p className="player-slugs-empty">No blasters, mods or equipment yet. Your Dungeon Master hasn't given you any.</p>
      </div>
    );
  }

  return (
    <div className="player-inventory">
      {(blasters.length > 0 || equipment.length > 0) && (
        <div className="weapon-loadout">
          <h2 className="weapon-loadout-title">Equipped Weapons</h2>
          <div className="weapon-loadout-slots">
            {[0, 1, 2].map((slot) => {
              const equipped = blasters.find((b) => b.equipSlot === slot);
              const equippedGear = slot >= SECONDARY_SLOT ? equipment.find((x) => x.equipSlot === slot) : null;
              const filled = Boolean(equipped || equippedGear);
              const beltSlots = slot === 0 ? equipped?.magazineBonus ?? 0 : 0;
              return (
                <div
                  key={slot}
                  className={`weapon-loadout-slot ${filled ? "weapon-loadout-slot--filled" : ""} ${dragOverSlot === slot ? "weapon-loadout-slot--dragover" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverSlot(slot);
                  }}
                  onDragLeave={() => setDragOverSlot((prev) => (prev === slot ? null : prev))}
                  onDrop={(e) => handleDrop(slot, e)}
                >
                  <div className="weapon-loadout-slot-header">
                    <span className="weapon-loadout-slot-label">{SLOT_LABELS[slot]}</span>
                    {filled && (
                      <button
                        type="button"
                        className="weapon-loadout-slot-remove"
                        onClick={() => (equipped ? unequipBlaster(equipped) : unequipEquipment(equippedGear))}
                        title={`Unequip ${(equipped || equippedGear).name}`}
                      >
                        <XIcon weight="bold" />
                      </button>
                    )}
                  </div>
                  {equipped ? (
                    <div className="weapon-loadout-slot-weapon">
                      <div className="weapon-loadout-slot-image">
                        {equipped.image ? <img src={equipped.image} alt={equipped.name} /> : <TargetIcon weight="duotone" />}
                      </div>
                      <span className="weapon-loadout-slot-name">{equipped.name}</span>
                      {beltSlots > 0 && <span className="weapon-loadout-slot-bonus">+{beltSlots} slug slots from your ammo belt</span>}
                    </div>
                  ) : equippedGear ? (
                    <div className="weapon-loadout-slot-weapon">
                      <div className="weapon-loadout-slot-image">
                        {(() => {
                          const GearIcon = EQUIPMENT_ICONS[equippedGear.kind];
                          return <GearIcon weight="duotone" />;
                        })()}
                      </div>
                      <span className="weapon-loadout-slot-name">{equippedGear.name}</span>
                      <span className="weapon-loadout-slot-bonus">{equipmentSummary(equippedGear)}</span>
                    </div>
                  ) : (
                    <span className="weapon-loadout-slot-empty">{slot === ARMOR_SLOT ? "Drag armor here" : slot === SECONDARY_SLOT ? "Drag a weapon or gear here" : "Drag a weapon here"}</span>
                  )}
                  <span className="weapon-loadout-slot-hint">{SLOT_HINTS[slot]}</span>
                </div>
              );
            })}
          </div>

          <div className="player-slugs-grid">
            {blasters.map((blaster) => (
              <BlasterCard
                key={blaster.id}
                blaster={blaster}
                size="lg"
                equippedMods={mods.filter((m) => m.equippedBlasterId === blaster.id)}
                editableSlots
                onUnequipMod={unequipMod}
                onDropMod={(modId, displaceModId) => equipMod(modId, blaster.id, displaceModId)}
                draggableEquip
                actions={blasterRepairAction(blaster)}
              />
            ))}
          </div>
          {equipment.length > 0 && (
            <>
              <h2 className="weapon-loadout-title">Equipment</h2>
              {equipError && <p className="panel-error">{equipError}</p>}
              <div className="player-slugs-grid">
                {equipment.map((item) => (
                  <EquipmentCard
                    key={item.id}
                    item={item}
                    size="lg"
                    draggableEquip
                    actions={
                      <button
                        type="button"
                        className="panel-btn"
                        onClick={() => (item.equipped ? unequipEquipment(item) : equipEquipment(item.id))}
                      >
                        {item.equipped ? "Unequip" : item.kind === "armor" ? "Wear" : "Equip in Secondary"}
                      </button>
                    }
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {unequippedMods.length > 0 && (
        <div className="player-inventory-mods">
          <h2>Unequipped Mods</h2>
          <div className="player-inventory-mods-grid">
            {unequippedMods.map((mod) => (
              <ModCard
                key={mod.id}
                mod={mod}
                blasters={blasters}
                editable
                draggable
                onUnequip={unequipMod}
                // The blasters to drop onto are at the top of the page. Deferred a
                // tick: scrolling synchronously inside dragstart aborts the drag.
                // useDragScrollRestore() puts the scroll back on dragend.
                onDragStart={() => setTimeout(() => window.scrollTo({ top: 0, behavior: "auto" }), 0)}
              />
            ))}
          </div>
        </div>
      )}
      {repairing && (
        <RepairModal
          blaster={blasters.find((b) => b.id === repairing.id) || repairing}
          kits={repairKits}
          onClose={() => setRepairing(null)}
          onResolved={(data) => {
            setRepairKits(data.repairKits);
            setBlasters((prev) => prev.map((b) => (b.id === data.blaster.id ? data.blaster : b)));
          }}
        />
      )}
    </div>
  );
}
