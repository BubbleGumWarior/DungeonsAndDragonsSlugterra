import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { REF_KINDS } from "./noteLinks.js";
import { RefIcon } from "./NoteRichText.jsx";

const CARD_WIDTH = 288;
const MARGIN = 12;

// The small card a chip opens: what the thing is right now, and a way through
// to the page where it lives. Placed against the chip, flipped above it when
// there is no room below.
export default function NoteRefCard({ target, entry, onOpen, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const info = REF_KINDS[target.kind];

  useLayoutEffect(() => {
    const rect = target.anchor.getBoundingClientRect();
    const height = ref.current?.offsetHeight ?? 150;
    const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - CARD_WIDTH - MARGIN));
    const below = rect.bottom + 8;
    const top = below + height > window.innerHeight - MARGIN ? Math.max(MARGIN, rect.top - height - 8) : below;
    setPos({ left, top });
  }, [target]);

  useEffect(() => {
    function onDown(e) {
      if (!ref.current?.contains(e.target) && !target.anchor.contains(e.target)) onClose();
    }
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [target, onClose]);

  const gone = info.group === "people" ? "They aren't in the Chronicle any more, or haven't been revealed to you." : "You no longer have this.";

  return (
    <div
      ref={ref}
      className="nb-card"
      role="dialog"
      aria-label={`${info.label}: ${entry?.name ?? target.label}`}
      style={pos ? { left: pos.left, top: pos.top, width: CARD_WIDTH } : { width: CARD_WIDTH, visibility: "hidden" }}
    >
      <div className="nb-card-head">
        <span className="nb-card-art">
          {entry?.image ? <img src={entry.image} alt="" /> : <RefIcon kind={target.kind} size={26} />}
        </span>
        <div className="nb-card-text">
          <span className="nb-card-kind">{info.label}</span>
          <strong className="nb-card-name">{entry?.name ?? target.label}</strong>
          <span className="nb-card-sub">{entry ? entry.sub : gone}</span>
        </div>
      </div>
      {entry && (
        <button type="button" className="nb-card-open" onClick={() => onOpen(entry)}>
          Open in {info.where}
          <ArrowRightIcon weight="bold" />
        </button>
      )}
    </div>
  );
}
