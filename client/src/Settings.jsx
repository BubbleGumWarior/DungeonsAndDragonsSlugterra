import { useEffect, useRef, useState } from "react";
import {
  PaletteIcon,
  CheckIcon,
  SpeakerHighIcon,
  SpeakerLowIcon,
  SpeakerXIcon,
  PlayIcon,
  StopIcon,
  EyeIcon,
  WaveformIcon,
  MicrophoneIcon,
  HandPalmIcon,
  BellRingingIcon,
  FadersIcon,
} from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import NavBar from "./NavBar.jsx";
import { THEMES, DEFAULT_THEME } from "./theme.js";
import { volumeToGain } from "./soundVolume.js";
import { useMicLevel } from "./useMicLevel.js";
import "./Panel.css";
import "./Settings.css";

const VOICE_INPUT_MODES = [
  { id: "live", label: "Live Mic", icon: MicrophoneIcon },
  { id: "push_to_talk", label: "Push to Talk", icon: HandPalmIcon },
];

// Same file CombatMap.jsx's shot fires -- kept as its own constant here so
// the Test button's disabled window doesn't reach into combat internals.
const SHOT_SOUND_SRC = "/slugterra-velocity.mp3";
const SHOT_SOUND_DURATION_MS = 1830;

// The join chime, previewed by the Voice panel's Test button. Same file
// VoiceChatContext.jsx plays for real when someone enters a call.
const JOIN_CUE_SRC = "/Join.mp3";
const CUE_SOUND_DURATION_MS = 2000;

// The non-launch combat sounds, one slider each -- they're recorded at
// different loudnesses so a single "Combat shots" level can't sit right for
// all of them. `id` is the key in the persisted combat_sfx_volumes map and
// the name CombatMap.jsx's playCombatSfx expects; keep this list in sync
// with CombatMap.jsx's COMBAT_SFX and settings.js's COMBAT_SFX_KEYS.
// src filenames are capital-cased to match the files in client/public/ --
// Vite serves that directory case-sensitively (see CombatMap.jsx's COMBAT_SFX).
const COMBAT_SFX = [
  { id: "fail", label: "Shot misfire", src: "/Fail.mp3", sub: "A shot that jams and never leaves the barrel." },
  { id: "miss", label: "Shot misses", src: "/Miss.mp3", sub: "A bolt landing wide of its target." },
  { id: "hit", label: "Shot hits", src: "/Hit.mp3", sub: "A bolt landing on a combatant." },
  { id: "break", label: "Wall breaks", src: "/Break.mp3", sub: "A wall shattered by a shot." },
  { id: "hazard", label: "Hazard forms", src: "/Hazard.mp3", sub: "A hazard area created on the battlefield." },
  { id: "geyser", label: "Geyser pod", src: "/Geyser.mp3", sub: "A Pressure Tick pod erupting." },
  { id: "zeus", label: "Zeus thunderclap", src: "/Zeus.mp3", sub: "Follows the launch sound when a Zeus slug is shot." },
];
const SFX_DEFAULT_VOLUME = 0.5;

export default function Settings() {
  const { token, user, updateUser } = useAuth();
  const { slugterraRevealed } = useLiveState();
  const activeTheme = user?.theme ?? DEFAULT_THEME;

  // The combat shoot sound gives away that this is a blaster game -- keep its
  // volume row out of sight until Slugterra is revealed, same gate NavBar and
  // the Dashboard use for the slug-facing tabs. The DM always sees it.
  const showShootSound = user?.role === "Dungeon Master" || slugterraRevealed;

  const [savingTheme, setSavingTheme] = useState(null);
  const [themeError, setThemeError] = useState("");

  const [masterVolume, setMasterVolume] = useState(typeof user?.masterVolume === "number" ? user.masterVolume : 0.5);
  const [masterStatus, setMasterStatus] = useState("idle"); // idle | pending | saving | saved
  const masterSaveTimer = useRef(null);

  const [volume, setVolume] = useState(typeof user?.soundVolume === "number" ? user.soundVolume : 0.5);
  const [volumeStatus, setVolumeStatus] = useState("idle"); // idle | pending | saving | saved
  const [testing, setTesting] = useState(false);
  const saveTimer = useRef(null);
  const testTimer = useRef(null);

  const [voiceInputMode, setVoiceInputMode] = useState(user?.voiceInputMode || "live");
  const [savingVoiceMode, setSavingVoiceMode] = useState(false);
  const [voiceModeError, setVoiceModeError] = useState("");

  const [cueVolume, setCueVolume] = useState(typeof user?.voiceCueVolume === "number" ? user.voiceCueVolume : 0.5);
  const [cueVolumeStatus, setCueVolumeStatus] = useState("idle"); // idle | pending | saving | saved
  const [testingCue, setTestingCue] = useState(false);
  const cueSaveTimer = useRef(null);
  const cueTestTimer = useRef(null);

  // One entry per COMBAT_SFX id. sfxVolumes is the sparse { id: 0-1 } map
  // (missing id => SFX_DEFAULT_VOLUME); sfxStatus tracks each row's save
  // state; testingSfx is the id whose preview is currently playing (only one
  // at a time). sfxVolumesRef mirrors the state so a debounced save reads
  // the freshest map even if another row moved during its window.
  const [sfxVolumes, setSfxVolumes] = useState(() => user?.combatSfxVolumes || {});
  const [sfxStatus, setSfxStatus] = useState({});
  const [testingSfx, setTestingSfx] = useState(null);
  const sfxSaveTimers = useRef({});
  const sfxTestTimer = useRef(null);
  const sfxVolumesRef = useRef(sfxVolumes);
  sfxVolumesRef.current = sfxVolumes;

  const [micStream, setMicStream] = useState(null);
  const [micError, setMicError] = useState("");
  const micLevel = useMicLevel(micStream);

  useEffect(() => {
    if (typeof user?.masterVolume === "number") setMasterVolume(user.masterVolume);
  }, [user?.masterVolume]);

  useEffect(() => {
    if (typeof user?.soundVolume === "number") setVolume(user.soundVolume);
  }, [user?.soundVolume]);

  useEffect(() => {
    if (user?.voiceInputMode) setVoiceInputMode(user.voiceInputMode);
  }, [user?.voiceInputMode]);

  useEffect(() => {
    if (typeof user?.voiceCueVolume === "number") setCueVolume(user.voiceCueVolume);
  }, [user?.voiceCueVolume]);

  useEffect(() => {
    if (user?.combatSfxVolumes) setSfxVolumes(user.combatSfxVolumes);
  }, [user?.combatSfxVolumes]);

  useEffect(() => {
    return () => {
      clearTimeout(masterSaveTimer.current);
      clearTimeout(saveTimer.current);
      clearTimeout(testTimer.current);
      clearTimeout(cueSaveTimer.current);
      clearTimeout(cueTestTimer.current);
      clearTimeout(sfxTestTimer.current);
      Object.values(sfxSaveTimers.current).forEach(clearTimeout);
      // Leaving the page mid-test shouldn't leave the mic hot in the
      // background -- release whatever stream the test button opened.
      setMicStream((prev) => {
        prev?.getTracks().forEach((track) => track.stop());
        return null;
      });
    };
  }, []);

  async function savePreferences(patch) {
    const res = await fetch("/api/settings/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return null;
    return res.json();
  }

  async function handlePickTheme(themeId) {
    if (themeId === activeTheme || savingTheme) return;
    const previousTheme = activeTheme;
    setThemeError("");
    setSavingTheme(themeId);
    // Optimistic -- the whole app repaints the instant this commits, via
    // AuthContext's user-change effect calling applyTheme().
    updateUser({ ...user, theme: themeId });
    const result = await savePreferences({ theme: themeId });
    if (!result) {
      updateUser({ ...user, theme: previousTheme });
      setThemeError("Couldn't save your theme. Try again.");
    }
    setSavingTheme(null);
  }

  // The master is a "set them all" control, not a live multiplier: moving it
  // snaps every individual level to its value and saves them together. Any
  // pending per-slider save is dropped -- the master's write supersedes it.
  // After this, nudging a single slider changes only that one (its own
  // handler below never touches master or the others).
  function handleMasterVolumeInput(e) {
    const next = Number(e.target.value) / 100;
    const sfxNext = Object.fromEntries(COMBAT_SFX.map((s) => [s.id, next]));
    setMasterVolume(next);
    setVolume(next);
    setCueVolume(next);
    setSfxVolumes(sfxNext);
    setMasterStatus("pending");
    setVolumeStatus("idle");
    setCueVolumeStatus("idle");
    setSfxStatus({});
    clearTimeout(saveTimer.current);
    clearTimeout(cueSaveTimer.current);
    clearTimeout(masterSaveTimer.current);
    Object.values(sfxSaveTimers.current).forEach(clearTimeout);
    sfxSaveTimers.current = {};
    masterSaveTimer.current = setTimeout(async () => {
      setMasterStatus("saving");
      const patch = { masterVolume: next, soundVolume: next, voiceCueVolume: next, combatSfxVolumes: sfxNext };
      updateUser({ ...user, ...patch });
      const result = await savePreferences(patch);
      setMasterStatus(result ? "saved" : "idle");
    }, 500);
  }

  function handleVolumeInput(e) {
    const next = Number(e.target.value) / 100;
    setVolume(next);
    setVolumeStatus("pending");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setVolumeStatus("saving");
      updateUser({ ...user, soundVolume: next });
      const result = await savePreferences({ soundVolume: next });
      setVolumeStatus(result ? "saved" : "idle");
    }, 500);
  }

  function handleTestSound() {
    if (testing) return;
    setTesting(true);
    const audio = new Audio(SHOT_SOUND_SRC);
    audio.volume = volumeToGain(volume);
    audio.play().catch(() => {});
    clearTimeout(testTimer.current);
    testTimer.current = setTimeout(() => setTesting(false), SHOT_SOUND_DURATION_MS);
  }

  function handleCueVolumeInput(e) {
    const next = Number(e.target.value) / 100;
    setCueVolume(next);
    setCueVolumeStatus("pending");
    clearTimeout(cueSaveTimer.current);
    cueSaveTimer.current = setTimeout(async () => {
      setCueVolumeStatus("saving");
      updateUser({ ...user, voiceCueVolume: next });
      const result = await savePreferences({ voiceCueVolume: next });
      setCueVolumeStatus(result ? "saved" : "idle");
    }, 500);
  }

  function handleTestCue() {
    if (testingCue) return;
    setTestingCue(true);
    const audio = new Audio(JOIN_CUE_SRC);
    audio.volume = volumeToGain(cueVolume);
    audio.play().catch(() => {});
    clearTimeout(cueTestTimer.current);
    cueTestTimer.current = setTimeout(() => setTestingCue(false), CUE_SOUND_DURATION_MS);
  }

  function handleSfxVolumeInput(id, e) {
    const next = Number(e.target.value) / 100;
    setSfxVolumes((prev) => ({ ...prev, [id]: next }));
    setSfxStatus((prev) => ({ ...prev, [id]: "pending" }));
    clearTimeout(sfxSaveTimers.current[id]);
    sfxSaveTimers.current[id] = setTimeout(async () => {
      setSfxStatus((prev) => ({ ...prev, [id]: "saving" }));
      // Send just this key; the server merges it into the stored map so the
      // other rows are untouched. The optimistic user patch uses the ref so
      // a sibling row moved mid-debounce isn't lost.
      updateUser({ ...user, combatSfxVolumes: { ...sfxVolumesRef.current, [id]: next } });
      const result = await savePreferences({ combatSfxVolumes: { [id]: next } });
      setSfxStatus((prev) => ({ ...prev, [id]: result ? "saved" : "idle" }));
    }, 500);
  }

  function handleTestSfx(id, src) {
    if (testingSfx) return;
    setTestingSfx(id);
    const stop = () => setTestingSfx((cur) => (cur === id ? null : cur));
    const audio = new Audio(src);
    audio.volume = volumeToGain(sfxVolumes[id] ?? SFX_DEFAULT_VOLUME);
    audio.addEventListener("ended", stop);
    audio.play().catch(stop);
    // Fallback in case 'ended' never fires (load failure, etc.) -- these
    // clips are short, a couple of seconds covers the longest.
    clearTimeout(sfxTestTimer.current);
    sfxTestTimer.current = setTimeout(stop, 4000);
  }

  async function handlePickVoiceMode(modeId) {
    if (modeId === voiceInputMode || savingVoiceMode) return;
    const previousMode = voiceInputMode;
    setVoiceModeError("");
    setSavingVoiceMode(true);
    setVoiceInputMode(modeId);
    updateUser({ ...user, voiceInputMode: modeId });
    const result = await savePreferences({ voiceInputMode: modeId });
    if (!result) {
      setVoiceInputMode(previousMode);
      updateUser({ ...user, voiceInputMode: previousMode });
      setVoiceModeError("Couldn't save your input mode. Try again.");
    }
    setSavingVoiceMode(false);
  }

  async function handleToggleMicTest() {
    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop());
      setMicStream(null);
      return;
    }
    setMicError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStream(stream);
    } catch {
      setMicError("Couldn't access your microphone. Check your browser's site permissions.");
    }
  }

  const volumePercent = Math.round(volume * 100);
  const VolumeIcon = volumePercent === 0 ? SpeakerXIcon : volumePercent < 50 ? SpeakerLowIcon : SpeakerHighIcon;
  const cuePercent = Math.round(cueVolume * 100);
  const masterPercent = Math.round(masterVolume * 100);

  return (
    <div className="settings-page">
      <NavBar />

      <div className="settings-body">
        <h1 className="settings-title">Settings</h1>
        <p className="settings-subtitle">Personal preferences -- saved to your account, applied everywhere you sign in.</p>

        <div className="settings-grid">
          <section className="panel settings-voice">
            <div className="panel-header">
              <span className="panel-header-icon">
                <MicrophoneIcon weight="duotone" />
              </span>
              <div className="panel-header-text">
                <h2>Voice</h2>
                <p>How your mic activates in party voice chat, and a way to check it works.</p>
              </div>
            </div>
            <div className="panel-body">
              <div className="voice-mode-row">
                <span className="voice-mode-label">Mic activation</span>
                <div className="dm-console-toggle">
                  {VOICE_INPUT_MODES.map((mode) => {
                    const ModeIcon = mode.icon;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        className={`dm-console-toggle-btn${voiceInputMode === mode.id ? " dm-console-toggle-btn--active" : ""}`}
                        onClick={() => handlePickVoiceMode(mode.id)}
                        disabled={savingVoiceMode}
                        aria-pressed={voiceInputMode === mode.id}
                      >
                        <ModeIcon weight="bold" />
                        {mode.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="voice-mode-hint">
                {voiceInputMode === "push_to_talk"
                  ? "Hold Space (or the panel's talk button) to transmit -- release to go quiet."
                  : "Your mic stays live whenever you're in a call, unless you self-mute."}
              </p>
              {voiceModeError && <p className="panel-error">{voiceModeError}</p>}

              <div className="mic-check">
                <div className={`mic-check-meter${micStream ? " mic-check-meter--live" : ""}`} style={{ "--mic-level": micLevel }}>
                  <span className="mic-check-ring" />
                  <WaveformIcon weight="bold" className="mic-check-icon" />
                </div>
                <div className="mic-check-controls">
                  <button type="button" className="panel-btn panel-btn--test" onClick={handleToggleMicTest}>
                    {micStream ? <StopIcon weight="fill" /> : <PlayIcon weight="fill" />}
                    {micStream ? "Stop Test" : "Test Microphone"}
                  </button>
                  <span className="mic-check-hint">
                    {micStream ? "Speak up -- the ring should pulse with your voice." : "Checks that your mic is picked up before you join a call."}
                  </span>
                </div>
              </div>
              {micError && <p className="panel-error">{micError}</p>}
            </div>
          </section>

          <section className="panel settings-sound">
            <div className="panel-header">
              <span className="panel-header-icon">
                <VolumeIcon weight="duotone" />
              </span>
              <div className="panel-header-text">
                <h2>Sound</h2>
                <p>Volume for each sound the game plays.</p>
              </div>
            </div>
            <div className="panel-body">
              <div className="volume-control volume-control--master">
                <span className="voice-mode-label">All sounds</span>
                <p className="volume-sub">Sets every level below at once. Adjust one of those afterward to change just that sound.</p>
                <div className="volume-row">
                  <FadersIcon weight="bold" className="volume-icon" />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={masterPercent}
                    onChange={handleMasterVolumeInput}
                    aria-label="Master volume for all sounds"
                    className="volume-slider"
                    style={{ "--volume-fill": `${masterPercent}%` }}
                  />
                  <span className="volume-value num-tabular">{masterPercent}%</span>
                </div>
                <div className="volume-footer">
                  <span className="volume-status">
                    {masterStatus === "pending" && "Adjusting…"}
                    {masterStatus === "saving" && "Saving…"}
                    {masterStatus === "saved" && "Saved"}
                    {masterStatus === "idle" && " "}
                  </span>
                </div>
              </div>

              {showShootSound && (
              <div className="volume-control volume-control--divided">
                <span className="voice-mode-label">Combat shots</span>
                <p className="volume-sub">Plays for everyone in a battle when a slug is fired.</p>
                <div className="volume-row">
                  <VolumeIcon weight="bold" className="volume-icon" />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={volumePercent}
                    onChange={handleVolumeInput}
                    aria-label="Combat shot volume"
                    className="volume-slider"
                    style={{ "--volume-fill": `${volumePercent}%` }}
                  />
                  <span className="volume-value num-tabular">{volumePercent}%</span>
                </div>
                <div className="volume-footer">
                  <span className="volume-status">
                    {volumeStatus === "pending" && "Adjusting…"}
                    {volumeStatus === "saving" && "Saving…"}
                    {volumeStatus === "saved" && "Saved"}
                    {volumeStatus === "idle" && " "}
                  </span>
                  <button type="button" className="panel-btn panel-btn--test" onClick={handleTestSound} disabled={testing}>
                    <PlayIcon weight="fill" />
                    {testing ? "Playing…" : "Test Shoot Sound"}
                  </button>
                </div>
              </div>
              )}

              {showShootSound &&
                COMBAT_SFX.map((sfx) => {
                  const pct = Math.round((sfxVolumes[sfx.id] ?? SFX_DEFAULT_VOLUME) * 100);
                  const status = sfxStatus[sfx.id];
                  return (
                    <div key={sfx.id} className="volume-control volume-control--divided">
                      <span className="voice-mode-label">{sfx.label}</span>
                      <p className="volume-sub">{sfx.sub}</p>
                      <div className="volume-row">
                        <SpeakerHighIcon weight="bold" className="volume-icon" />
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={pct}
                          onChange={(e) => handleSfxVolumeInput(sfx.id, e)}
                          aria-label={`${sfx.label} volume`}
                          className="volume-slider"
                          style={{ "--volume-fill": `${pct}%` }}
                        />
                        <span className="volume-value num-tabular">{pct}%</span>
                      </div>
                      <div className="volume-footer">
                        <span className="volume-status">
                          {status === "pending" && "Adjusting…"}
                          {status === "saving" && "Saving…"}
                          {status === "saved" && "Saved"}
                          {!status && " "}
                        </span>
                        <button
                          type="button"
                          className="panel-btn panel-btn--test"
                          onClick={() => handleTestSfx(sfx.id, sfx.src)}
                          disabled={testingSfx != null}
                        >
                          <PlayIcon weight="fill" />
                          {testingSfx === sfx.id ? "Playing…" : "Test Sound"}
                        </button>
                      </div>
                    </div>
                  );
                })}

              <div className="volume-control volume-control--divided">
                <span className="voice-mode-label">Voice chat join / leave</span>
                <p className="volume-sub">Plays for everyone in a call when a party member joins or leaves it.</p>
                <div className="volume-row">
                  <BellRingingIcon weight="bold" className="volume-icon" />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={cuePercent}
                    onChange={handleCueVolumeInput}
                    aria-label="Voice chat join and leave sound volume"
                    className="volume-slider"
                    style={{ "--volume-fill": `${cuePercent}%` }}
                  />
                  <span className="volume-value num-tabular">{cuePercent}%</span>
                </div>
                <div className="volume-footer">
                  <span className="volume-status">
                    {cueVolumeStatus === "pending" && "Adjusting…"}
                    {cueVolumeStatus === "saving" && "Saving…"}
                    {cueVolumeStatus === "saved" && "Saved"}
                    {cueVolumeStatus === "idle" && " "}
                  </span>
                  <button type="button" className="panel-btn panel-btn--test" onClick={handleTestCue} disabled={testingCue}>
                    <PlayIcon weight="fill" />
                    {testingCue ? "Playing…" : "Test Sound"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="panel settings-appearance">
            <div className="panel-header">
              <span className="panel-header-icon">
                <PaletteIcon weight="duotone" />
              </span>
              <div className="panel-header-text">
                <h2>Appearance</h2>
                <p>Pick the accent that colors your whole game.</p>
              </div>
            </div>
            <div className="panel-body">
              <div className="theme-grid">
                {THEMES.map((themeOption) => {
                  const isActive = themeOption.id === activeTheme;
                  const isSaving = savingTheme === themeOption.id;
                  return (
                    <button
                      key={themeOption.id}
                      type="button"
                      className={`theme-swatch${isActive ? " theme-swatch--active" : ""}`}
                      onClick={() => handlePickTheme(themeOption.id)}
                      disabled={Boolean(savingTheme)}
                      aria-pressed={isActive}
                      title={themeOption.description}
                    >
                      <span
                        className="theme-swatch-preview"
                        style={{
                          background: `radial-gradient(circle at 30% 22%, ${themeOption.ramp[900]}, ${themeOption.ramp[950]} 72%)`,
                        }}
                      >
                        <span
                          className="theme-swatch-pill"
                          style={{
                            background: `linear-gradient(180deg, ${themeOption.ramp[600]}, ${themeOption.ramp[700]})`,
                            borderColor: themeOption.ramp[500],
                          }}
                        />
                        {isActive && (
                          <span className="theme-swatch-check">
                            <CheckIcon weight="bold" />
                          </span>
                        )}
                      </span>
                      <span className="theme-swatch-label">
                        {themeOption.label}
                        {isSaving && <span className="theme-swatch-saving"> &middot; saving&hellip;</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              {themeError && <p className="panel-error">{themeError}</p>}
            </div>
          </section>

          <section className="panel settings-preview">
            <div className="panel-header">
              <span className="panel-header-icon">
                <EyeIcon weight="duotone" />
              </span>
              <div className="panel-header-text">
                <h2>Preview</h2>
                <p>Buttons and text in your current theme -- no need to leave this page.</p>
              </div>
            </div>
            <div className="panel-body">
              <div className="preview-row">
                <h3 className="preview-heading">The Testing Chronicles</h3>
                <span className="panel-header-badge">Loyalty Tier III</span>
              </div>
              <p className="preview-copy">
                Body text sits on the panel like this -- <strong>bold emphasis</strong>, and{" "}
                <a href="#settings">inline links</a> in gold, which stays constant across every theme.
              </p>
              <p className="preview-copy preview-copy--dim">
                Dimmed secondary text, for hints and timestamps, reads a shade softer.
              </p>
              <div className="preview-buttons">
                <button type="button" className="panel-btn">
                  Primary Action
                </button>
                <button type="button" className="panel-btn panel-btn--ghost">
                  Secondary Action
                </button>
                <button type="button" className="panel-btn" disabled>
                  Disabled
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
