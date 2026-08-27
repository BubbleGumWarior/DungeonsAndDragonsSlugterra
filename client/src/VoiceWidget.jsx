import { useEffect, useRef, useState } from "react";
import VoiceButton from "./VoiceButton.jsx";
import VoicePanel from "./VoicePanel.jsx";
import "./VoiceWidget.css";

// Floating, always-mounted voice chat entry point -- rendered once in
// App.jsx as a sibling of <Routes>, so it (and the call it's attached to
// via VoiceChatContext) survives every page navigation. Owns only the
// open/closed state of the panel; the call itself lives in VoiceChatContext
// regardless of whether this is open.
export default function VoiceWidget() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Same outside-pointerdown + Escape dismissal NavBar.jsx uses for its
  // mobile dropdown -- click-away closes the panel without a full-screen
  // backdrop, since this is meant to read as a docked utility, not a modal.
  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="voice-widget" ref={rootRef}>
      {open && <VoicePanel onClose={() => setOpen(false)} />}
      <VoiceButton open={open} onToggle={() => setOpen((v) => !v)} />
    </div>
  );
}
