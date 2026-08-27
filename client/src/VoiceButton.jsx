import { PhoneIcon } from "@phosphor-icons/react";
import { useVoiceChat } from "./VoiceChatContext.jsx";

export default function VoiceButton({ open, onToggle }) {
  const { inCall, rosterCount, selfSpeaking } = useVoiceChat();
  // Someone's already talking and the viewer hasn't joined yet -- the badge
  // + pulse are what make that discoverable without opening the panel.
  const showIdleSignal = !inCall && rosterCount > 0;

  const classNames = [
    "voice-button",
    inCall && "voice-button--active",
    showIdleSignal && "voice-button--idle-live",
    inCall && selfSpeaking && "voice-button--speaking",
    open && "voice-button--open",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classNames}
      onClick={onToggle}
      aria-expanded={open}
      aria-label={inCall ? "Voice chat controls" : "Open voice chat"}
    >
      <span className="voice-button-pulse" aria-hidden="true" />
      <PhoneIcon weight={inCall ? "fill" : "duotone"} />
      {showIdleSignal && (
        <span className="voice-button-badge num-tabular" aria-hidden="true">
          {rosterCount}
        </span>
      )}
    </button>
  );
}
