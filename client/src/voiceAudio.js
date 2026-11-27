import { useEffect, useState } from "react";

// Web Audio plumbing for party voice chat (VoiceChatContext.jsx owns the
// lifecycle). One AudioContext is shared by playback and the speaking-level
// samplers, instead of one context per stream.
//
// Playback goes remote stream -> per-peer GainNode -> a shared compressor ->
// the speakers. The gain node is what lets a quiet player be turned up past
// 100% (an <audio> element's volume tops out at 1), and the compressor acts
// as a limiter so a boosted loud player clips softly instead of crackling.
// The <audio> elements stay mounted but muted: Chromium only delivers a
// remote WebRTC stream to Web Audio if it's also attached to a media element.

const AudioContextClass = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;

// Choosing a speaker needs AudioContext.setSinkId (Chromium-based browsers);
// Firefox and Safari simply use the system default, so the picker is hidden.
export function supportsOutputSelection() {
  return Boolean(AudioContextClass && "setSinkId" in AudioContextClass.prototype);
}

export function createVoiceAudioGraph(outputDeviceId) {
  if (!AudioContextClass) return null;
  let ctx;
  try {
    ctx = new AudioContextClass();
  } catch {
    return null;
  }

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);

  function setOutputDevice(deviceId) {
    if (typeof ctx.setSinkId !== "function") return Promise.resolve();
    return ctx.setSinkId(deviceId || "").catch(() => {});
  }
  if (outputDeviceId) setOutputDevice(outputDeviceId);

  return {
    ctx,
    setOutputDevice,
    resume() {
      return ctx.state === "running" ? Promise.resolve() : ctx.resume().catch(() => {});
    },
    addRemote(stream, initialGain) {
      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = initialGain;
      source.connect(gain);
      gain.connect(limiter);
      return {
        // A short ramp rather than a jump, so dragging the slider doesn't click.
        setGain(value) {
          gain.gain.setTargetAtTime(value, ctx.currentTime, 0.015);
        },
        dispose() {
          source.disconnect();
          gain.disconnect();
        },
      };
    },
    close() {
      limiter.disconnect();
      ctx.close().catch(() => {});
    },
  };
}

// Device choices are per-browser (device ids don't mean anything on another
// machine), so they live in localStorage rather than on the account.
const INPUT_KEY = "voiceInputDeviceId";
const OUTPUT_KEY = "voiceOutputDeviceId";

function readPref(key) {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writePref(key, value) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // Private windows / blocked storage: the choice just won't persist.
  }
}

export const loadInputDeviceId = () => readPref(INPUT_KEY);
export const loadOutputDeviceId = () => readPref(OUTPUT_KEY);
export const saveInputDeviceId = (id) => writePref(INPUT_KEY, id);
export const saveOutputDeviceId = (id) => writePref(OUTPUT_KEY, id);

// Same constraints the call itself uses, optionally pinned to a chosen mic.
// `ideal` (not `exact`) so an unplugged headset falls back to the default mic
// instead of failing the join outright. With `noiseCancel` the browser's own
// noise suppression is switched off, because RNNoise (micPipeline.js) takes
// its place and stacking the two makes voices sound underwater.
export function micConstraints(deviceId, { noiseCancel = false } = {}) {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: !noiseCancel,
      autoGainControl: true,
      channelCount: 1,
      ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
    },
  };
}

// Mics and speakers for the picker. Browsers only reveal device *labels*
// once mic permission has been granted, so before the first join the lists
// can come back unlabeled -- `labeled` lets the UI say so.
export function useAudioDevices() {
  const [devices, setDevices] = useState({ inputs: [], outputs: [], cameras: [], labeled: false });

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return undefined;
    let cancelled = false;

    async function refresh() {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const inputs = all.filter((d) => d.kind === "audioinput");
        const outputs = all.filter((d) => d.kind === "audiooutput");
        const cameras = all.filter((d) => d.kind === "videoinput");
        setDevices({ inputs, outputs, cameras, labeled: inputs.some((d) => d.label) });
      } catch {
        // No device list: the picker just stays empty/hidden.
      }
    }

    refresh();
    navigator.mediaDevices.addEventListener?.("devicechange", refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.("devicechange", refresh);
    };
  }, []);

  return devices;
}
