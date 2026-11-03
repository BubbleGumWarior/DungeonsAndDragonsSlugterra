// Perceived loudness follows roughly a cubic curve against linear
// amplitude (the same "audio taper" real volume knobs are built with) --
// handing the slider's raw 0-1 position straight to Audio.volume packs
// almost the whole audible range into the bottom ~10% of the track, with
// the rest of the travel barely sounding any different. Cubing the
// slider's fraction before it becomes gain spreads perceived loudness
// evenly across the whole slider instead. Shared by CombatMap.jsx (the
// real shoot sound) and Settings.jsx (the Test button preview) so a given
// slider position always sounds the same in both places.
const TAPER_EXPONENT = 3;

export function volumeToGain(sliderFraction) {
  const clamped = Math.min(1, Math.max(0, typeof sliderFraction === "number" ? sliderFraction : 0.5));
  return Math.pow(clamped, TAPER_EXPONENT);
}

// Voice chat's per-player mixer runs 0-2: up to 1 it is the normal taper
// above; past 1 it is a straight boost (2 = 4x gain, about +12dB) for a
// friend who's just quiet, with the shared limiter in voiceAudio.js keeping
// it from clipping. Values stored before the boost existed are all <= 1 and
// map exactly as they did.
export const MAX_VOICE_VOLUME = 2;

export function voiceVolumeToGain(sliderFraction) {
  const value = Math.min(MAX_VOICE_VOLUME, Math.max(0, typeof sliderFraction === "number" ? sliderFraction : 1));
  return value <= 1 ? volumeToGain(value) : 1 + (value - 1) * 3;
}
