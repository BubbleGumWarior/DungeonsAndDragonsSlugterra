import { useEffect, useRef, useState } from "react";
import { InfoIcon, TargetIcon, WarningIcon, WrenchIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import BlasterCard from "./BlasterCard.jsx";
import EquipmentCard, { EQUIPMENT_DRAG_TYPE, EQUIPMENT_ICONS } from "./EquipmentCard.jsx";
import { ARMOR_SLOT, SECONDARY_SLOT, equipmentSummary, qualityInfo, slotForKind } from "./itemData.js";
import ModCard from "./ModCard.jsx";
import RepairModal from "./RepairModal.jsx";
import Wardrobe from "./Wardrobe.jsx";
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
const EMPTY_SLOT_TEXT = ["Drag a weapon here", "Drag a weapon or gear here", "Drag armor here"];
const TAB_STORAGE_KEY = "inventory-tab";

function readSavedTab() {
  try {
    return localStorage.getItem(TAB_STORAGE_KEY);
  } catch {
    return null;
  }
}

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
  const [outfitCount, setOutfitCount] = useState(0);
  const [savedTab, setSavedTab] = useState(readSavedTab);
  // Loadout slots the card being dragged can go in (null when nothing is
  // being dragged), so those slots can light up and the rest dim.
  const [dragFitSlots, setDragFitSlots] = useState(null);
  const blasterListRef = useRef(null);
  useDragScrollRestore();

  // On `document`, like useDragScrollRestore: a successful drop re-renders the
  // dragged card away before its own `dragend` would fire.
  useEffect(() => {
    const clear = () => {
      setDragFitSlots(null);
      setDragOverSlot(null);
    };
    document.addEventListener("dragend", clear, true);
    return () => document.removeEventListener("dragend", clear, true);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/blasters/me", { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json()),
      fetch("/api/mods/me", { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json()),
      fetch("/api/characters/me", { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json()),
      fetch("/api/equipment/me", { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json()),
      // Only the count: the Wardrobe tab is hidden until there is an outfit to show.
      fetch("/api/outfits/me", { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => res.json())
        .catch(() => ({})),
    ])
      .then(([blasterData, modData, charData, equipmentData, outfitData]) => {
        setBlasters(blasterData.blasters || []);
        setMods(modData.mods || []);
        setEquipment(equipmentData.equipment || []);
        setOutfitCount(outfitData.outfits?.length ?? 0);
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
    if (durability >= 100) return null;
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

  // Dragging works on a desk; this is the same move for a phone. Pressing the
  // slot a blaster already holds puts it back in the pack.
  function blasterActions(blaster) {
    return (
      <>
        {blasterRepairAction(blaster)}
        <div className="slot-toggle" role="group" aria-label={`Equip ${blaster.name}`}>
          <span className="slot-toggle-label">Equip</span>
          {[0, 1].map((slot) => {
            const active = blaster.equipSlot === slot;
            return (
              <button
                key={slot}
                type="button"
                className={`slot-toggle-btn ${active ? "slot-toggle-btn--on" : ""}`}
                aria-pressed={active}
                title={active ? `Unequip from ${SLOT_LABELS[slot]}` : `Equip as ${SLOT_LABELS[slot]}`}
                onClick={() => (active ? unequipBlaster(blaster) : equipBlaster(blaster.id, slot))}
              >
                {SLOT_LABELS[slot]}
              </button>
            );
          })}
        </div>
      </>
    );
  }

  const tabs = [
    blasters.length > 0 || mods.length > 0 ? { key: "blasters", label: "Blasters & Mods", count: blasters.length + mods.length } : null,
    equipment.length > 0 ? { key: "gear", label: "Gear", count: equipment.length } : null,
    outfitCount > 0 ? { key: "wardrobe", label: "Wardrobe", count: outfitCount } : null,
  ].filter(Boolean);

  if (tabs.length === 0) {
    return (
      <div className="player-inventory">
        <p className="player-slugs-empty">No blasters, mods or equipment yet. Your Dungeon Master hasn't given you any.</p>
      </div>
    );
  }

  const activeTab = tabs.find((t) => t.key === savedTab) ?? tabs[0];

  function selectTab(key) {
    setSavedTab(key);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, key);
    } catch {
      // Private window or blocked storage: the tab just won't be remembered.
    }
  }

  function handleTabKeys(e) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const index = tabs.findIndex((t) => t.key === activeTab.key);
    const next = tabs[(index + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    selectTab(next.key);
    document.getElementById(`inventory-tab-${next.key}`)?.focus();
  }

  // The blasters to drop a mod onto sit below the loadout, so scroll them into
  // view rather than to the top. Deferred a tick: scrolling synchronously inside
  // dragstart aborts the drag. useDragScrollRestore() puts the scroll back on dragend.
  function scrollToBlasters() {
    setTimeout(() => {
      const list = blasterListRef.current;
      if (list) window.scrollTo({ top: list.getBoundingClientRect().top + window.scrollY - 84, behavior: "auto" });
    }, 0);
  }

  // Blasters and gear are dropped onto the loadout slots at the top of the page,
  // so jump there when one is picked up from further down the list (same
  // deferral and restore as above).
  function scrollToLoadout() {
    setTimeout(() => window.scrollTo({ top: 0, behavior: "auto" }), 0);
  }

  // Dragging a card from the pack: light up the loadout slots it fits.
  // Deferred a tick like the scroll -- a re-render inside dragstart can abort the drag.
  function startDrag(slots) {
    setTimeout(() => setDragFitSlots(slots), 0);
    scrollToLoadout();
  }

  return (
    <div className="player-inventory">
      {(blasters.length > 0 || equipment.length > 0) && (
        <section className="loadout" aria-labelledby="loadout-title">
          <h2 id="loadout-title" className="inv-heading">
            Loadout
          </h2>
          <div className="loadout-slots">
            {[0, 1, 2].map((slot) => {
              const equipped = blasters.find((b) => b.equipSlot === slot);
              const equippedGear = slot >= SECONDARY_SLOT ? equipment.find((x) => x.equipSlot === slot) : null;
              const filled = Boolean(equipped || equippedGear);
              const beltSlots = slot === 0 ? equipped?.magazineBonus ?? 0 : 0;
              const GearIcon = equippedGear ? EQUIPMENT_ICONS[equippedGear.kind] : null;
              const fits = dragFitSlots ? dragFitSlots.includes(slot) : null;
              return (
                <div
                  key={slot}
                  className={`loadout-slot ${filled ? "loadout-slot--filled" : ""} ${fits === true ? "loadout-slot--fits" : ""} ${fits === false ? "loadout-slot--nofit" : ""} ${dragOverSlot === slot && fits !== false ? "loadout-slot--dragover" : ""}`}
                  onDragOver={(e) => {
                    if (fits === false) return; // no preventDefault: the browser shows "not allowed"
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverSlot(slot);
                  }}
                  onDragLeave={() => setDragOverSlot((prev) => (prev === slot ? null : prev))}
                  onDrop={(e) => handleDrop(slot, e)}
                >
                  <div className="loadout-slot-head">
                    <Hint title={SLOT_LABELS[slot]} tip={<p>{SLOT_HINTS[slot]}</p>}>
                      <span className="loadout-slot-label">
                        {SLOT_LABELS[slot]}
                        <InfoIcon weight="bold" aria-hidden="true" />
                      </span>
                    </Hint>
                    {filled && (
                      <button
                        type="button"
                        className="loadout-slot-remove"
                        onClick={() => (equipped ? unequipBlaster(equipped) : unequipEquipment(equippedGear))}
                        title={`Unequip ${(equipped || equippedGear).name}`}
                        aria-label={`Unequip ${(equipped || equippedGear).name}`}
                      >
                        <XIcon weight="bold" />
                      </button>
                    )}
                  </div>
                  {filled ? (
                    <div className="loadout-slot-item">
                      <div className="loadout-slot-image">
                        {equipped ? <TargetIcon weight="duotone" /> : <GearIcon weight="duotone" />}
                      </div>
                      <div className="loadout-slot-text">
                        <span className="loadout-slot-name">{(equipped || equippedGear).name}</span>
                        <span className="loadout-slot-detail">
                          {equipped ? `${equipped.baseType} · ${qualityInfo(equipped.quality).label}` : equipmentSummary(equippedGear)}
                        </span>
                        {beltSlots > 0 && <span className="loadout-slot-bonus">+{beltSlots} slug slots from your ammo belt</span>}
                      </div>
                    </div>
                  ) : (
                    <span className="loadout-slot-empty">{EMPTY_SLOT_TEXT[slot]}</span>
                  )}
                </div>
              );
            })}
          </div>
          {equipError && (
            <p className="panel-error" role="alert">
              {equipError}
            </p>
          )}
        </section>
      )}

      <div className="inv-pack">
        <div className="inv-tabbar">
          <div className="inv-tabs" role="tablist" aria-label="Inventory sections" onKeyDown={handleTabKeys}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                id={`inventory-tab-${tab.key}`}
                aria-selected={tab.key === activeTab.key}
                aria-controls={`inventory-panel-${tab.key}`}
                tabIndex={tab.key === activeTab.key ? 0 : -1}
                className={`inv-tab ${tab.key === activeTab.key ? "inv-tab--on" : ""}`}
                onClick={() => selectTab(tab.key)}
              >
                {tab.label}
                <span className="inv-tab-count num-tabular">{tab.count}</span>
              </button>
            ))}
          </div>
          {blasters.length > 0 && (
            <span className={`inv-kits ${repairKits < 1 ? "inv-kits--none" : ""}`}>
              <WrenchIcon weight="bold" aria-hidden="true" />
              <span className="num-tabular">{repairKits}</span> Repair {repairKits === 1 ? "Kit" : "Kits"}
            </span>
          )}
        </div>

        <div
          key={activeTab.key}
          role="tabpanel"
          id={`inventory-panel-${activeTab.key}`}
          aria-labelledby={`inventory-tab-${activeTab.key}`}
          className="inv-panel"
        >
          {activeTab.key === "blasters" && (
            <>
              {blasters.length > 0 && (
                <div className="inv-list" ref={blasterListRef}>
                  {blasters.map((blaster) => (
                    <BlasterCard
                      key={blaster.id}
                      blaster={blaster}
                      size="row"
                      equippedMods={mods.filter((m) => m.equippedBlasterId === blaster.id)}
                      editableSlots
                      onUnequipMod={unequipMod}
                      onDropMod={(modId, displaceModId) => equipMod(modId, blaster.id, displaceModId)}
                      draggableEquip
                      onDragStart={() => startDrag([0, 1])}
                      actions={blasterActions(blaster)}
                    />
                  ))}
                </div>
              )}
              {unequippedMods.length > 0 && (
                <section className="inv-spare" aria-labelledby="spare-mods-title">
                  <div className="inv-subhead">
                    <h3 id="spare-mods-title" className="inv-subheading">
                      Spare mods
                    </h3>
                    <p>Drag a mod onto a blaster's mod slots to fit it. Drop it on a filled slot to swap.</p>
                  </div>
                  <div className="player-inventory-mods-grid">
                    {unequippedMods.map((mod) => (
                      <ModCard
                        key={mod.id}
                        mod={mod}
                        blasters={blasters}
                        editable
                        draggable
                        onUnequip={unequipMod}
                        onDragStart={scrollToBlasters}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {activeTab.key === "gear" && (
            <div className="inv-list">
              {equipment.map((item) => (
                <EquipmentCard
                  key={item.id}
                  item={item}
                  size="row"
                  draggableEquip
                  onDragStart={() => startDrag([slotForKind(item.kind)])}
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
          )}

          {activeTab.key === "wardrobe" && <Wardrobe bare />}
        </div>
      </div>

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
