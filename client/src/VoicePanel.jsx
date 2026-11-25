import {
  UsersThreeIcon,
  XIcon,
  PhoneIcon,
  PhoneDisconnectIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  HandPalmIcon,
  SpeakerXIcon,
  ArrowsClockwiseIcon,
  SlidersHorizontalIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
} from "@phosphor-icons/react";
import { useVoiceChat } from "./VoiceChatContext.jsx";
import { useAudioDevices } from "./voiceAudio.js";
import { MAX_VOICE_VOLUME } from "./soundVolume.js";
import "./Panel.css";
import "./VoicePanel.css";

function initial(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

// Chrome lists a "default" and a "communications" alias for the same devices
// it already lists individually; "System default" covers the first and the
// second is just noise in a short list.
const isAlias = (device) => device.deviceId === "default" || device.deviceId === "communications";

function DeviceSelect({ label, devices, value, onChange, fallbackName }) {
  const options = devices.filter((d) => !isAlias(d));
  return (
    <label className="voice-device-field">
      <span className="voice-device-label">{label}</span>
      <select value={options.some((d) => d.deviceId === value) ? value : ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">System default</option>
        {options.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${fallbackName} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

// Mic, speaker and camera choice. Saved per-browser (see voiceAudio.js and
// voiceVideo.js), applied on the next join -- or immediately if you're
// already in a call.
function DevicePicker() {
  const {
    inputDeviceId,
    outputDeviceId,
    setInputDevice,
    setOutputDevice,
    canPickOutput,
    canUseCamera,
    cameraDeviceId,
    setCameraDevice,
  } = useVoiceChat();
  const { inputs, outputs, cameras, labeled } = useAudioDevices();
  const showOutput = canPickOutput && outputs.length > 0;
  const showCamera = canUseCamera && cameras.length > 0;
  if (inputs.length === 0 && !showOutput && !showCamera) return null;

  return (
    <details className="voice-devices">
      <summary className="voice-devices-summary">
        <SlidersHorizontalIcon weight="bold" />
        Devices
      </summary>
      <div className="voice-devices-body">
        <DeviceSelect label="Microphone" devices={inputs} value={inputDeviceId} onChange={setInputDevice} fallbackName="Microphone" />
        {showOutput && (
          <DeviceSelect label="Speakers" devices={outputs} value={outputDeviceId} onChange={setOutputDevice} fallbackName="Speakers" />
        )}
        {showCamera && (
          <DeviceSelect label="Camera" devices={cameras} value={cameraDeviceId} onChange={setCameraDevice} fallbackName="Camera" />
        )}
        {!labeled && <p className="voice-device-hint">Device names appear once you've allowed microphone access (join the call once).</p>}
      </div>
    </details>
  );
}

// Data saver. Client-side only: kept in this browser, and peers simply stop
// sending you video while it's off -- so it really saves the download.
function VideoSaverSwitch() {
  const { receiveVideo, setReceiveVideo } = useVoiceChat();
  return (
    <div className="voice-switch-row">
      <div className="voice-switch-text">
        <span className="voice-switch-label" id="voice-receive-video-label">
          Show others' cameras
        </span>
        <span className="voice-switch-hint" id="voice-receive-video-hint">
          {receiveVideo ? "Turn off on limited data. They'll still see you." : "Off: you won't download anyone's video."}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={receiveVideo}
        aria-labelledby="voice-receive-video-label"
        aria-describedby="voice-receive-video-hint"
        className="voice-switch"
        onClick={() => setReceiveVideo(!receiveVideo)}
      >
        <span className="voice-switch-thumb" aria-hidden="true" />
      </button>
    </div>
  );
}

function ParticipantRow({ name, speaking, muted, reconnecting, camera, volume, onVolumeChange }) {
  const percent = Math.round(volume * 100);
  return (
    <div className={`voice-row${speaking ? " voice-row--speaking" : ""}`}>
      <span className="voice-row-avatar">
        {initial(name)}
        <span className="voice-row-ring" aria-hidden="true" />
      </span>
      <div className="voice-row-main">
        <span className="voice-row-name">
          {name}
          {muted && (
            <span className="voice-row-muted-tag">
              <MicrophoneSlashIcon weight="bold" /> muted
            </span>
          )}
          {reconnecting && (
            <span className="voice-row-muted-tag">
              <ArrowsClockwiseIcon weight="bold" /> reconnecting
            </span>
          )}
          {camera && (
            <span className="voice-row-muted-tag voice-row-camera-tag">
              <VideoCameraIcon weight="fill" /> on camera
            </span>
          )}
        </span>
        <div className="voice-row-volume">
          <SpeakerXIcon weight="bold" className="voice-slider-icon" />
          <input
            type="range"
            min="0"
            max={MAX_VOICE_VOLUME * 100}
            step="1"
            value={percent}
            onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
            aria-label={`Volume for ${name}`}
            className="voice-slider"
            style={{ "--volume-fill": `${percent / MAX_VOICE_VOLUME}%` }}
          />
          <span className={`voice-row-percent num-tabular${percent > 100 ? " voice-row-percent--boost" : ""}`}>{percent}%</span>
        </div>
      </div>
    </div>
  );
}

export default function VoicePanel({ onClose }) {
  const {
    inCall,
    joining,
    error,
    voiceInputMode,
    participants,
    selfName,
    rosterCount,
    selfMuted,
    selfSpeaking,
    pttHeld,
    setPttHeld,
    joinCall,
    leaveCall,
    toggleSelfMute,
    setPeerVolume,
    canUseCamera,
    cameraOn,
    cameraStarting,
    toggleCamera,
  } = useVoiceChat();

  const isPushToTalk = voiceInputMode === "push_to_talk";
  const canTransmit = !selfMuted && (!isPushToTalk || pttHeld);

  return (
    <div className="panel voice-panel">
      <div className="panel-header">
        <span className="panel-header-icon">
          <UsersThreeIcon weight="duotone" />
        </span>
        <div className="panel-header-text">
          <h2>Voice Chat</h2>
          <p>{rosterCount > 0 ? `${rosterCount} at the table` : "Nobody's on yet"}</p>
        </div>
        <button type="button" className="panel-btn panel-btn--icon panel-btn--ghost voice-panel-close" onClick={onClose} aria-label="Close voice chat panel">
          <XIcon weight="bold" />
        </button>
      </div>

      <div className="panel-body voice-panel-body">
        {!inCall && (
          <>
            {participants.length > 0 ? (
              <div className="voice-preview-list">
                {participants.map((p) => (
                  <span key={p.userId} className="voice-preview-chip">
                    {p.muted ? <MicrophoneSlashIcon weight="bold" /> : <MicrophoneIcon weight="bold" />}
                    {p.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="voice-panel-empty-hint">Be the first to join -- the table will see you're on.</p>
            )}
            {error && <p className="panel-error">{error}</p>}
            <button type="button" className="panel-btn voice-join-btn" onClick={joinCall} disabled={joining}>
              <PhoneIcon weight="fill" />
              {joining ? "Joining…" : "Join Voice Chat"}
            </button>
            <VideoSaverSwitch />
            <DevicePicker />
          </>
        )}

        {inCall && (
          <>
            <div className={`voice-row voice-row--self${selfSpeaking && canTransmit ? " voice-row--speaking" : ""}`}>
              <span className="voice-row-avatar voice-row-avatar--self">
                {initial(selfName)}
                <span className="voice-row-ring" aria-hidden="true" />
              </span>
              <div className="voice-row-main">
                <span className="voice-row-name">You</span>
                {isPushToTalk && (
                  <span className="voice-row-hint">{pttHeld ? "Transmitting…" : "Hold Space to talk"}</span>
                )}
              </div>
              {canUseCamera && (
                <button
                  type="button"
                  className={`voice-mute-btn voice-cam-btn${cameraOn ? " voice-cam-btn--on" : ""}`}
                  onClick={toggleCamera}
                  disabled={cameraStarting}
                  aria-pressed={cameraOn}
                  aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
                  title={cameraStarting ? "Starting camera…" : cameraOn ? "Turn camera off" : "Turn camera on"}
                >
                  {cameraOn ? <VideoCameraIcon weight="fill" /> : <VideoCameraSlashIcon weight="bold" />}
                </button>
              )}
              <button
                type="button"
                className={`voice-mute-btn${selfMuted ? " voice-mute-btn--muted" : ""}`}
                onClick={toggleSelfMute}
                aria-pressed={selfMuted}
                title={selfMuted ? "Unmute yourself" : "Mute yourself"}
              >
                {selfMuted ? <MicrophoneSlashIcon weight="bold" /> : <MicrophoneIcon weight="bold" />}
              </button>
            </div>

            {isPushToTalk && (
              <button
                type="button"
                className={`voice-ptt-btn${pttHeld ? " voice-ptt-btn--held" : ""}`}
                disabled={selfMuted}
                onPointerDown={() => setPttHeld(true)}
                onPointerUp={() => setPttHeld(false)}
                onPointerLeave={() => setPttHeld(false)}
              >
                <HandPalmIcon weight="bold" />
                {selfMuted ? "Unmute to talk" : pttHeld ? "Release to stop" : "Hold to Talk"}
              </button>
            )}

            {participants.length > 0 ? (
              <div className="voice-participants">
                {participants.map((p) => (
                  <ParticipantRow
                    key={p.userId}
                    name={p.name}
                    speaking={p.speaking}
                    muted={p.muted}
                    reconnecting={p.reconnecting}
                    camera={p.camera}
                    volume={p.volume}
                    onVolumeChange={(value) => setPeerVolume(p.userId, value)}
                  />
                ))}
              </div>
            ) : (
              <p className="voice-panel-empty-hint">You're the only one here so far.</p>
            )}

            <VideoSaverSwitch />
            <DevicePicker />
            {error && <p className="panel-error">{error}</p>}

            <button type="button" className="panel-btn panel-btn--ghost voice-leave-btn" onClick={leaveCall}>
              <PhoneDisconnectIcon weight="bold" />
              Leave Voice Chat
            </button>
          </>
        )}
      </div>
    </div>
  );
}
