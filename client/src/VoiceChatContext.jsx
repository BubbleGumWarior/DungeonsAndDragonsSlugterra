import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { volumeToGain, voiceVolumeToGain, MAX_VOICE_VOLUME } from "./soundVolume.js";
import { createLevelSampler, SPEAKING_THRESHOLD } from "./useMicLevel.js";
import {
  createVoiceAudioGraph,
  loadInputDeviceId,
  loadOutputDeviceId,
  micConstraints,
  saveInputDeviceId,
  saveOutputDeviceId,
  supportsOutputSelection,
} from "./voiceAudio.js";

const VoiceChatContext = createContext(null);

export function useVoiceChat() {
  const ctx = useContext(VoiceChatContext);
  if (!ctx) throw new Error("useVoiceChat must be used within VoiceChatProvider");
  return ctx;
}

// STUN alone only gets two peers connected when at least one side has a
// NAT that exposes a usable public address for the other to reach directly
// -- fine on a shared LAN, but real cross-network calls (two different
// home routers) commonly sit behind NATs that STUN can't punch through
// (symmetric NAT, CGNAT, restrictive firewalls), and then the two sides
// simply never find a working candidate pair -- connected-but-silent from
// the roster's point of view, since signaling still works fine. A TURN
// relay is the standard fix: it gives ICE a fallback candidate that routes
// media through a third party both sides CAN reach, used automatically
// only if a direct path fails.
//
// The relay is Cloudflare Realtime TURN (1,000 GB/mo free; Metered's 500MB
// trial and the earlier testing-only turn.elixir-webrtc.org relay before it
// were both unreliable enough to make "leave, refresh, rejoin" a coin flip).
// The endpoint returns a whole iceServers array in one response (STUN plus
// TURN over UDP/TCP/TLS), giving ICE more paths to try if one transport is
// blocked somewhere on the route, instead of just one relay URI.
//
// The API token itself is NOT here -- fetched from our own backend
// (/api/voice/turn-credentials, see server/src/routes/voice.js), which
// holds it in server/.env (gitignored) and mints the credentials
// server-side. Putting the raw token in client source would ship it in the
// public JS bundle for anyone to extract and use up the account's quota.
const STUN_SERVER = { urls: "stun:stun.l.google.com:19302" };

// Opus tuned for a spoken table: mono, in-band FEC (rides out packet loss
// instead of crackling), DTX (near-zero traffic while nobody's talking, which
// is most of a session), and ~48kbps -- clear wideband speech without the
// waste of the default stereo-music profile. Applied to both the offer and
// the answer since each side's fmtp is what the *other* side's encoder honors.
const OPUS_FMTP = {
  stereo: "0",
  "sprop-stereo": "0",
  useinbandfec: "1",
  usedtx: "1",
  maxaveragebitrate: "48000",
  minptime: "10",
};

function tuneOpusSdp(sdp) {
  const rtpmap = /a=rtpmap:(\d+) opus\/48000\/2/i.exec(sdp);
  if (!rtpmap) return sdp;
  const payloadType = rtpmap[1];
  const fmtpPattern = new RegExp(`a=fmtp:${payloadType} ([^\\r\\n]*)`);
  const existing = fmtpPattern.exec(sdp);

  const params = new Map();
  if (existing) {
    for (const part of existing[1].split(";")) {
      const [key, value] = part.split("=");
      if (key.trim()) params.set(key.trim(), value === undefined ? "" : value.trim());
    }
  }
  for (const [key, value] of Object.entries(OPUS_FMTP)) params.set(key, value);

  const line = `a=fmtp:${payloadType} ${[...params].map(([k, v]) => (v === "" ? k : `${k}=${v}`)).join(";")}`;
  if (existing) return sdp.replace(fmtpPattern, () => line);
  return sdp.replace(new RegExp(`(a=rtpmap:${payloadType} [^\\r\\n]*)`), (match) => `${match}\r\n${line}`);
}

// Dropped-connection recovery (see recoverPeer below). A brief "disconnected"
// often heals on its own (wifi blip), so give it a moment before restarting.
const ICE_DISCONNECT_GRACE_MS = 4000;
const ICE_RETRY_MS = 8000;
const ICE_RESTARTS_BEFORE_RESET = 3;

const TURN_FETCH_TIMEOUT_MS = 4000;
const TURN_FETCH_ATTEMPTS = 3;

async function fetchIceServersOnce(token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TURN_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("/api/voice/turn-credentials", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`TURN credential request failed: ${res.status}`);
    const data = await res.json();
    const iceServers = data.iceServers;
    if (!Array.isArray(iceServers) || iceServers.length === 0) throw new Error("TURN credential response was empty");
    return iceServers;
  } finally {
    clearTimeout(timeout);
  }
}

// A single failed or slow-timing-out request here used to mean silently
// falling back to STUN-only for that entire call. A few quick retries turns
// a flaky single request into a reliable one for something this important.
async function fetchIceServers(token) {
  for (let attempt = 1; attempt <= TURN_FETCH_ATTEMPTS; attempt++) {
    try {
      const iceServers = await fetchIceServersOnce(token);
      console.log(`[voice] got ${iceServers.length} ICE servers on attempt ${attempt}`);
      return iceServers;
    } catch (err) {
      console.warn(`Voice chat: ICE server fetch attempt ${attempt}/${TURN_FETCH_ATTEMPTS} failed:`, err.message || err);
    }
  }
  console.warn("Voice chat: could not fetch TURN credentials after retries, falling back to STUN only -- cross-network calls may fail to connect.");
  return [STUN_SERVER];
}

// Join/leave chimes, played on every client that's already in the call when
// the roster changes. Files live in client/public/ (served from the web
// root), same as slugterra-velocity.mp3. Volume runs through volumeToGain
// off the per-user Sound setting, exactly like playShotSound in CombatMap.
const JOIN_SOUND_SRC = "/Join.mp3";
const LEAVE_SOUND_SRC = "/Leave.mp3";

function playCue(src, sliderVolume) {
  const audio = new Audio(src);
  audio.volume = volumeToGain(typeof sliderVolume === "number" ? sliderVolume : 0.5);
  audio.play().catch(() => {});
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

// Whole-app mesh voice chat: one RTCPeerConnection per other connected
// participant, signaled over the existing authenticated /ws socket (see
// AccessSocket.jsx's sendMessage/voiceRoster/voiceSignalQueueRef) rather than any
// new server infrastructure. Mounted once above <Routes> in App.jsx, so
// navigating between pages never touches an in-progress call.
export default function VoiceChatProvider({ children }) {
  const { token, user } = useAuth();
  const { voiceRoster, voiceSignalQueueRef, voiceSignalTick, wsConnectedAt, sendMessage } = useLiveState();

  const [inCall, setInCall] = useState(false);
  const [joining, setJoining] = useState(false);
  const [selfMuted, setSelfMuted] = useState(false);
  const [pttHeld, setPttHeld] = useState(false);
  const [error, setError] = useState(null);
  const [speakingIds, setSpeakingIds] = useState(() => new Set());
  const [connectedPeerIds, setConnectedPeerIds] = useState([]);
  const [recoveringPeerIds, setRecoveringPeerIds] = useState(() => new Set()); // peers whose link dropped and is being re-established
  const [peerVolumes, setPeerVolumes] = useState(() => user?.voicePeerVolumes || {});
  const [inputDeviceId, setInputDeviceIdState] = useState(loadInputDeviceId);
  const [outputDeviceId, setOutputDeviceIdState] = useState(loadOutputDeviceId);

  const selfId = user?.id;
  const voiceInputMode = user?.voiceInputMode || "live";

  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map()); // peerId -> RTCPeerConnection
  const remoteStreamsRef = useRef(new Map()); // peerId -> MediaStream
  const audioElsRef = useRef(new Map()); // peerId -> <audio> element
  const pendingCandidatesRef = useRef(new Map()); // peerId -> RTCIceCandidateInit[]
  const audioRefCallbacksRef = useRef(new Map()); // peerId -> cached <audio> ref callback
  const samplersRef = useRef(new Map()); // "self" | peerId -> level sampler
  const saveVolumeTimersRef = useRef(new Map());
  const iceRecoveryRef = useRef(new Map()); // peerId -> { attempts, timer }
  const audioGraphRef = useRef(null); // shared Web Audio graph (voiceAudio.js), alive only while in a call
  const playbacksRef = useRef(new Map()); // peerId -> { setGain, dispose } for that peer's gain node
  const inputDeviceIdRef = useRef(inputDeviceId);
  const outputDeviceIdRef = useRef(outputDeviceId);
  const inCallRef = useRef(false);
  const selfMutedRef = useRef(false);
  const pttHeldRef = useRef(false);
  const peerVolumesRef = useRef(peerVolumes);
  const cueVolumeRef = useRef(user?.voiceCueVolume);
  const prevRosterIdsRef = useRef(null); // Set<userId> from the last roster snapshot, or null before the first
  const iceServersRef = useRef([STUN_SERVER]); // replaced with Metered's array once fetchIceServers resolves in joinCall

  useEffect(() => {
    inCallRef.current = inCall;
  }, [inCall]);
  useEffect(() => {
    selfMutedRef.current = selfMuted;
  }, [selfMuted]);
  useEffect(() => {
    pttHeldRef.current = pttHeld;
  }, [pttHeld]);
  useEffect(() => {
    peerVolumesRef.current = peerVolumes;
  }, [peerVolumes]);
  // The account's saved mixer settings hydrate in after /api/me resolves --
  // pick them up whenever they arrive/change, same as theme/soundVolume.
  useEffect(() => {
    if (user?.voicePeerVolumes) setPeerVolumes(user.voicePeerVolumes);
  }, [user?.voicePeerVolumes]);
  useEffect(() => {
    cueVolumeRef.current = user?.voiceCueVolume;
  }, [user?.voiceCueVolume]);

  // ---------------------------------------------------------------- join/leave chimes
  // Every client already in the call plays a short sound when the roster
  // gains or loses someone else. The first snapshot after joining just seeds
  // the baseline (nobody in it "just joined" from this client's point of
  // view), and self is filtered out here -- your own join/leave chime is
  // fired directly from joinCall/leaveCall instead, so it plays even though
  // by then this effect has torn its baseline down. Fires at most one join
  // and one leave sound per roster change even if several people come or go
  // at once.
  useEffect(() => {
    if (!inCall) {
      prevRosterIdsRef.current = null;
      return;
    }
    const currentIds = new Set(voiceRoster.map((p) => p.userId));
    const prev = prevRosterIdsRef.current;
    prevRosterIdsRef.current = currentIds;
    if (prev == null) return;

    let joined = false;
    let left = false;
    for (const id of currentIds) {
      if (id !== selfId && !prev.has(id)) joined = true;
    }
    for (const id of prev) {
      if (id !== selfId && !currentIds.has(id)) left = true;
    }
    if (joined) playCue(JOIN_SOUND_SRC, cueVolumeRef.current);
    if (left) playCue(LEAVE_SOUND_SRC, cueVolumeRef.current);
  }, [voiceRoster, inCall, selfId]);

  // ---------------------------------------------------------------- local track gating
  const applyLocalTrackState = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const transmitting = !selfMutedRef.current && (voiceInputMode !== "push_to_talk" || pttHeldRef.current);
    stream.getAudioTracks().forEach((track) => {
      track.enabled = transmitting;
    });
  }, [voiceInputMode]);

  useEffect(() => {
    applyLocalTrackState();
  }, [selfMuted, pttHeld, voiceInputMode, applyLocalTrackState]);

  // ---------------------------------------------------------------- speaking-level sampling
  function ensureSampler(key, stream) {
    const existing = samplersRef.current.get(key);
    if (existing) existing.dispose();
    const sampler = createLevelSampler(stream, audioGraphRef.current?.ctx);
    if (sampler) samplersRef.current.set(key, sampler);
    else samplersRef.current.delete(key);
  }

  useEffect(() => {
    if (!inCall) {
      setSpeakingIds(new Set());
      return undefined;
    }
    let frameId = requestAnimationFrame(tick);
    function tick() {
      const next = new Set();
      for (const [key, sampler] of samplersRef.current.entries()) {
        if (sampler.getLevel() > SPEAKING_THRESHOLD) next.add(key);
      }
      setSpeakingIds((prev) => (setsEqual(prev, next) ? prev : next));
      frameId = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(frameId);
  }, [inCall]);

  // ---------------------------------------------------------------- peer connection lifecycle
  // Cached per-peer, NOT recreated on every render: React detaches + re-
  // attaches a ref whenever the function identity passed to `ref` changes,
  // even for the same DOM node. An inline `ref={(el) => ...}` here would get
  // a fresh identity every render -- and the speaking-level poll below
  // re-renders this provider on practically every animation frame while
  // anyone is talking -- so the <audio> element's srcObject/play() would
  // get reset dozens of times a second, which is exactly what silenced the
  // call in practice. One stable callback per peerId avoids that entirely.
  function getAudioRefCallback(peerId) {
    const cache = audioRefCallbacksRef.current;
    const existing = cache.get(peerId);
    if (existing) return existing;

    const callback = (el) => {
      if (!el) {
        audioElsRef.current.delete(peerId);
        return;
      }
      audioElsRef.current.set(peerId, el);
      const existingStream = remoteStreamsRef.current.get(peerId);
      if (existingStream && el.srcObject !== existingStream) playThroughElement(peerId, el, existingStream);
    };
    cache.set(peerId, callback);
    return callback;
  }

  // With the shared Web Audio graph up, the gain node does the audible
  // playback and the element is muted -- it stays attached only because
  // Chromium won't feed a remote stream to Web Audio otherwise. If Web Audio
  // is unavailable the element plays directly, capped at 100% like before.
  function playThroughElement(peerId, el, stream) {
    el.srcObject = stream;
    el.muted = Boolean(audioGraphRef.current);
    el.volume = Math.min(1, volumeToGain(peerVolumesRef.current[peerId] ?? 1));
    el.play().catch(() => {});
  }

  function attachRemoteStream(peerId, stream) {
    remoteStreamsRef.current.set(peerId, stream);
    ensureSampler(peerId, stream);

    playbacksRef.current.get(peerId)?.dispose();
    playbacksRef.current.delete(peerId);
    const graph = audioGraphRef.current;
    if (graph) {
      playbacksRef.current.set(peerId, graph.addRemote(stream, voiceVolumeToGain(peerVolumesRef.current[peerId] ?? 1)));
    }

    const el = audioElsRef.current.get(peerId);
    if (el && el.srcObject !== stream) playThroughElement(peerId, el, stream);
  }

  function ensurePeerConnection(peerId) {
    const existing = peersRef.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    const localStream = localStreamRef.current;
    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // candidate.type is host/srflx (STUN)/relay (TURN)/prflx -- if
        // "relay" never shows up here, the TURN allocation itself is
        // failing (unreachable relay, rejected credentials, etc.), not
        // just occasionally slow to hand out credentials.
        console.log(`[voice] local ICE candidate for ${peerId}: type=${event.candidate.type}`);
        sendMessage({ type: "voice-signal", to: peerId, signal: { kind: "candidate", candidate: event.candidate } });
      }
    };

    // Loud on purpose: this is the one signal that tells you WHERE a silent
    // call is actually stuck -- "checking" forever means ICE can't find a
    // working path (the TURN fallback above exists for exactly this),
    // "connected" with no audio means the problem is downstream of
    // connectivity (the track/element attach path), not the network.
    pc.oniceconnectionstatechange = () => {
      console.log(`[voice] ICE state with ${peerId}:`, pc.iceConnectionState);
      // Ignore events from a connection that's already been replaced/closed.
      if (peersRef.current.get(peerId) === pc) {
        const state = pc.iceConnectionState;
        if (state === "connected" || state === "completed") clearIceRecovery(peerId);
        else if (state === "disconnected") scheduleIceRecovery(peerId, pc, ICE_DISCONNECT_GRACE_MS);
        else if (state === "failed") scheduleIceRecovery(peerId, pc, 0);
      }
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "failed") {
        // The definitive answer to "did this actually go through TURN":
        // find the pair that won (or the last one attempted, on failure)
        // and log what kind of candidates it was built from.
        pc.getStats().then((stats) => {
          stats.forEach((report) => {
            if (report.type === "candidate-pair" && (report.selected || report.nominated)) {
              const local = stats.get(report.localCandidateId);
              const remote = stats.get(report.remoteCandidateId);
              console.log(
                `[voice] candidate pair for ${peerId}: local=${local?.candidateType} remote=${remote?.candidateType} state=${report.state}`
              );
            }
          });
        });
      }
    };
    pc.onconnectionstatechange = () => {
      console.log(`[voice] connection state with ${peerId}:`, pc.connectionState);
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      console.log(`[voice] received remote track from ${peerId}`, event.track.kind, event.track.readyState);
      if (stream) attachRemoteStream(peerId, stream);
    };

    peersRef.current.set(peerId, pc);
    setConnectedPeerIds([...peersRef.current.keys()]);
    return pc;
  }

  function closePeerConnection(peerId) {
    clearIceRecovery(peerId);
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.close();
      peersRef.current.delete(peerId);
    }
    remoteStreamsRef.current.delete(peerId);
    playbacksRef.current.get(peerId)?.dispose();
    playbacksRef.current.delete(peerId);
    pendingCandidatesRef.current.delete(peerId);
    audioRefCallbacksRef.current.delete(peerId);
    const sampler = samplersRef.current.get(peerId);
    if (sampler) {
      sampler.dispose();
      samplersRef.current.delete(peerId);
    }
    const el = audioElsRef.current.get(peerId);
    if (el) el.srcObject = null;
  }

  async function startOffer(peerId, pc, { iceRestart = false } = {}) {
    console.log(`[voice] startOffer -> ${peerId}${iceRestart ? " (ICE restart)" : ""}`);
    try {
      const created = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      const offer = { type: created.type, sdp: tuneOpusSdp(created.sdp) };
      await pc.setLocalDescription(offer);
      sendMessage({ type: "voice-signal", to: peerId, signal: { kind: "offer", sdp: offer } });
      console.log(`[voice] offer sent -> ${peerId}`);
    } catch (err) {
      console.error("Voice offer failed:", err);
    }
  }

  // ---------------------------------------------------------------- dropped-link recovery
  // Before this, a peer going "disconnected"/"failed" (wifi roam, a laptop
  // waking from sleep, a NAT mapping expiring) was only logged, so the call
  // stayed silently dead for that pair until someone left and rejoined.
  // Only the lower-userId side of a pair ever offers (same glare-avoidance
  // rule as the roster effect), so it also owns recovery: it re-offers with
  // an ICE restart, which keeps the same peer connection and just finds a
  // new network path. The other side can't restart on its own, so it asks
  // via a "restart-request" signal. If restarts keep failing, the offerer
  // tells the other side to "reset" and rebuilds the connection from scratch.
  function setRecovering(peerId, recovering) {
    setRecoveringPeerIds((prev) => {
      if (prev.has(peerId) === recovering) return prev;
      const next = new Set(prev);
      if (recovering) next.add(peerId);
      else next.delete(peerId);
      return next;
    });
  }

  function clearIceRecovery(peerId) {
    const rec = iceRecoveryRef.current.get(peerId);
    if (rec) {
      clearTimeout(rec.timer);
      iceRecoveryRef.current.delete(peerId);
    }
    setRecovering(peerId, false);
  }

  function scheduleIceRecovery(peerId, pc, delayMs) {
    let rec = iceRecoveryRef.current.get(peerId);
    if (!rec) {
      rec = { attempts: 0, timer: null };
      iceRecoveryRef.current.set(peerId, rec);
    }
    clearTimeout(rec.timer);
    rec.timer = setTimeout(() => recoverPeer(peerId, pc), delayMs);
  }

  function recoverPeer(peerId, pc) {
    if (!inCallRef.current || peersRef.current.get(peerId) !== pc) return;
    const state = pc.iceConnectionState;
    if (state === "connected" || state === "completed") {
      clearIceRecovery(peerId);
      return;
    }
    setRecovering(peerId, true);
    if (selfId < peerId) restartOrResetPeer(peerId, pc);
    else sendMessage({ type: "voice-signal", to: peerId, signal: { kind: "restart-request" } });
    // Keep trying for as long as the link stays down.
    scheduleIceRecovery(peerId, pc, ICE_RETRY_MS);
  }

  // Offerer side only.
  function restartOrResetPeer(peerId, pc) {
    const rec = iceRecoveryRef.current.get(peerId) || { attempts: 0, timer: null };
    iceRecoveryRef.current.set(peerId, rec);
    rec.attempts += 1;

    if (rec.attempts > ICE_RESTARTS_BEFORE_RESET) {
      console.warn(`[voice] ICE restarts exhausted for ${peerId}, rebuilding the connection`);
      sendMessage({ type: "voice-signal", to: peerId, signal: { kind: "reset" } });
      closePeerConnection(peerId);
      const fresh = ensurePeerConnection(peerId);
      setRecovering(peerId, true);
      // closePeerConnection dropped the recovery record, so re-arm it for the
      // new connection in case it never comes up either.
      scheduleIceRecovery(peerId, fresh, ICE_RETRY_MS);
      startOffer(peerId, fresh);
      return;
    }
    // A restart already in flight (our offer unanswered) shouldn't be doubled.
    if (pc.signalingState === "stable") startOffer(peerId, pc, { iceRestart: true });
  }

  async function flushPendingCandidates(peerId, pc) {
    const pending = pendingCandidatesRef.current.get(peerId);
    if (!pending || pending.length === 0) return;
    pendingCandidatesRef.current.delete(peerId);
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // A stray/late candidate failing to add isn't fatal to the call.
      }
    }
  }

  async function handleSignal(peerId, signal) {
    console.log(`[voice] handleSignal from ${peerId}: kind=${signal?.kind}`);
    // The offerer gave up on restarting ICE and is rebuilding the connection:
    // drop ours so the fresh offer that follows lands on a clean slate. (Only
    // the lower id ever offers, so only it may ask for this.)
    if (signal.kind === "reset") {
      if (peerId < selfId && peersRef.current.has(peerId)) {
        closePeerConnection(peerId);
        setRecovering(peerId, true);
      }
      return;
    }
    // The other side can't restart ICE itself (it isn't the offerer), so it
    // asks us -- if we are the offerer.
    if (signal.kind === "restart-request") {
      const existing = peersRef.current.get(peerId);
      if (existing && selfId < peerId) {
        setRecovering(peerId, true);
        restartOrResetPeer(peerId, existing);
      }
      return;
    }
    const pc = ensurePeerConnection(peerId);
    try {
      if (signal.kind === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        await flushPendingCandidates(peerId, pc);
        const created = await pc.createAnswer();
        const answer = { type: created.type, sdp: tuneOpusSdp(created.sdp) };
        await pc.setLocalDescription(answer);
        sendMessage({ type: "voice-signal", to: peerId, signal: { kind: "answer", sdp: answer } });
        console.log(`[voice] answer sent -> ${peerId}`);
      } else if (signal.kind === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        await flushPendingCandidates(peerId, pc);
      } else if (signal.kind === "candidate" && signal.candidate) {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          const pending = pendingCandidatesRef.current.get(peerId) || [];
          pending.push(signal.candidate);
          pendingCandidatesRef.current.set(peerId, pending);
        }
      }
    } catch (err) {
      console.error("Voice signal handling failed:", err);
    }
  }

  // React to the party roster changing: connect to anyone new, disconnect
  // anyone gone. Only the lower userId of a pair ever sends the opening
  // offer, so two peers can never race to both initiate at once -- no
  // glare-resolution logic needed for a table this size.
  useEffect(() => {
    if (!inCall || selfId == null) return;
    const otherIds = voiceRoster.filter((p) => p.userId !== selfId).map((p) => p.userId);
    const otherIdSet = new Set(otherIds);
    console.log(`[voice] roster effect: selfId=${selfId} otherIds=${JSON.stringify(otherIds)} existingPeers=${JSON.stringify([...peersRef.current.keys()])}`);

    for (const existingId of [...peersRef.current.keys()]) {
      if (!otherIdSet.has(existingId)) closePeerConnection(existingId);
    }

    for (const peerId of otherIds) {
      const isNew = !peersRef.current.has(peerId);
      const pc = ensurePeerConnection(peerId);
      console.log(`[voice] peer ${peerId}: isNew=${isNew} willOffer=${isNew && selfId < peerId}`);
      if (isNew && selfId < peerId) startOffer(peerId, pc);
    }

    setConnectedPeerIds([...peersRef.current.keys()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceRoster, inCall, selfId]);

  // React to inbound signaling envelopes relayed through the /ws socket.
  // Drains the WHOLE queue every time, not just "the latest one" -- see
  // AccessSocket.jsx's voiceSignalQueueRef for why that distinction is the
  // actual fix (an offer was being silently lost to exactly this before).
  // Processed sequentially (not Promise.all) since they share one
  // RTCPeerConnection per peer and order matters (an offer must be applied
  // before candidates that depend on it, even though there's also a
  // pending-candidates buffer as a second line of defense for genuine
  // out-of-order network delivery).
  useEffect(() => {
    const queue = voiceSignalQueueRef.current;
    const batch = queue.splice(0, queue.length);
    if (batch.length === 0 || !inCallRef.current) return;
    (async () => {
      for (const { from, signal } of batch) {
        await handleSignal(from, signal);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceSignalTick]);

  // The underlying /ws socket can drop and reconnect on its own (see
  // AccessSocket.jsx's auto-reconnect) without anything here ever deciding
  // to leave the call. The server has already forgotten this client was in
  // the voice room the moment the old socket closed, and every peer's
  // browser has already torn its own connection down in response to that
  // -- so the RTCPeerConnection objects still sitting in peersRef are
  // orphaned, not just stale, and trying to reuse them (or waiting for the
  // roster-reconciliation effect to notice "no change") doesn't recover.
  // Reset everything and re-announce so the next roster snapshot treats
  // every peer as new and renegotiates from scratch, instead of silently
  // sitting connected-looking-but-actually-orphaned until someone manually
  // leaves and rejoins.
  useEffect(() => {
    if (wsConnectedAt == null || !inCallRef.current) return;
    for (const peerId of [...peersRef.current.keys()]) closePeerConnection(peerId);
    setConnectedPeerIds([]);
    // The roster round-trips away and back during a reconnect -- reseed the
    // chime baseline so that churn doesn't fire spurious join/leave sounds.
    prevRosterIdsRef.current = null;
    sendMessage({ type: "voice-join" });
    sendMessage({ type: "voice-mute-state", muted: selfMutedRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsConnectedAt]);

  // ---------------------------------------------------------------- push-to-talk key
  useEffect(() => {
    if (voiceInputMode !== "push_to_talk") return undefined;

    function isTypingTarget(target) {
      if (!target) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    }

    function handleKeyDown(e) {
      // Dodge's own hotkey is Space too (see CounterClashPrompt.jsx) -- back
      // off push-to-talk while that reaction prompt is open, or a player
      // dodging would also key up their mic.
      if (
        e.code !== "Space" ||
        e.repeat ||
        isTypingTarget(e.target) ||
        !inCallRef.current ||
        document.body.dataset.counterPromptOpen === "true"
      )
        return;
      e.preventDefault();
      setPttHeld(true);
    }
    function handleKeyUp(e) {
      if (e.code !== "Space") return;
      setPttHeld(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [voiceInputMode]);

  // TURN credentials are only fetched once, at joinCall() time, but they're
  // short-lived (minutes, not hours -- the exact TTL is whatever the relay
  // hands back). Someone who's been in a call for a while and never
  // refreshes iceServersRef would silently be holding expired credentials
  // by the time a peer connection actually needs them (e.g. someone else
  // leaves and rejoins later in the same session) -- refreshing
  // periodically while in a call keeps that from ever going stale.
  useEffect(() => {
    if (!inCall) return undefined;
    const interval = setInterval(async () => {
      iceServersRef.current = await fetchIceServers(token);
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [inCall, token]);

  // ---------------------------------------------------------------- public actions
  const joinCall = useCallback(async () => {
    if (inCallRef.current || joining) return;
    setError(null);
    setJoining(true);
    // Created and resumed right here, synchronously inside the click that
    // started the join: Safari/iOS only let an AudioContext start from within
    // a user gesture, which the awaits below would otherwise be outside of.
    const graph = createVoiceAudioGraph(outputDeviceIdRef.current);
    graph?.resume();
    audioGraphRef.current = graph;
    try {
      // Run together, not sequentially -- fetchIceServers never rejects
      // (it always resolves, falling back to [STUN_SERVER] after retries
      // fail), so this only ever fails on the getUserMedia half, and a
      // slow TURN fetch never adds latency to getting the mic.
      const [stream, iceServers] = await Promise.all([
        navigator.mediaDevices.getUserMedia(micConstraints(inputDeviceIdRef.current)),
        fetchIceServers(token),
      ]);
      iceServersRef.current = iceServers;
      // Tells the encoder this is speech (favors intelligibility over fidelity).
      stream.getAudioTracks().forEach((track) => {
        track.contentHint = "speech";
      });
      localStreamRef.current = stream;
      ensureSampler("self", stream);
      applyLocalTrackState();
      sendMessage({ type: "voice-join" });
      setInCall(true);
      playCue(JOIN_SOUND_SRC, cueVolumeRef.current);
    } catch (err) {
      console.error("Could not join voice chat:", err);
      graph?.close();
      audioGraphRef.current = null;
      setError("Couldn't access your microphone. Check your browser's site permissions and try again.");
    } finally {
      setJoining(false);
    }
  }, [joining, sendMessage, applyLocalTrackState, token]);

  const leaveCall = useCallback(() => {
    if (!inCallRef.current) return;
    playCue(LEAVE_SOUND_SRC, cueVolumeRef.current);
    sendMessage({ type: "voice-leave" });

    for (const peerId of [...peersRef.current.keys()]) closePeerConnection(peerId);
    setConnectedPeerIds([]);

    const localSampler = samplersRef.current.get("self");
    if (localSampler) {
      localSampler.dispose();
      samplersRef.current.delete("self");
    }

    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Every sampler and gain node was disposed above, so the shared context
    // can go with them.
    audioGraphRef.current?.close();
    audioGraphRef.current = null;

    setInCall(false);
    setSelfMuted(false);
    setPttHeld(false);
    setSpeakingIds(new Set());
  }, [sendMessage]);

  const toggleSelfMute = useCallback(() => {
    setSelfMuted((prev) => {
      const next = !prev;
      sendMessage({ type: "voice-mute-state", muted: next });
      return next;
    });
  }, [sendMessage]);

  const setPeerVolume = useCallback(
    (peerId, value) => {
      const clamped = Math.min(MAX_VOICE_VOLUME, Math.max(0, value));
      setPeerVolumes((prev) => ({ ...prev, [peerId]: clamped }));

      const playback = playbacksRef.current.get(peerId);
      if (playback) {
        playback.setGain(voiceVolumeToGain(clamped));
      } else {
        const el = audioElsRef.current.get(peerId);
        if (el) el.volume = Math.min(1, volumeToGain(clamped));
      }

      const timers = saveVolumeTimersRef.current;
      clearTimeout(timers.get(peerId));
      const timer = setTimeout(() => {
        fetch("/api/settings/voice-peer-volume", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ peerUserId: peerId, volume: clamped }),
        }).catch(() => {});
      }, 500);
      timers.set(peerId, timer);
    },
    [token]
  );

  // Swapping microphones mid-call: grab the new mic, hand its track to every
  // peer's existing sender (no renegotiation needed), then retire the old one.
  // Outside a call it just remembers the choice for the next join.
  const setInputDevice = useCallback(
    async (deviceId) => {
      saveInputDeviceId(deviceId);
      inputDeviceIdRef.current = deviceId;
      setInputDeviceIdState(deviceId);
      if (!inCallRef.current) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia(micConstraints(deviceId));
        const [track] = stream.getAudioTracks();
        track.contentHint = "speech";
        for (const pc of peersRef.current.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
          if (sender) await sender.replaceTrack(track);
        }
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = stream;
        ensureSampler("self", stream);
        applyLocalTrackState();
      } catch (err) {
        console.error("Could not switch microphone:", err);
        setError("Couldn't switch to that microphone.");
      }
    },
    [applyLocalTrackState]
  );

  const setOutputDevice = useCallback((deviceId) => {
    saveOutputDeviceId(deviceId);
    outputDeviceIdRef.current = deviceId;
    setOutputDeviceIdState(deviceId);
    audioGraphRef.current?.setOutputDevice(deviceId);
  }, []);

  // Keep the screen from sleeping mid-call -- on a phone, a locked screen
  // suspends the page and silently drops out of the voice chat. The lock is
  // released by the browser whenever the tab is hidden, so it's re-requested
  // on return; the audio context is nudged awake at the same time, since iOS
  // can suspend it while backgrounded.
  useEffect(() => {
    if (!inCall) return undefined;
    let cancelled = false;
    let sentinel = null;

    async function acquire() {
      if (!("wakeLock" in navigator)) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
        lock.addEventListener("release", () => {
          if (sentinel === lock) sentinel = null;
        });
      } catch {
        // Denied (battery saver, insecure context): the call works regardless.
      }
    }

    function handleVisibility() {
      if (document.visibilityState !== "visible") return;
      if (!sentinel) acquire();
      audioGraphRef.current?.resume();
    }

    acquire();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [inCall]);

  // Signing out mid-call should hang up cleanly rather than leaving a mic
  // stream and 8 peer connections open behind a dead session.
  useEffect(() => {
    if (!token && inCallRef.current) leaveCall();
  }, [token, leaveCall]);

  // Hang up if this provider ever truly unmounts (e.g. the account's voice
  // chat layer gets torn down). Deliberately NOT `[leaveCall]` -- leaveCall
  // is a new function identity practically every render (it closes over
  // sendMessage, which changes whenever AccessSocket re-renders, which a
  // voice-roster broadcast itself triggers), so keying the effect on it
  // would fire this "unmount" cleanup on almost every render right after
  // joining -- hanging up the call moments after starting it. The ref
  // indirection lets the empty-deps effect below run its cleanup only once,
  // on actual unmount, while still calling the latest leaveCall.
  const leaveCallRef = useRef(leaveCall);
  useEffect(() => {
    leaveCallRef.current = leaveCall;
  }, [leaveCall]);
  useEffect(() => {
    return () => leaveCallRef.current();
  }, []);

  const participants = useMemo(
    () =>
      voiceRoster
        .filter((p) => p.userId !== selfId)
        .map((p) => ({
          userId: p.userId,
          name: p.name,
          muted: p.muted,
          speaking: speakingIds.has(p.userId),
          reconnecting: recoveringPeerIds.has(p.userId),
          volume: peerVolumes[p.userId] ?? 1,
        })),
    [voiceRoster, selfId, speakingIds, recoveringPeerIds, peerVolumes]
  );

  // Own character name as the server resolved it, for the avatar initial.
  const selfName = useMemo(
    () => voiceRoster.find((p) => p.userId === selfId)?.name ?? null,
    [voiceRoster, selfId]
  );

  const contextValue = useMemo(
    () => ({
      inCall,
      joining,
      error,
      voiceInputMode,
      participants,
      selfName,
      rosterCount: voiceRoster.length,
      selfMuted,
      selfSpeaking: speakingIds.has("self"),
      pttHeld,
      setPttHeld,
      joinCall,
      leaveCall,
      toggleSelfMute,
      setPeerVolume,
      inputDeviceId,
      outputDeviceId,
      setInputDevice,
      setOutputDevice,
      canPickOutput: supportsOutputSelection(),
    }),
    [
      inCall,
      joining,
      error,
      voiceInputMode,
      participants,
      selfName,
      voiceRoster.length,
      selfMuted,
      speakingIds,
      pttHeld,
      joinCall,
      leaveCall,
      toggleSelfMute,
      setPeerVolume,
      inputDeviceId,
      outputDeviceId,
      setInputDevice,
      setOutputDevice,
    ]
  );

  return (
    <VoiceChatContext.Provider value={contextValue}>
      {children}
      {/* Remote audio only -- nothing to see, so it's kept out of layout
          entirely rather than visually hidden. */}
      <div style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
        {connectedPeerIds.map((peerId) => (
          <audio key={peerId} ref={getAudioRefCallback(peerId)} autoPlay playsInline />
        ))}
      </div>
    </VoiceChatContext.Provider>
  );
}
