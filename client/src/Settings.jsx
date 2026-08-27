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
} from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
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

export default function Settings() {
  const { token, user, updateUser } = useAuth();
  const activeTheme = user?.theme ?? DEFAULT_THEME;

  const [savingTheme, setSavingTheme] = useState(null);
  const [themeError, setThemeError] = useState("");

  const [volume, setVolume] = useState(typeof user?.soundVolume === "number" ? user.soundVolume : 0.5);
  const [volumeStatus, setVolumeStatus] = useState("idle"); // idle | pending | saving | saved
  const [testing, setTesting] = useState(false);
  const saveTimer = useRef(null);
  const testTimer = useRef(null);

  const [voiceInputMode, setVoiceInputMode] = useState(user?.voiceInputMode || "live");
  const [savingVoiceMode, setSavingVoiceMode] = useState(false);
  const [voiceModeError, setVoiceModeError] = useState("");

  const [micStream, setMicStream] = useState(null);
  const [micError, setMicError] = useState("");
  const micLevel = useMicLevel(micStream);

  useEffect(() => {
    if (typeof user?.soundVolume === "number") setVolume(user.soundVolume);
  }, [user?.soundVolume]);

  useEffect(() => {
    if (user?.voiceInputMode) setVoiceInputMode(user.voiceInputMode);
  }, [user?.voiceInputMode]);

  useEffect(() => {
    return () => {
      clearTimeout(saveTimer.current);
      clearTimeout(testTimer.current);
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

  return (
    <div className="settings-page">
      <NavBar />

      <div className="settings-body">
        <h1 className="settings-title">Settings</h1>
        <p className="settings-subtitle">Personal preferences -- saved to your account, applied everywhere you sign in.</p>

        <div className="settings-grid">
          <section className="panel">
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

          <section className="panel settings-sound">
            <div className="panel-header">
              <span className="panel-header-icon">
                <VolumeIcon weight="duotone" />
              </span>
              <div className="panel-header-text">
                <h2>Sound</h2>
                <p>Controls the sound volume being played.</p>
              </div>
            </div>
            <div className="panel-body">
              <div className="volume-control">
                <div className="volume-row">
                  <VolumeIcon weight="bold" className="volume-icon" />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={volumePercent}
                    onChange={handleVolumeInput}
                    aria-label="Effects volume"
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
            </div>
          </section>

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
