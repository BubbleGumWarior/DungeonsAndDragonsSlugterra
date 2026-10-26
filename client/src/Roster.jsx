import { useCallback, useEffect, useRef, useState } from "react";
import { FireIcon, MoonStarsIcon, UserCircleIcon, UsersThreeIcon, WarningIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { heatColor, maxGrit } from "./characterData.js";
import KnockoutPips from "./KnockoutPips.jsx";
import GritRing from "./GritRing.jsx";
import { FOOD_DRAIN_PER_REST } from "./careData.js";
import "./Panel.css";
import "./Roster.css";

// If the sleep overlay was somehow never dismissed, stop calling the party
// asleep after this long.
const MAX_ASLEEP_MS = 15 * 60 * 1000;
// Between the DM's request finishing and the long-rest broadcast arriving.
const PENDING_REST_MS = 5000;

export default function Roster({ selectable = false, selectedUserId, onSelect, healable = false }) {
  const { token } = useAuth();
  const { onlineUserIds, characterUpdate, characterCreated, partyHealed, longRest, restWokenAt } = useLiveState();
  const [characters, setCharacters] = useState([]);
  // idle -> confirming (DM reviewing what the rest will cost) -> waiting (the
  // request is done, the broadcast is on its way) -> idle. "Asleep" itself is
  // derived: it lasts from the long-rest broadcast until this client's sleep
  // overlay starts to lift (restWokenAt), so the indicator and the fade-back
  // to light change at the same moment.
  const [restPhase, setRestPhase] = useState("idle");
  const [preview, setPreview] = useState(null);
  const [restError, setRestError] = useState(null);
  const wakeTimer = useRef(null);

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
              maxGrit: maxGrit(characterUpdate.character.stats, characterUpdate.character.gritBonus),
              fame: characterUpdate.character.fame,
              heat: characterUpdate.character.heat,
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

  // The broadcast has arrived, so the "waiting" stand-in can step aside.
  useEffect(() => {
    if (longRest) setRestPhase("idle");
  }, [longRest]);

  useEffect(() => () => clearTimeout(wakeTimer.current), []);

  // longRest lives in the socket context and outlasts this component, hence
  // the age cap: a rest from long ago must not show on a remount.
  const asleep =
    restPhase === "waiting" ||
    (Boolean(longRest) && restWokenAt < longRest.receivedAt && Date.now() - longRest.receivedAt < MAX_ASLEEP_MS);

  function openConfirm() {
    setRestError(null);
    setPreview(null);
    setRestPhase("confirming");
    fetch("/api/characters/long-rest/preview", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setPreview(data))
      .catch(() => setPreview({ starving: [], skippedInCombat: 0 }));
  }

  async function handleLongRest() {
    setRestError(null);
    try {
      const res = await fetch("/api/characters/long-rest", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not put the party to sleep.");
      }
      setRestPhase("waiting");
      clearTimeout(wakeTimer.current);
      wakeTimer.current = setTimeout(() => setRestPhase((p) => (p === "waiting" ? "idle" : p)), PENDING_REST_MS);
      // The server's "party-healed" broadcast drives the actual roster
      // re-sync (see the effect above); refetch here too so the DM who
      // clicked sees it immediately without waiting on the socket.
      refetch();
    } catch (err) {
      setRestError(err.message);
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
        {asleep ? (
          <span className="roster-asleep" role="status">
            <MoonStarsIcon weight="fill" />
            The party is asleep
          </span>
        ) : (
          healable &&
          restPhase !== "confirming" && (
            <button type="button" className="panel-btn panel-btn--ghost roster-rest" onClick={openConfirm}>
              <MoonStarsIcon weight="bold" />
              Long Rest
            </button>
          )
        )}
      </div>
      {healable && restPhase === "confirming" && (
        <div className="roster-confirm" role="group" aria-label="Confirm long rest">
          <div className="roster-confirm-text">
            <p className="roster-confirm-title">Put the party to sleep?</p>
            <p>
              Everyone not in a fight heals fully and their slugs recharge. Every slug loses {FOOD_DRAIN_PER_REST}% of its
              food, and the merchants wake up in a new mood.
            </p>
            {preview?.skippedInCombat > 0 && (
              <p className="roster-confirm-note">
                {preview.skippedInCombat} {preview.skippedInCombat === 1 ? "character is" : "characters are"} in combat and will
                not rest.
              </p>
            )}
            {preview?.starving?.length > 0 && (
              <ul className="roster-confirm-starving">
                {preview.starving.map((s) => (
                  <li key={s.slugId}>
                    <WarningIcon weight="fill" />
                    <span>
                      <strong>{s.slugName}</strong>
                      {s.ownerName ? ` (${s.ownerName})` : ""} is starving and will{" "}
                      {s.outcome === "leave" ? "leave the party" : "lose a loyalty tier"}.
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {restError && <p className="panel-error">{restError}</p>}
          </div>
          <div className="roster-confirm-actions">
            <button type="button" className="panel-btn panel-btn--ghost" onClick={() => setRestPhase("idle")}>
              Not yet
            </button>
            <button type="button" className="panel-btn" onClick={handleLongRest}>
              <MoonStarsIcon weight="bold" />
              Sleep
            </button>
          </div>
        </div>
      )}
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
              {character.heat > 0 && (
                <span className="roster-heat" title="Heat" style={{ color: heatColor(character.heat) }}>
                  <FireIcon weight="fill" />
                  {character.heat}
                </span>
              )}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
