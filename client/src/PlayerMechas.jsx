import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import MechaCard from "./MechaCard.jsx";
import MechaModCard from "./MechaModCard.jsx";
import "./PlayerSlugs.css";
import "./PlayerInventory.css";

export default function PlayerMechas() {
  const { token, user } = useAuth();
  const { mechaUpdate, mechaModUpdate } = useLiveState();
  const [mechas, setMechas] = useState([]);
  const [mods, setMods] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/mechas/me", { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json()),
      fetch("/api/mecha-mods/me", { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json()),
    ])
      .then(([mechaData, modData]) => {
        setMechas(mechaData.mechas || []);
        setMods(modData.mods || []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [token]);

  useEffect(() => {
    if (!mechaUpdate || mechaUpdate.userId !== user?.id) return;
    setMechas((prev) => {
      if (!mechaUpdate.mecha) {
        return prev.filter((m) => m.id !== mechaUpdate.mechaId);
      }
      const exists = prev.some((m) => m.id === mechaUpdate.mecha.id);
      if (exists) {
        return prev.map((m) => (m.id === mechaUpdate.mecha.id ? mechaUpdate.mecha : m));
      }
      return [...prev, mechaUpdate.mecha];
    });
  }, [mechaUpdate, user]);

  useEffect(() => {
    if (!mechaModUpdate || mechaModUpdate.userId !== user?.id) return;
    setMods((prev) => {
      if (!mechaModUpdate.mod) {
        return prev.filter((m) => m.id !== mechaModUpdate.modId);
      }
      const exists = prev.some((m) => m.id === mechaModUpdate.mod.id);
      if (exists) {
        return prev.map((m) => (m.id === mechaModUpdate.mod.id ? mechaModUpdate.mod : m));
      }
      return [...prev, mechaModUpdate.mod];
    });
  }, [mechaModUpdate, user]);

  function equipMod(modId, mechaId) {
    setMods((prev) => prev.map((m) => (m.id === modId ? { ...m, equippedMechaId: mechaId } : m)));
    fetch(`/api/mecha-mods/${modId}/equip`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mechaId }),
    }).catch(() => {});
  }

  function unequipMod(mod) {
    setMods((prev) => prev.map((m) => (m.id === mod.id ? { ...m, equippedMechaId: null } : m)));
    fetch(`/api/mecha-mods/${mod.id}/unequip`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  if (!loaded) {
    return null;
  }

  const unequippedMods = mods.filter((m) => !m.equippedMechaId);

  if (mechas.length === 0 && mods.length === 0) {
    return <p className="player-slugs-empty">No mecha-beasts yet. Your Dungeon Master hasn't given you any.</p>;
  }

  return (
    <div className="player-inventory">
      {mechas.length > 0 && (
        <div className="weapon-loadout">
          <h2 className="weapon-loadout-title">Your Mecha-Beasts</h2>
          <div className="player-slugs-grid">
            {mechas.map((mecha) => (
              <MechaCard
                key={mecha.id}
                mecha={mecha}
                size="lg"
                equippedMods={mods.filter((m) => m.equippedMechaId === mecha.id)}
                editableSlots
                onUnequipMod={unequipMod}
                onDropMod={(modId) => equipMod(modId, mecha.id)}
              />
            ))}
          </div>
        </div>
      )}

      {unequippedMods.length > 0 && (
        <div className="player-inventory-mods">
          <h2>Unequipped Mecha Mods</h2>
          <div className="player-inventory-mods-grid">
            {unequippedMods.map((mod) => (
              <MechaModCard key={mod.id} mod={mod} mechas={mechas} editable draggable onUnequip={unequipMod} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
