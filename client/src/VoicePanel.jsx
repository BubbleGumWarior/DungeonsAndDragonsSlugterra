import {
  UsersThreeIcon,
  XIcon,
  PhoneIcon,
  PhoneDisconnectIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  HandPalmIcon,
  SpeakerXIcon,
} from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useVoiceChat } from "./VoiceChatContext.jsx";
import "./Panel.css";
import "./VoicePanel.css";

function initial(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

function ParticipantRow({ username, speaking, muted, volume, onVolumeChange }) {
  const percent = Math.round(volume * 100);
  return (
    <div className={`voice-row${speaking ? " voice-row--speaking" : ""}`}>
      <span className="voice-row-avatar">
        {initial(username)}
        <span className="voice-row-ring" aria-hidden="true" />
      </span>
      <div className="voice-row-main">
        <span className="voice-row-name">
          {username}
          {muted && (
            <span className="voice-row-muted-tag">
              <MicrophoneSlashIcon weight="bold" /> muted
            </span>
          )}
        </span>
        <div className="voice-row-volume">
          <SpeakerXIcon weight="bold" className="voice-slider-icon" />
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={percent}
            onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
            aria-label={`Volume for ${username}`}
            className="voice-slider"
            style={{ "--volume-fill": `${percent}%` }}
          />
          <span className="voice-row-percent num-tabular">{percent}%</span>
        </div>
      </div>
    </div>
  );
}

export default function VoicePanel({ onClose }) {
  const { user } = useAuth();
  const {
    inCall,
    joining,
    error,
    voiceInputMode,
    participants,
    rosterCount,
    selfMuted,
    selfSpeaking,
    pttHeld,
    setPttHeld,
    joinCall,
    leaveCall,
    toggleSelfMute,
    setPeerVolume,
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
                    {p.username}
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
          </>
        )}

        {inCall && (
          <>
            <div className={`voice-row voice-row--self${selfSpeaking && canTransmit ? " voice-row--speaking" : ""}`}>
              <span className="voice-row-avatar voice-row-avatar--self">
                {initial(user?.username)}
                <span className="voice-row-ring" aria-hidden="true" />
              </span>
              <div className="voice-row-main">
                <span className="voice-row-name">You</span>
                {isPushToTalk && (
                  <span className="voice-row-hint">{pttHeld ? "Transmitting…" : "Hold Space to talk"}</span>
                )}
              </div>
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
                    username={p.username}
                    speaking={p.speaking}
                    muted={p.muted}
                    volume={p.volume}
                    onVolumeChange={(value) => setPeerVolume(p.userId, value)}
                  />
                ))}
              </div>
            ) : (
              <p className="voice-panel-empty-hint">You're the only one here so far.</p>
            )}

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
