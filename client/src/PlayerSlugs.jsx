import { useEffect, useMemo, useState } from "react";
import { ArrowClockwiseIcon, BookOpenIcon, TargetIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import SlugCard from "./SlugCard.jsx";
import Slugpedia from "./Slugpedia.jsx";
import "./Panel.css";
import "./PlayerSlugs.css";

const SLOT_LABELS = ["Primary", "Secondary"];

export default function PlayerSlugs() {
  const { token, user } = useAuth();
  const { slugUpdate, blasterUpdate } = useLiveState();
  const [slugs, setSlugs] = useState([]);
  const [blasters, setBlasters] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragOverSlot, setDragOverSlot] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [error, setError] = useState(null);
  const [slugpediaOpen, setSlugpediaOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/slugs/me", { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json()),
      fetch("/api/blasters/me", { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json()),
    ])
      .then(([slugData, blasterData]) => {
        setSlugs(slugData.slugs || []);
        setBlasters(blasterData.blasters || []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [token]);

  useEffect(() => {
    if (!slugUpdate || slugUpdate.userId !== user?.id) return;
    setSlugs((prev) => {
      if (!slugUpdate.slug) {
        return prev.filter((s) => s.id !== slugUpdate.slugId);
      }
      const exists = prev.some((s) => s.id === slugUpdate.slug.id);
      if (exists) {
        return prev.map((s) => (s.id === slugUpdate.slug.id ? slugUpdate.slug : s));
      }
      return [...prev, slugUpdate.slug];
    });
  }, [slugUpdate, user]);

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

  const equippedBlasters = useMemo(
    () => blasters.filter((b) => b.equipSlot != null).sort((a, b) => a.equipSlot - b.equipSlot),
    [blasters]
  );
  const activeWeapon = equippedBlasters[activeIndex] || null;

  useEffect(() => {
    if (activeIndex >= equippedBlasters.length && equippedBlasters.length > 0) {
      setActiveIndex(0);
    }
  }, [equippedBlasters, activeIndex]);

  useEffect(() => {
    setSelectedSlot(null);
  }, [activeWeapon?.id]);

  useEffect(() => {
    function onKeyDown(e) {
      const num = Number(e.key);
      if (!Number.isInteger(num) || num < 1 || num > 9) return;
      if (!activeWeapon) return;
      const index = num - 1;
      if (index >= activeWeapon.magazineSize) return;
      setSelectedSlot(index);
    }
    function onKeyUp(e) {
      const num = Number(e.key);
      if (!Number.isInteger(num) || num < 1 || num > 9) return;
      const index = num - 1;
      setSelectedSlot((prev) => (prev === index ? null : prev));
    }
    function onBlur() {
      setSelectedSlot(null);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [activeWeapon]);

  // Both of these update local state optimistically (so the drag/drop feels
  // instant), but that update used to be unconditional -- a failed request
  // (a stale magazine-slot conflict, a dropped connection, a session hiccup)
  // left the UI permanently showing a slug as loaded when the server never
  // actually persisted it, with the error silently swallowed. Now the
  // optimistic update is rolled back and surfaced if the request doesn't
  // actually succeed.
  function loadSlug(slugId, blasterId, slot) {
    setError(null);
    const previous = slugs;
    setSlugs((prev) => prev.map((s) => (s.id === slugId ? { ...s, equippedBlasterId: blasterId, magazineSlot: slot } : s)));
    fetch(`/api/slugs/${slugId}/load`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ blasterId, slot }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Could not load that slug.");
        }
      })
      .catch((err) => {
        setSlugs(previous);
        setError(err.message);
      });
  }

  function unloadSlug(slugId) {
    setError(null);
    const previous = slugs;
    setSlugs((prev) => prev.map((s) => (s.id === slugId ? { ...s, equippedBlasterId: null, magazineSlot: null } : s)));
    fetch(`/api/slugs/${slugId}/unload`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Could not unload that slug.");
        }
      })
      .catch((err) => {
        setSlugs(previous);
        setError(err.message);
      });
  }

  function handleSlotDrop(slot, e) {
    e.preventDefault();
    setDragOverSlot(null);
    if (!activeWeapon) return;
    const slugId = Number(e.dataTransfer.getData("text/plain"));
    if (!Number.isInteger(slugId)) return;
    const occupant = slugs.find((s) => s.equippedBlasterId === activeWeapon.id && s.magazineSlot === slot);
    if (occupant && occupant.id !== slugId) return;
    loadSlug(slugId, activeWeapon.id, slot);
  }

  function handleSlotClick(slot) {
    if (!activeWeapon) return;
    const occupant = slugs.find((s) => s.equippedBlasterId === activeWeapon.id && s.magazineSlot === slot);
    if (occupant) {
      unloadSlug(occupant.id);
    }
  }

  function cycleWeapon() {
    if (equippedBlasters.length < 2) return;
    setActiveIndex((prev) => (prev + 1) % equippedBlasters.length);
  }

  if (!loaded) {
    return null;
  }

  return (
    <div className="player-slugs-page">
      <div className="player-slugs-header">
        <button type="button" className="player-slugs-slugpedia-btn" onClick={() => setSlugpediaOpen(true)}>
          <BookOpenIcon weight="duotone" />
          Slugpedia
        </button>
      </div>

      {slugs.length === 0 && <p className="player-slugs-empty">No slugs yet. Your Dungeon Master hasn't given you any.</p>}

      {error && <p className="panel-error">{error}</p>}
      {equippedBlasters.length > 0 && (
        <div className="slug-loadout">
          <div className="slug-loadout-header">
            <div className="slug-loadout-weapon">
              <div className="slug-loadout-weapon-image">
                {activeWeapon?.image ? (
                  <img src={activeWeapon.image} alt={activeWeapon.name} />
                ) : (
                  <TargetIcon weight="duotone" />
                )}
              </div>
              <div>
                <span className={`slug-loadout-weapon-slot slug-loadout-weapon-slot--${activeWeapon?.equipSlot}`}>
                  {SLOT_LABELS[activeWeapon?.equipSlot] ?? ""}
                </span>
                <span className="slug-loadout-weapon-name">{activeWeapon?.name}</span>
                <span className="slug-loadout-weapon-hint">Drag a slug below into an empty slot to load it.</span>
              </div>
            </div>
            {equippedBlasters.length > 1 && (
              <button type="button" className="slug-loadout-cycle" onClick={cycleWeapon} title="Switch weapon">
                <ArrowClockwiseIcon weight="bold" />
                Switch Weapon
              </button>
            )}
          </div>

          <div className="slug-loadout-slots">
            {Array.from({ length: activeWeapon?.magazineSize || 0 }, (_, i) => {
              const occupant = slugs.find((s) => s.equippedBlasterId === activeWeapon.id && s.magazineSlot === i);
              const isSelected = selectedSlot === i;
              const isDragOver = dragOverSlot === i;
              return (
                <div
                  key={i}
                  className={`slug-loadout-slot ${occupant ? "slug-loadout-slot--filled" : "slug-loadout-slot--empty"} ${isSelected ? "slug-loadout-slot--selected" : ""} ${isDragOver ? "slug-loadout-slot--dragover" : ""}`}
                  onClick={() => handleSlotClick(i)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverSlot(i);
                  }}
                  onDragLeave={() => setDragOverSlot((prev) => (prev === i ? null : prev))}
                  onDrop={(e) => handleSlotDrop(i, e)}
                  title={occupant ? `Unload ${occupant.name} (${i + 1})` : `Slot ${i + 1}`}
                >
                  <span className="slug-loadout-slot-number">{i + 1}</span>
                  <span className="slug-loadout-slot-name">{occupant ? occupant.name : "Empty"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {slugs.length > 0 && (
        <div className="player-slugs-grid">
          {slugs.map((slug) => {
            const isLoaded = slug.equippedBlasterId != null;
            const isSelected =
              isLoaded &&
              activeWeapon &&
              slug.equippedBlasterId === activeWeapon.id &&
              slug.magazineSlot === selectedSlot;
            const loadedWeapon = isLoaded ? blasters.find((b) => b.id === slug.equippedBlasterId) : null;
            return (
              <div
                key={slug.id}
                className={`slug-loadout-item ${isSelected ? "slug-loadout-item--selected" : ""} ${isLoaded ? "slug-loadout-item--loaded" : "slug-loadout-item--draggable"}`}
                draggable={!isLoaded}
                onDragStart={
                  !isLoaded
                    ? (e) => {
                        e.dataTransfer.setData("text/plain", String(slug.id));
                        e.dataTransfer.effectAllowed = "move";
                      }
                    : undefined
                }
              >
                {isLoaded && (
                  <span className="slug-loadout-item-badge">
                    {loadedWeapon ? `${loadedWeapon.name} · Slot ${slug.magazineSlot + 1}` : `Slot ${slug.magazineSlot + 1}`}
                  </span>
                )}
                <SlugCard slug={slug} size="lg" editable={false} />
              </div>
            );
          })}
        </div>
      )}

      {slugpediaOpen && <Slugpedia onClose={() => setSlugpediaOpen(false)} />}
    </div>
  );
}
