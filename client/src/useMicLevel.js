import { useEffect, useRef, useState } from "react";

// Shared by Settings.jsx's mic-check meter and VoiceChatContext.jsx's
// per-participant "who's talking" rings -- one AnalyserNode primitive, two
// consumers, same relationship soundVolume.js's volumeToGain has with
// Settings.jsx and CombatMap.jsx.
//
// A level above this reads as "actively speaking" rather than room noise /
// mic hiss. Exported so every consumer agrees on the same cutoff.
export const SPEAKING_THRESHOLD = 0.08;

// Low-level sampler, no React involved -- lets VoiceChatContext drive a
// single shared animation loop across every participant's stream (local +
// up to 8 remote) instead of one rAF loop per stream. useMicLevel below is
// a thin per-component hook wrapper around the same primitive for the
// single-stream case (the Settings mic-check meter).
export function createLevelSampler(stream) {
  if (!stream || stream.getAudioTracks().length === 0) return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  const audioContext = new AudioContextClass();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);

  return {
    getLevel() {
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const normalized = (data[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      // Raw RMS for normal speech tops out well under 1 -- scale it up so
      // the meter actually reaches "full" on a normal speaking voice
      // instead of only ever showing a sliver.
      return Math.min(1, rms * 4);
    },
    dispose() {
      source.disconnect();
      analyser.disconnect();
      audioContext.close().catch(() => {});
    },
  };
}

// Live 0-1 input level for a single MediaStream, sampled on each animation
// frame. Returns 0 whenever there's no stream to read.
export function useMicLevel(stream) {
  const [level, setLevel] = useState(0);
  const samplerRef = useRef(null);

  useEffect(() => {
    const sampler = createLevelSampler(stream);
    samplerRef.current = sampler;
    if (!sampler) {
      setLevel(0);
      return undefined;
    }

    let cancelled = false;
    let frameId = requestAnimationFrame(tick);

    function tick() {
      if (cancelled) return;
      setLevel(sampler.getLevel());
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      sampler.dispose();
    };
  }, [stream]);

  return level;
}
