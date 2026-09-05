import { useCallback, useEffect, useState } from "react";
import { HeartStraightIcon, UserCircleIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { maxGrit } from "./characterData.js";
import KnockoutPips from "./KnockoutPips.jsx";
import GritRing from "./GritRing.jsx";
import "./Panel.css";
import "./Roster.css";

export default function Roster({ selectable = false, selectedUserId, onSelect, healable = false }) {
  const { token } = useAuth();
  const { onlineUserIds, characterUpdate, characterCreated, partyHealed } = useLiveState();
  const [characters, setCharacters] = useState([]);
  const [healing, setHealing] = useState(false);

  const refetch = useCallback(() => {
    fetch("/api/characters", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setCharacters(data.characters || []))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Heal All (from this or any other DM's client) re-syncs the whole roster
  // from the server -- the per-character broadcasts it also fires can be
  // coalesced away in the burst (see AccessSocket's single-slot note).
  useEffect(() => {
    if (partyHealed) refetch();
  }, [partyHealed, refetch]);

  // A newly created character isn't in the list yet, so the per-character
  // "character-updated" patch can't surface it -- pull a fresh roster.
  useEffect(() => {
    if (characterCreated) refetch();
  }, [characterCreated, refetch]);

  useEffect(() => {
    if (!characterUpdate) return;
    setCharacters((prev) =>
      prev.map((c) =>
        c.userId === characterUpdate.userId
          ? {
              ...c,
              name: characterUpdate.character.name,
              portrait: characterUpdate.character.portrait,
              knockoutPips: characterUpdate.character.knockoutPips,
              currentGrit: characterUpdate.character.currentGrit,
              maxGrit: maxGrit(characterUpdate.character.stats),
            }
          : c
      )
    );
  }, [characterUpdate]);

  function togglePip(character, index) {
    const nextPips = character.knockoutPips.map((v, i) => (i === index ? !v : v));
    setCharacters((prev) => prev.map((c) => (c.id === character.id ? { ...c, knockoutPips: nextPips } : c)));
    fetch(`/api/characters/${character.userId}/knockout`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ knockoutPips: nextPips }),
    }).catch(() => {});
  }

  async function handleHealAll() {
    if (healing) return;
    setHealing(true);
    try {
      await fetch("/api/characters/heal-all", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      // The server's "party-healed" broadcast drives the actual roster
      // re-sync (see the effect above); refetch here too so the DM who
      // clicked sees it immediately without waiting on the socket.
      refetch();
    } catch {
      // the party-healed broadcast will catch it up either way
    } finally {
      setHealing(false);
    }
  }

  if (characters.length === 0) {
    return null;
  }

  return (
    <div className="panel panel--quiet roster">
      <div className="panel-header">
        <span className="panel-header-icon">
          <UsersThreeIcon weight="duotone" />
        </span>
        <div className="panel-header-text">
          <h2>Roster</h2>
          <p>Everyone at the table</p>
        </div>
        {healable && (
          <button type="button" className="panel-btn panel-btn--ghost roster-heal-all" disabled={healing} onClick={handleHealAll}>
            <HeartStraightIcon weight="bold" />
            {healing ? "Healing..." : "Heal All"}
          </button>
        )}
      </div>
      <div className="panel-body roster-body">
        <div className="roster-grid">
        {characters.map((character) => {
          const online = onlineUserIds.has(character.userId);
          const isSelected = selectable && character.userId === selectedUserId;
          return (
            <div
              key={character.id}
              className={`roster-chip ${online ? "roster-chip--online" : ""} ${
                selectable ? "roster-chip--selectable" : ""
              } ${isSelected ? "roster-chip--selected" : ""}`}
              onClick={selectable ? () => onSelect?.(character) : undefined}
              role={selectable ? "button" : undefined}
              tabIndex={selectable ? 0 : undefined}
            >
              <span className="roster-portrait">
                <GritRing current={character.currentGrit} max={character.maxGrit} />
                {character.portrait ? (
                  <img src={character.portrait} alt={character.name} />
                ) : (
                  <UserCircleIcon weight="duotone" />
                )}
                <KnockoutPips
                  size="sm"
                  pips={character.knockoutPips}
                  editable={selectable}
                  onToggle={(i) => togglePip(character, i)}
                />
              </span>
              <span className="roster-name">{character.name}</span>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
