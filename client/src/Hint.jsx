import { useId } from "react";
import "./Hint.css";

// A hover / keyboard-focus / tap explainer. The children are what the player
// is looking at; `title` and `tip` fill the tooltip. Pure CSS show/hide, so it
// also opens on focus (a tap focuses the trigger on phones). Keep it out of
// overflow:hidden ancestors, or the tip is clipped.
export default function Hint({ title, tip, align = "start", className = "", children }) {
  const id = useId();
  return (
    <span className={`hint hint--${align} ${className}`} tabIndex={0} aria-describedby={id}>
      {children}
      <span id={id} role="tooltip" className="hint-pop">
        {title && <strong className="hint-title">{title}</strong>}
        {tip}
      </span>
    </span>
  );
}
