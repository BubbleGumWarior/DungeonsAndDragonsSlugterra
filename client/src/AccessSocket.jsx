import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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
  const [partyHealed, setPartyHealed] = useState(null);
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
  const [slugHuntArea, setSlugHuntArea] = useState(0);
  const [slugHuntOffered, setSlugHuntOffered] = useState(null);
  const [slugHuntUpdated, setSlugHuntUpdated] = useState(null);
  const [slugHuntResolved, setSlugHuntResolved] = useState(null);
  const [slugHuntLock, setSlugHuntLock] = useState(null);
  const [damageFlash, setDamageFlash] = useState(null);
  const [voiceRoster, setVoiceRoster] = useState([]);
  // A plain "latest signal" state slot silently drops messages: ICE
  // candidates arrive in a rapid burst right after an offer/answer, and if
  // several land in the same React batch, only the last one's effect
  // actually fires -- losing everything in between, including the offer
  // itself (confirmed live: the offer was received here but never reached
  // handleSignal). voiceSignalQueueRef is a real queue nothing overwrites;
  // voiceSignalTick is just a counter bumped to tell consumers "go drain
  // it," since the queue's contents living in a ref (not state) don't
  // themselves trigger a re-render.
  const voiceSignalQueueRef = useRef([]);
  const [voiceSignalTick, setVoiceSignalTick] = useState(0);
  // Bumped on every successful (re)connect, including an automatic
  // reconnect after a drop -- consumers that need to re-announce
  // themselves to the server once the socket comes back (VoiceChatContext
  // re-sending voice-join if it still thinks it's in a call) watch this
  // rather than trying to infer "did we just reconnect" themselves.
  const [wsConnectedAt, setWsConnectedAt] = useState(null);
  const socketRef = useRef(null);

  // useNavigate()'s return value is not guaranteed to keep a stable
  // identity across renders (confirmed here: it was the actual cause of a
  // real bug -- see the big effect below). It's only ever called from
  // inside the socket's onmessage handler, never needed at effect-setup
  // time, so a ref is enough: this keeps it current without making the
  // connection effect depend on it.
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  // Lets VoiceChatContext (and anything else) push messages out over the
  // one shared /ws connection instead of opening a second socket -- mirrors
  // how every inbound event type below is demuxed into its own piece of
  // state for whichever component cares. Stable identity (empty deps --
  // it only ever reads the live socketRef, never closes over state) is
  // load-bearing: this component re-renders on every inbound event
  // (including voice-roster itself), and VoiceChatContext's joinCall/
  // leaveCall/etc. all depend on this function -- an unstable identity
  // here would cascade into those on every unrelated re-render.
  const sendMessage = useCallback((payload) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    fetch("/api/settings", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        setSlugterraRevealed(Boolean(data.slugterraRevealed));
        if (Number.isInteger(data.slugHuntArea)) setSlugHuntArea(data.slugHuntArea);
      })
      .catch(() => {});

    fetch("/api/presence/online", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setOnlineUserIds(new Set(data.onlineUserIds || [])))
      .catch(() => {});

    // Self-healing connection: a dropped/failed socket used to just sit
    // dead until someone manually reloaded the page -- rough over any path
    // with real internet variance (a tunnel, a port-forward, a flaky WiFi
    // moment), where a single connection attempt can fail for reasons that
    // have nothing to do with the app. connect() below reopens on its own
    // with backoff instead of requiring a refresh.
    let intentionalClose = false;
    let failedAttempts = 0;
    let reconnectTimer = null;

    // A handshake that fails before ever reaching the server (some
    // connection paths -- notably a raw router port-forward -- can be
    // intermittently flaky specifically for the WebSocket upgrade even
    // when everything else works) is often just as likely to succeed on
    // an immediate retry as after a long wait, so the first few attempts
    // retry almost instantly instead of already backing off. Only settles
    // into real backoff (and a lower cap than before -- worst case is now
    // 5s between tries, not 10s) if it keeps failing.
    function nextDelay() {
      if (failedAttempts <= 3) return 300;
      return Math.min(1000 * 2 ** (failedAttempts - 3), 5000);
    }

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(
        `${protocol}://${window.location.host}/ws?token=${encodeURIComponent(token)}`
      );
      socketRef.current = socket;

      socket.onopen = () => {
        failedAttempts = 0; // a connection that actually opened earns a fresh backoff
        setWsConnectedAt(Date.now());
      };

      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (intentionalClose) return;
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, nextDelay());
        failedAttempts += 1;
      };

      socket.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === "account-deleted") {
        logout();
        navigateRef.current("/login", { replace: true });
        return;
      }

      if (data.type === "access-approved") {
        updateUser((prev) => (prev ? { ...prev, status: "approved" } : prev));
        navigateRef.current("/dashboard", { replace: true });
        return;
      }

      if (data.type === "access-revoked") {
        updateUser((prev) => (prev ? { ...prev, status: "revoked" } : prev));
        navigateRef.current("/request-access", { replace: true });
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

      if (data.type === "party-healed") {
        setPartyHealed({ at: Date.now() });
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
        return;
      }

      if (data.type === "slug-hunt-area") {
        setSlugHuntArea(data.area);
        return;
      }

      if (data.type === "slug-hunt-offered") {
        setSlugHuntOffered({ hunt: data.hunt, at: Date.now() });
        return;
      }

      if (data.type === "slug-hunt-updated") {
        setSlugHuntUpdated({ hunt: data.hunt, at: Date.now() });
        return;
      }

      if (data.type === "slug-hunt-resolved") {
        setSlugHuntResolved({ id: data.id, outcome: data.outcome, slugName: data.slugName, slugType: data.slugType, at: Date.now() });
        return;
      }

      if (data.type === "slug-hunt-lock") {
        setSlugHuntLock({ userId: data.userId, locked: data.locked, all: Boolean(data.all), at: Date.now() });
        return;
      }

      // Only ever sent via notifyUser to the specific player whose
      // combatant took the hit (see combat.js's tickPods) -- this socket
      // only receives it at all if it's meant for this player, no userId
      // check needed client-side.
      if (data.type === "combat-damage-flash") {
        setDamageFlash({ combatantId: data.combatantId, at: Date.now() });
        return;
      }

      if (data.type === "voice-roster") {
        setVoiceRoster(data.participants || []);
        return;
      }

      if (data.type === "voice-signal") {
        console.log(`[voice] AccessSocket received voice-signal from ${data.from}: kind=${data.signal?.kind}`);
        voiceSignalQueueRef.current.push({ from: data.from, signal: data.signal });
        setVoiceSignalTick((t) => t + 1);
      }
      };
    }

    connect();

    return () => {
      intentionalClose = true;
      clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
    // navigate deliberately excluded -- see navigateRef above; including it
    // here was the actual cause of the connection endlessly tearing down
    // and reopening before ever finishing its handshake.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, updateUser, logout]);

  return (
    <LiveStateContext.Provider
      value={{
        onlineUserIds,
        slugterraRevealed,
        characterUpdate,
        partyHealed,
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
        slugHuntArea,
        slugHuntOffered,
        slugHuntUpdated,
        slugHuntResolved,
        slugHuntLock,
        damageFlash,
        voiceRoster,
        voiceSignalQueueRef,
        voiceSignalTick,
        wsConnectedAt,
        sendMessage,
      }}
    >
      {children}
    </LiveStateContext.Provider>
  );
}
