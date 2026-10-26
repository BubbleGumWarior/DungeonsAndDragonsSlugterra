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
  const { user, token, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());
  // Players only see the Slugterra side of the app once they've created a
  // character; until then the app stays "hidden". The DM always sees it all.
  const [hasCharacter, setHasCharacter] = useState(false);
  // Whether the initial settings + character fetches have resolved. Route
  // guards need this so they don't bounce a player off a legitimately-revealed
  // page during the brief window before the real value arrives.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const userId = user?.id;
  const slugterraRevealed = user?.role === "Dungeon Master" || hasCharacter;
  const [characterUpdate, setCharacterUpdate] = useState(null);
  const [characterCreated, setCharacterCreated] = useState(null);
  const [partyHealed, setPartyHealed] = useState(null);
  // A player's equipment (melee weapon / ammo belt) or the blaster magazines it
  // feeds changed -- a single signal; consumers refetch (see ammoBelt.js).
  const [equipmentChanged, setEquipmentChanged] = useState(null);
  // The DM put the party to sleep: carries the rest's summary (who went
  // hungry, the market's new mood) for the sleep overlay.
  const [longRest, setLongRest] = useState(null);
  // When this client's sleep overlay began to lift. The Roster's "party is
  // asleep" indicator lasts exactly until then, so the two change together.
  const [restWokenAt, setRestWokenAt] = useState(0);
  const markRestWoken = useCallback(() => setRestWokenAt(Date.now()), []);
  // Single "it happened" signals for the market and trading: consumers
  // refetch from the server instead of trusting a payload (see the
  // single-slot note on voiceSignalQueueRef below).
  const [marketChanged, setMarketChanged] = useState(null);
  const [tradeChanged, setTradeChanged] = useState(null);
  const [combatReportReady, setCombatReportReady] = useState(null);
  const [tradeCompleted, setTradeCompleted] = useState(null);
  const [podsUpdate, setPodsUpdate] = useState(null);
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
  // Every counter offer received, not just the latest: when several shooters
  // fire at once the single slot above would only ever hold the last one.
  const [counterOffers, setCounterOffers] = useState([]);
  const [knockoutRollOffered, setKnockoutRollOffered] = useState(null);
  const [shotFx, setShotFx] = useState(null);
  // Best-effort "a shooter armed this slug" heads-up (a single latest slot --
  // fine here, it only warms an image cache; see slugImageCache.js).
  const [slugArmed, setSlugArmed] = useState(null);
  // An NPC/grunt was just kitted out with blasters and slugs -- see
  // equipNpcCombatant. Consumers refetch their gear lists on it.
  const [gearChanged, setGearChanged] = useState(null);
  // What the party knows of the foes' slugs changed (an Insight read, or a foe
  // fired one) -- a single signal; the roster refetches its own view.
  const [slugKnowledgeChanged, setSlugKnowledgeChanged] = useState(null);
  // A player's slug earned loyalty (a shot was fired) -- consumers refetch the
  // slug list, since slug-updated is a single slot and a dual shot sends two.
  const [slugLoyaltyChanged, setSlugLoyaltyChanged] = useState(null);
  // One of this player's slugs just rose a loyalty tier.
  const [slugTierUp, setSlugTierUp] = useState(null);
  const [shotResolved, setShotResolved] = useState(null);
  const [combatLogEntry, setCombatLogEntry] = useState(null);
  const [npcTemplatesUpdate, setNpcTemplatesUpdate] = useState(null);
  const [gruntTemplatesUpdate, setGruntTemplatesUpdate] = useState(null);
  const [slugpediaUpdate, setSlugpediaUpdate] = useState(null);
  const [shipUpdate, setShipUpdate] = useState(null);
  const [travelUpdate, setTravelUpdate] = useState(null);
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
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);
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

    setHasCharacter(false);
    const settingsLoad = fetch("/api/settings", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (Number.isInteger(data.slugHuntArea)) setSlugHuntArea(data.slugHuntArea);
      })
      .catch(() => {});
    const characterLoad = fetch("/api/characters/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setHasCharacter(Boolean(data.character)))
      .catch(() => {});
    Promise.all([settingsLoad, characterLoad]).finally(() => setSettingsLoaded(true));

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

      // App-level heartbeat (see ws.js) -- just needs a reply so the server
      // knows the connection is still alive; nothing else consumes this.
      if (data.type === "ping") {
        sendMessage({ type: "pong" });
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

      if (data.type === "character-updated") {
        setCharacterUpdate({ userId: data.userId, character: data.character, at: Date.now() });
        return;
      }

      if (data.type === "character-created") {
        if (data.userId === userIdRef.current) setHasCharacter(true);
        setCharacterCreated({ userId: data.userId, at: Date.now() });
        return;
      }

      if (data.type === "market-changed") {
        setMarketChanged(data.at ?? Date.now());
        return;
      }
      if (data.type === "combat-report-ready") {
        setCombatReportReady({ reportId: data.reportId, name: data.encounterName, at: data.at });
        return;
      }
      if (data.type === "trade-changed") {
        setTradeChanged({ event: data.event, tradeId: data.tradeId, at: data.at });
        return;
      }
      if (data.type === "trade-completed") {
        setTradeCompleted({ userIds: data.userIds, at: data.at });
        return;
      }
      if (data.type === "pods-updated") {
        setPodsUpdate({ userId: data.userId, pods: data.pods, at: Date.now() });
        return;
      }
      if (data.type === "equipment-changed") {
        setEquipmentChanged({ userId: data.userId, at: data.at ?? Date.now() });
        return;
      }
      if (data.type === "party-healed") {
        setPartyHealed({ at: Date.now() });
        return;
      }
      if (data.type === "long-rest") {
        setLongRest({
          at: data.at,
          receivedAt: Date.now(),
          rested: data.rested,
          skippedInCombat: data.skippedInCombat,
          slugEvents: data.slugEvents || [],
          marketMood: data.marketMood || null,
          day: data.day || null,
        });
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
        setCounterOffers((prev) => [...prev.filter((o) => o.id !== data.offer.id), data.offer].slice(-8));
        return;
      }

      if (data.type === "combat-gear-changed") {
        setGearChanged(data.at ?? Date.now());
        return;
      }

      if (data.type === "slug-loyalty-changed") {
        setSlugLoyaltyChanged({ userId: data.userId, at: Date.now() });
        return;
      }

      if (data.type === "slug-tier-up") {
        setSlugTierUp({ slugId: data.slugId, slugName: data.slugName, tier: data.tier, at: Date.now() });
        return;
      }

      if (data.type === "combat-slug-knowledge") {
        setSlugKnowledgeChanged(Date.now());
        return;
      }

      if (data.type === "combat-slug-armed") {
        setSlugArmed({ slugId: data.slugId, at: data.at });
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

      if (data.type === "grunt-templates-updated") {
        setGruntTemplatesUpdate(Date.now());
        return;
      }

      if (data.type === "slugpedia-updated") {
        setSlugpediaUpdate(Date.now());
        return;
      }

      if (data.type === "ship-updated") {
        setShipUpdate(Date.now());
        return;
      }

      // Votes, proposals, departures and each day of the voyage all ride one
      // bare "refetch" nudge, so a burst can't drop one.
      if (data.type === "travel-updated") {
        setTravelUpdate(Date.now());
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
        settingsLoaded,
        characterUpdate,
        characterCreated,
        partyHealed,
        equipmentChanged,
        longRest,
        restWokenAt,
        markRestWoken,
        marketChanged,
        combatReportReady,
        tradeChanged,
        tradeCompleted,
        podsUpdate,
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
        counterOffers,
        knockoutRollOffered,
        shotFx,
        slugArmed,
        gearChanged,
        slugKnowledgeChanged,
        slugLoyaltyChanged,
        slugTierUp,
        shotResolved,
        combatLogEntry,
        npcTemplatesUpdate,
        gruntTemplatesUpdate,
        slugpediaUpdate,
        shipUpdate,
        travelUpdate,
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
