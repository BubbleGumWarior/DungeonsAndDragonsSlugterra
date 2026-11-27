import { RnnoiseWorkletNode, loadRnnoise } from "@sapphi-red/web-noise-suppressor";
import rnnoiseWorkletUrl from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import { micConstraints } from "./voiceAudio.js";

// The outgoing microphone for voice chat (VoiceChatContext.jsx) and the
// Settings mic check. With noise cancellation off it's the plain browser
// stream, using the browser's built-in noise suppression. With it on, the mic
// runs through RNNoise first -- a small neural network trained to keep
// speech and drop everything else (keyboards, fans, dogs, traffic, dice on a
// table) -- in its own AudioContext:
//
//   mic -> high-pass 80 Hz (desk thumps, mains hum) -> RNNoise -> call stream
//
// RNNoise only works at 48 kHz, which is why this context is separate from
// the playback graph in voiceAudio.js (that one runs at whatever rate the
// speakers use). Everything runs in an AudioWorklet off the main thread and
// adds about 10 ms of delay.
//
// If any of that can't start (no AudioWorklet, old Safari, the wasm fetch
// fails), the mic falls back to the browser's own noise suppression rather
// than failing the join.

const SAMPLE_RATE = 48000;
const HIGHPASS_HZ = 80;

const AudioContextClass = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;

export function supportsNoiseCancel() {
  return Boolean(AudioContextClass && typeof AudioWorkletNode !== "undefined" && typeof WebAssembly !== "undefined");
}

// The ~150 KB wasm model is fetched once per page load and reused: it's
// structured-cloned into each worklet, not transferred, so one copy serves
// every rebuild (mic swaps, toggling the setting mid-call).
let wasmPromise = null;
function loadModel() {
  if (!wasmPromise) {
    wasmPromise = loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl }).catch((err) => {
      wasmPromise = null;
      throw err;
    });
  }
  return wasmPromise;
}

function stopTracks(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

async function buildNoiseCancel(raw) {
  const ctx = new AudioContextClass({ sampleRate: SAMPLE_RATE, latencyHint: "interactive" });
  let rnnoise = null;
  try {
    const [wasmBinary] = await Promise.all([loadModel(), ctx.audioWorklet.addModule(rnnoiseWorkletUrl)]);
    const source = ctx.createMediaStreamSource(raw);
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = HIGHPASS_HZ;
    highpass.Q.value = 0.7;
    rnnoise = new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 });
    const destination = ctx.createMediaStreamDestination();
    destination.channelCount = 1;
    source.connect(highpass);
    highpass.connect(rnnoise);
    rnnoise.connect(destination);
    // Created after an await, so it may start suspended; a page that already
    // holds mic permission is allowed to start audio.
    await ctx.resume().catch(() => {});

    return {
      stream: destination.stream,
      resume() {
        if (ctx.state !== "running" && ctx.state !== "closed") ctx.resume().catch(() => {});
      },
      dispose() {
        source.disconnect();
        highpass.disconnect();
        rnnoise.disconnect();
        rnnoise.destroy();
        ctx.close().catch(() => {});
      },
    };
  } catch (err) {
    rnnoise?.destroy();
    ctx.close().catch(() => {});
    throw err;
  }
}

// Opens the mic. Resolves to { stream, requested, noiseCancel, resume, dispose }:
// `stream` is what to send / meter, `requested` echoes the option asked for,
// `noiseCancel` says whether RNNoise is actually running (false after a
// fallback), `dispose` releases the mic and everything built on it. Rejects
// only if the mic itself can't be opened.
export async function openMic(deviceId, { noiseCancel = false } = {}) {
  const wantNoiseCancel = noiseCancel && supportsNoiseCancel();
  const raw = await navigator.mediaDevices.getUserMedia(micConstraints(deviceId, { noiseCancel: wantNoiseCancel }));

  if (wantNoiseCancel) {
    try {
      const pipeline = await buildNoiseCancel(raw);
      pipeline.stream.getAudioTracks().forEach((track) => {
        track.contentHint = "speech";
      });
      return {
        stream: pipeline.stream,
        requested: noiseCancel,
        noiseCancel: true,
        resume: pipeline.resume,
        dispose() {
          pipeline.dispose();
          stopTracks(raw);
        },
      };
    } catch (err) {
      console.warn("[voice] noise cancellation unavailable, using the browser's own noise suppression:", err?.message || err);
      // The mic was opened with browser suppression off; turn it back on.
      await Promise.all(
        raw.getAudioTracks().map((track) => track.applyConstraints({ ...track.getConstraints(), noiseSuppression: true }).catch(() => {}))
      );
    }
  }

  // Tells the encoder this is speech (favors intelligibility over fidelity).
  raw.getAudioTracks().forEach((track) => {
    track.contentHint = "speech";
  });
  return {
    stream: raw,
    requested: noiseCancel,
    noiseCancel: false,
    resume() {},
    dispose() {
      stopTracks(raw);
    },
  };
}
