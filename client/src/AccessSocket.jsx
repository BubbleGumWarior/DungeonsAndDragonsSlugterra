import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

const LiveStateContext = createContext(null);

export function useLiveState() {
  const ctx = useContext(LiveStateContext);
  if (!ctx) throw new Error("useLiveState must be used within AccessSocket");
  return ctx;
}

export default function AccessSocket({ children }) {
  const { token, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());
  const [slugterraRevealed, setSlugterraRevealed] = useState(false);
  const [characterUpdate, setCharacterUpdate] = useState(null);
  const [slugUpdate, setSlugUpdate] = useState(null);
  const [blasterUpdate, setBlasterUpdate] = useState(null);
  const [modUpdate, setModUpdate] = useState(null);
  const [mechaUpdate, setMechaUpdate] = useState(null);
  const [mechaModUpdate, setMechaModUpdate] = useState(null);
  const [chatMessage, setChatMessage] = useState(null);
  const [challengeIssued, setChallengeIssued] = useState(null);
  const [challengeRollAdded, setChallengeRollAdded] = useState(null);
  const [challengeRollRemoved, setChallengeRollRemoved] = useState(null);
  const [challengeFinished, setChallengeFinished] = useState(null);
  const [diceRollOffered, setDiceRollOffered] = useState(null);
  const [encounter, setEncounter] = useState(null);
  const [counterOffered, setCounterOffered] = useState(null);
  const [knockoutRollOffered, setKnockoutRollOffered] = useState(null);
  const [shotFx, setShotFx] = useState(null);
  const [shotResolved, setShotResolved] = useState(null);
  const [combatLogEntry, setCombatLogEntry] = useState(null);
  const [npcTemplatesUpdate, setNpcTemplatesUpdate] = useState(null);
  const [slugpediaUpdate, setSlugpediaUpdate] = useState(null);

  useEffect(() => {
    if (!token) return;

    fetch("/api/settings", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setSlugterraRevealed(Boolean(data.slugterraRevealed)))
      .catch(() => {});

    fetch("/api/presence/online", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setOnlineUserIds(new Set(data.onlineUserIds || [])))
      .catch(() => {});

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(
      `${protocol}://${window.location.host}/ws?token=${encodeURIComponent(token)}`
    );

    socket.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === "account-deleted") {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      if (data.type === "access-approved") {
        updateUser((prev) => (prev ? { ...prev, status: "approved" } : prev));
        navigate("/dashboard", { replace: true });
        return;
      }

      if (data.type === "access-revoked") {
        updateUser((prev) => (prev ? { ...prev, status: "revoked" } : prev));
        navigate("/request-access", { replace: true });
        return;
      }

      if (data.type === "presence") {
        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          if (data.online) {
            next.add(data.userId);
          } else {
            next.delete(data.userId);
          }
          return next;
        });
        return;
      }

      if (data.type === "slugterra-revealed") {
        setSlugterraRevealed(Boolean(data.revealed));
        return;
      }

      if (data.type === "character-updated") {
        setCharacterUpdate({ userId: data.userId, character: data.character, at: Date.now() });
        return;
      }

      if (data.type === "slug-updated") {
        setSlugUpdate({ userId: data.userId, slug: data.slug, slugId: data.slugId, at: Date.now() });
        return;
      }

      if (data.type === "blaster-updated") {
        setBlasterUpdate({ userId: data.userId, blaster: data.blaster, blasterId: data.blasterId, at: Date.now() });
        return;
      }

      if (data.type === "mod-updated") {
        setModUpdate({ userId: data.userId, mod: data.mod, modId: data.modId, at: Date.now() });
        return;
      }

      if (data.type === "mecha-updated") {
        setMechaUpdate({ userId: data.userId, mecha: data.mecha, mechaId: data.mechaId, at: Date.now() });
        return;
      }

      if (data.type === "mecha-mod-updated") {
        setMechaModUpdate({ userId: data.userId, mod: data.mod, modId: data.modId, at: Date.now() });
        return;
      }

      if (data.type === "chat-message") {
        setChatMessage(data.message);
        return;
      }

      if (data.type === "challenge-issued") {
        setChallengeIssued({ challenge: data.challenge, rolls: data.rolls, at: Date.now() });
        return;
      }

      if (data.type === "challenge-roll-added") {
        setChallengeRollAdded({ challengeId: data.challengeId, roll: data.roll, at: Date.now() });
        return;
      }

      if (data.type === "challenge-roll-removed") {
        setChallengeRollRemoved({ challengeId: data.challengeId, userId: data.userId, at: Date.now() });
        return;
      }

      if (data.type === "challenge-finished") {
        setChallengeFinished({ challenge: data.challenge, winners: data.winners, highest: data.highest, at: Date.now() });
        return;
      }

      if (data.type === "dice-roll-offered") {
        setDiceRollOffered(data.offer);
        return;
      }

      if (data.type === "encounter-updated") {
        setEncounter(data.encounter);
        return;
      }

      if (data.type === "counter-offered") {
        setCounterOffered(data.offer);
        return;
      }

      if (data.type === "combat-shot-fx") {
        setShotFx(data.fx);
        return;
      }

      if (data.type === "combat-shot-resolved") {
        setShotResolved(data.resolved);
        return;
      }

      if (data.type === "knockout-roll-offered") {
        setKnockoutRollOffered(data.offer);
        return;
      }

      if (data.type === "combat-log-entry") {
        setCombatLogEntry({ encounterId: data.encounterId, entry: data.entry, at: Date.now() });
        return;
      }

      if (data.type === "npc-templates-updated") {
        setNpcTemplatesUpdate(Date.now());
        return;
      }

      if (data.type === "slugpedia-updated") {
        setSlugpediaUpdate(Date.now());
      }
    };

    return () => socket.close();
  }, [token, updateUser, logout, navigate]);

  return (
    <LiveStateContext.Provider
      value={{
        onlineUserIds,
        slugterraRevealed,
        characterUpdate,
        slugUpdate,
        blasterUpdate,
        modUpdate,
        mechaUpdate,
        mechaModUpdate,
        chatMessage,
        challengeIssued,
        challengeRollAdded,
        challengeRollRemoved,
        challengeFinished,
        diceRollOffered,
        encounter,
        counterOffered,
        knockoutRollOffered,
        shotFx,
        shotResolved,
        combatLogEntry,
        npcTemplatesUpdate,
        slugpediaUpdate,
      }}
    >
      {children}
    </LiveStateContext.Provider>
  );
}
