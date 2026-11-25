// Video plumbing for party voice chat (VoiceChatContext.jsx owns the
// lifecycle). Video rides the same peer-to-peer RTCPeerConnections as the
// audio: the Cloudflare Tunnel only ever carries the handshake, and the
// Cloudflare TURN relay only carries it for a pair whose routers can't reach
// each other directly.

// Per outgoing stream (each player sends one copy to every other player).
// 2.5 Mbps keeps 1080p sharp when the theater shows a face full screen.
export const VIDEO_MAX_BITRATE = 2_500_000;
export const VIDEO_MAX_FRAMERATE = 30;
// A full table shares this much upload between its copies, so a big party
// trims each stream instead of choking a home connection: up to 3 players
// (2 copies) get the full 2.5 Mbps each, 4 players 2 Mbps, 6 players
// 1.2 Mbps, 8 players ~857 kbps.
const VIDEO_UPLOAD_BUDGET = 6_000_000;
const VIDEO_MIN_BITRATE = 250_000;

export function videoBitrateForPeers(peerCount) {
  const share = Math.floor(VIDEO_UPLOAD_BUDGET / Math.max(1, peerCount));
  return Math.max(VIDEO_MIN_BITRATE, Math.min(VIDEO_MAX_BITRATE, share));
}

// 1080p so a face still holds up when the stage fills the screen; the
// encoder scales down on its own when the bitrate or link can't carry it.
// The first try insists on a smooth frame rate: left to `ideal` alone, the
// browser would happily pick 1080p at 15 fps over 720p at 30 on cheap
// webcams. A camera with no mode that fast falls back to the loose profile.
const MIN_SMOOTH_FRAMERATE = 24;

export function cameraConstraints(deviceId, { strict = false } = {}) {
  return {
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: strict
        ? { ideal: VIDEO_MAX_FRAMERATE, min: MIN_SMOOTH_FRAMERATE, max: VIDEO_MAX_FRAMERATE }
        : { ideal: VIDEO_MAX_FRAMERATE, max: VIDEO_MAX_FRAMERATE },
      ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
    },
  };
}

// Opens the camera at the best resolution it can do smoothly.
export async function openCameraStream(deviceId) {
  try {
    return await navigator.mediaDevices.getUserMedia(cameraConstraints(deviceId, { strict: true }));
  } catch (err) {
    if (err?.name !== "OverconstrainedError") throw err;
    return navigator.mediaDevices.getUserMedia(cameraConstraints(deviceId));
  }
}

export function canUseCamera() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

// Each peer connection has exactly one video transceiver. The offerer adds it
// up front; the answerer gets it from the offer. Found by kind, not mid.
export function findVideoTransceiver(pc) {
  return pc.getTransceivers().find((t) => t.receiver?.track?.kind === "video" && !t.stopped) ?? null;
}

// Per-browser preferences, like the mic/speaker choice in voiceAudio.js.
const CAMERA_KEY = "voiceCameraDeviceId";
const RECEIVE_KEY = "voiceReceiveVideo";

function readPref(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key, value) {
  try {
    if (value == null || value === "") window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private windows / blocked storage: the choice just won't persist.
  }
}

export const loadCameraDeviceId = () => readPref(CAMERA_KEY) || "";
export const saveCameraDeviceId = (id) => writePref(CAMERA_KEY, id);
// Data saver: "off" means don't download anyone else's video. Default on.
export const loadReceiveVideo = () => readPref(RECEIVE_KEY) !== "off";
export const saveReceiveVideo = (on) => writePref(RECEIVE_KEY, on ? null : "off");
