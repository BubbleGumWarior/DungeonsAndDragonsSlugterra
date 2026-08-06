import { useEffect, useState } from "react";
import { UserCircleIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { maxGrit } from "./characterData.js";
import KnockoutPips from "./KnockoutPips.jsx";
import GritRing from "./GritRing.jsx";
import "./Panel.css";
import "./Roster.css";

export default function Roster({ selectable = false, selectedUserId, onSelect }) {
  const { token } = useAuth();
  const { onlineUserIds, characterUpdate } = useLiveState();
  const [characters, setCharacters] = useState([]);

  useEffect(() => {
    fetch("/api/characters", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setCharacters(data.characters || []))
      .catch(() => {});
  }, [token]);

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
