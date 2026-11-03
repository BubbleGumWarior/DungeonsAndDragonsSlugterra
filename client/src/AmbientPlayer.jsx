import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { HandTapIcon, SpeakerHighIcon, SpeakerSlashIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { volumeToGain } from "./soundVolume.js";
import "./AmbientPlayer.css";

// Everyone's end of the DM's Sound Desk (SoundDesk.jsx / routes/sounds.js):
// the looping ambience bed, played in sync, and the one-shot soundboard
// effects. Mounted once above <Routes> like the voice chat, so music carries
// across page changes.
//
// Output goes through Web Audio rather than <audio>.volume: iOS Safari
// ignores element volume entirely, and a gain node is also what makes the
// crossfades smooth. The consequence is the autoplay rule applies to the
// AudioContext -- until the person has tapped something on this page it
// stays suspended, and the chip below asks for that tap.
const AmbientContext = createContext(null);

export function useAmbient() {
  const ctx = useContext(AmbientContext);
  if (!ctx) throw new Error("useAmbient must be used within AmbientProvider");
  return ctx;
}

const FADE_IN_MS = 1800;
const FADE_OUT_MS = 1200;
const CROSSFADE_MS = 2000;
const DRIFT_TOLERANCE_S = 0.6;
const DRIFT_CHECK_MS = 10000;
const MAX_CONCURRENT_EFFECTS = 12;
const MUTE_KEY = "soundDeskMuted";

function loadMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

// Where in the loop the shared bed is "right now". The server only knows when
// position 0 happened (or where it was paused), so everyone derives the same
// beat from the clock, wrapped to the track length.
function loopPositionMs(state, durationMs, nowServerMs) {
  const raw = state.playing ? nowServerMs - state.startedAtMs : state.pausedAtMs;
  if (!(durationMs > 0)) return Math.max(0, raw);
  return ((raw % durationMs) + durationMs) % durationMs;
}

export default function AmbientProvider({ children }) {
  const { token, user } = useAuth();
  const { ambientChangedTick, soundEventQueueRef, soundEventTick, wsConnectedAt } = useLiveState();
  const location = useLocation();

  const [ambient, setAmbient] = useState(null);
  const [localMuted, setLocalMutedState] = useState(loadMuted);
  const [contextRunning, setContextRunning] = useState(false);

  const audioContextRef = useRef(null);
  const deckRef = useRef(null); // { el, source, gain, url } for the bed that's up
  const effectsRef = useRef(new Set()); // { el, cleanup } for effects still sounding
  const clockOffsetRef = useRef(0); // server clock minus this device's clock
  const ambientRef = useRef(null);

  const ambientListenerVolume = typeof user?.ambientVolume === "number" ? user.ambientVolume : 0.7;
  const soundboardListenerVolume = typeof user?.soundboardVolume === "number" ? user.soundboardVolume : 0.8;
  const listenerRef = useRef({ ambient: ambientListenerVolume, soundboard: soundboardListenerVolume, muted: localMuted });
  listenerRef.current = { ambient: ambientListenerVolume, soundboard: soundboardListenerVolume, muted: localMuted };

  const setLocalMuted = useCallback((next) => {
    setLocalMutedState(next);
    try {
      window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    } catch {
      // Blocked storage: the mute just won't survive a reload.
    }
  }, []);

  // ---------------------------------------------------------------- audio context
  const getContext = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current;
    const ContextClass = window.AudioContext || window.webkitAudioContext;
    if (!ContextClass) return null;
    const ctx = new ContextClass();
    ctx.onstatechange = () => setContextRunning(ctx.state === "running");
    setContextRunning(ctx.state === "running");
    audioContextRef.current = ctx;
    return ctx;
  }, []);

  const resumeAudio = useCallback(() => {
    const ctx = getContext();
    if (ctx && ctx.state !== "running") ctx.resume().catch(() => {});
  }, [getContext]);

  // ---------------------------------------------------------------- shared state
  const serverNow = () => Date.now() + clockOffsetRef.current;

  // The bed's actual length, preferring what the loaded file reports over the
  // duration the DM's browser measured at upload.
  function trackDurationMs(state) {
    const deck = deckRef.current;
    if (deck && state && deck.url === state.url && Number.isFinite(deck.el.duration) && deck.el.duration > 0) {
      return deck.el.duration * 1000;
    }
    return state?.durationMs ?? 0;
  }

  const getPositionMs = useCallback(() => {
    const state = ambientRef.current;
    if (!state || !state.url) return 0;
    return loopPositionMs(state, trackDurationMs(state), serverNow());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetching (rather than trusting the broadcast) is what makes late joiners,
  // reconnects and a burst of DM clicks all converge, and the round trip
  // doubles as the clock measurement: the server stamped serverNow midway
  // through it, so offset = serverNow - the request's midpoint.
  const refresh = useCallback(async () => {
    if (!token) return;
    const sentAt = Date.now();
    try {
      const res = await fetch("/api/sounds/ambient", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      clockOffsetRef.current = data.ambient.serverNow - (sentAt + Date.now()) / 2;
      ambientRef.current = data.ambient;
      setAmbient(data.ambient);
    } catch {
      // Offline blip: the next socket reconnect refetches.
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      // Signed out: nothing should keep playing behind the login screen.
      ambientRef.current = null;
      setAmbient(null);
      return;
    }
    refresh();
  }, [token, refresh, ambientChangedTick, wsConnectedAt]);

  // A backgrounded phone throttles timers; re-read the truth on return.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refresh]);

  // ---------------------------------------------------------------- the ambience bed
  function bedGain(state) {
    const { ambient: listener, muted } = listenerRef.current;
    if (muted) return 0;
    return volumeToGain(listener) * state.volume * state.soundVolume;
  }

  function createDeck(url) {
    const ctx = getContext();
    const el = new Audio();
    el.preload = "auto";
    el.loop = true;
    el.src = url;
    const source = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(ctx.destination);
    return { el, source, gain, url };
  }

  function retireDeck(deck, fadeMs) {
    const ctx = audioContextRef.current;
    if (ctx) {
      deck.gain.gain.cancelScheduledValues(ctx.currentTime);
      deck.gain.gain.setTargetAtTime(0, ctx.currentTime, fadeMs / 3000);
    }
    setTimeout(() => {
      deck.el.pause();
      deck.el.removeAttribute("src");
      deck.el.load();
      deck.source.disconnect();
      deck.gain.disconnect();
    }, fadeMs + 150);
  }

  // Put the element on the beat everyone else is on.
  function seekDeck(deck, state, force) {
    const wanted = loopPositionMs(state, trackDurationMs(state), serverNow()) / 1000;
    const duration = deck.el.duration;
    let drift = Math.abs(deck.el.currentTime - wanted);
    if (Number.isFinite(duration) && duration > 0) drift = Math.min(drift, duration - drift); // across the loop seam
    if (force || drift > DRIFT_TOLERANCE_S) deck.el.currentTime = wanted;
  }

  function fadeDeckTo(deck, target, durationS) {
    const ctx = audioContextRef.current;
    const param = deck.gain.gain;
    param.cancelScheduledValues(ctx.currentTime);
    param.setValueAtTime(param.value, ctx.currentTime);
    param.linearRampToValueAtTime(target, ctx.currentTime + durationS);
  }

  function startDeck(deck, state, fadeMs) {
    const begin = () => {
      seekDeck(deck, state, true);
      deck.el.play().catch(() => {});
      fadeDeckTo(deck, bedGain(state), fadeMs / 1000);
    };
    if (deck.el.readyState >= 1) begin();
    else deck.el.addEventListener("loadedmetadata", begin, { once: true });
  }

  useEffect(() => {
    const state = ambient;
    const deck = deckRef.current;
    const wanted = Boolean(state?.playing && state.url);

    if (!wanted) {
      if (deck) {
        retireDeck(deck, FADE_OUT_MS);
        deckRef.current = null;
      }
      return;
    }

    if (!audioContextRef.current && !getContext()) return;

    if (!deck || deck.url !== state.url) {
      if (deck) retireDeck(deck, CROSSFADE_MS);
      const next = createDeck(state.url);
      deckRef.current = next;
      startDeck(next, state, deck ? CROSSFADE_MS : FADE_IN_MS);
      return;
    }

    // Same track: a resume, a volume move, a mute, or the context waking up.
    if (deck.el.paused) {
      startDeck(deck, state, FADE_IN_MS);
    } else {
      seekDeck(deck, state, false);
      const ctx = audioContextRef.current;
      deck.gain.gain.setTargetAtTime(bedGain(state), ctx.currentTime, 0.08);
    }
    // The helpers read refs, so the data they depend on is what re-runs this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambient, localMuted, ambientListenerVolume, contextRunning]);

  useEffect(() => {
    if (!ambient?.playing) return undefined;
    const interval = setInterval(() => {
      const deck = deckRef.current;
      if (deck && !deck.el.paused && ambientRef.current) seekDeck(deck, ambientRef.current, false);
    }, DRIFT_CHECK_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambient?.playing]);

  // ---------------------------------------------------------------- soundboard effects
  function stopEffects() {
    for (const effect of [...effectsRef.current]) effect.cleanup();
  }

  function playEffect(event) {
    const ctx = getContext();
    if (!ctx) return;
    resumeAudio();

    while (effectsRef.current.size >= MAX_CONCURRENT_EFFECTS) {
      effectsRef.current.values().next().value.cleanup();
    }

    const { soundboard, muted } = listenerRef.current;
    const el = new Audio(event.url);
    const source = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = muted ? 0 : volumeToGain(soundboard) * clamp01(event.volume);
    source.connect(gain);
    gain.connect(ctx.destination);

    const effect = {
      el,
      cleanup() {
        effectsRef.current.delete(effect);
        el.pause();
        source.disconnect();
        gain.disconnect();
      },
    };
    effectsRef.current.add(effect);
    el.addEventListener("ended", effect.cleanup, { once: true });
    el.addEventListener("error", effect.cleanup, { once: true });
    el.play().catch(effect.cleanup);
  }

  // Drains the whole queue each time, never just the latest -- see the note on
  // soundEventQueueRef in AccessSocket.jsx.
  useEffect(() => {
    const batch = soundEventQueueRef.current.splice(0);
    for (const event of batch) {
      if (event.type === "sound-stop") stopEffects();
      else if (event.type === "sound-play") playEffect(event);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundEventTick]);

  // ---------------------------------------------------------------- autoplay gate
  // Until this page has had a tap, the browser keeps the context suspended and
  // the bed is silent. Any interaction at all wakes it -- no need to hunt for
  // the chip.
  useEffect(() => {
    if (contextRunning) return undefined;
    const events = ["pointerdown", "keydown", "touchend"];
    events.forEach((name) => window.addEventListener(name, resumeAudio, { capture: true }));
    return () => events.forEach((name) => window.removeEventListener(name, resumeAudio, { capture: true }));
  }, [contextRunning, resumeAudio]);

  // Sign-out or unmount: let go of everything that's sounding.
  useEffect(() => {
    return () => {
      if (deckRef.current) {
        retireDeck(deckRef.current, 50);
        deckRef.current = null;
      }
      stopEffects();
      audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({ ambient, getPositionMs, refresh, localMuted, setLocalMuted, contextRunning, resumeAudio }),
    [ambient, getPositionMs, refresh, localMuted, setLocalMuted, contextRunning, resumeAudio]
  );

  const playing = Boolean(ambient?.playing && ambient.url);
  const blocked = playing && !contextRunning && !localMuted;
  // The DM's own desk already shows what's playing and has its own controls.
  const onDesk = location.pathname === "/sound-desk";
  const showChip = playing && (blocked || !onDesk);

  return (
    <AmbientContext.Provider value={value}>
      {children}
      {showChip &&
        (blocked ? (
          <button type="button" className="amb-chip amb-chip--blocked" onClick={resumeAudio}>
            <HandTapIcon weight="bold" />
            <span className="amb-chip-text">
              <span className="amb-chip-action">Tap to hear the ambience</span>
              <span className="amb-chip-title">{ambient.name}</span>
            </span>
          </button>
        ) : (
          <div className="amb-chip" role="status">
            <SpeakerHighIcon weight="bold" className="amb-chip-icon" />
            <span className="amb-chip-text">
              <span className="amb-chip-title">{ambient.name}</span>
            </span>
            <button
              type="button"
              className="amb-chip-mute"
              onClick={() => setLocalMuted(!localMuted)}
              aria-pressed={localMuted}
              aria-label={localMuted ? "Unmute ambience and effects" : "Mute ambience and effects for me"}
              title={localMuted ? "Unmute ambience and effects" : "Mute ambience and effects for me"}
            >
              {localMuted ? <SpeakerSlashIcon weight="bold" /> : <SpeakerHighIcon weight="bold" />}
            </button>
          </div>
        ))}
    </AmbientContext.Provider>
  );
}
