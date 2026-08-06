import { useEffect, useState } from "react";
import { TargetIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import BlasterCard from "./BlasterCard.jsx";
import ModCard from "./ModCard.jsx";
import "./PlayerSlugs.css";
import "./PlayerInventory.css";

const SLOT_LABELS = ["Primary", "Secondary"];
const SLOT_HINTS = ["The weapon you start combat with.", "Drawn when you switch weapons mid-combat."];

export default function PlayerInventory() {
  const { token, user } = useAuth();
  const { blasterUpdate, modUpdate } = useLiveState();
  const [blasters, setBlasters] = useState([]);
  const [mods, setMods] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [dragOverSlot, setDragOverSlot] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/blasters/me", { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json()),
      fetch("/api/mods/me", { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json()),
    ])
      .then(([blasterData, modData]) => {
        setBlasters(blasterData.blasters || []);
        setMods(modData.mods || []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [token]);

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

  function equipMod(modId, blasterId) {
    setMods((prev) => prev.map((m) => (m.id === modId ? { ...m, equippedBlasterId: blasterId } : m)));
    fetch(`/api/mods/${modId}/equip`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ blasterId }),
    }).catch(() => {});
  }

  function unequipMod(mod) {
    setMods((prev) => prev.map((m) => (m.id === mod.id ? { ...m, equippedBlasterId: null } : m)));
    fetch(`/api/mods/${mod.id}/unequip`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  function equipBlaster(blasterId, slot) {
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

  function handleDrop(slot, e) {
    e.preventDefault();
    setDragOverSlot(null);
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

  if (blasters.length === 0 && mods.length === 0) {
    return <p className="player-slugs-empty">No blasters or mods yet. Your Dungeon Master hasn't given you any.</p>;
  }

  return (
    <div className="player-inventory">
      {blasters.length > 0 && (
        <div className="weapon-loadout">
          <h2 className="weapon-loadout-title">Equipped Weapons</h2>
          <div className="weapon-loadout-slots">
            {[0, 1].map((slot) => {
              const equipped = blasters.find((b) => b.equipSlot === slot);
              return (
                <div
                  key={slot}
                  className={`weapon-loadout-slot ${equipped ? "weapon-loadout-slot--filled" : ""} ${dragOverSlot === slot ? "weapon-loadout-slot--dragover" : ""}`}
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
                    {equipped && (
                      <button
                        type="button"
                        className="weapon-loadout-slot-remove"
                        onClick={() => unequipBlaster(equipped)}
                        title={`Unequip ${equipped.name}`}
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
                    </div>
                  ) : (
                    <span className="weapon-loadout-slot-empty">Drag a weapon here</span>
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
                onDropMod={(modId) => equipMod(modId, blaster.id)}
                draggableEquip
              />
            ))}
          </div>
        </div>
      )}

      {unequippedMods.length > 0 && (
        <div className="player-inventory-mods">
          <h2>Unequipped Mods</h2>
          <div className="player-inventory-mods-grid">
            {unequippedMods.map((mod) => (
              <ModCard key={mod.id} mod={mod} blasters={blasters} editable draggable onUnequip={unequipMod} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
