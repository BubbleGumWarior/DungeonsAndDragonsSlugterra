import { useState } from "react";
import { CheckIcon, MinusIcon, PencilSimpleIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import "./FameHeatStepper.css";

// Same +/- stepper pattern as CharacterVitals' Grit editor, but floored at 0
// with no upper clamp -- Fame/Heat have no max, and both are freely settable
// either direction by the DM (Heat's automatic 1:1 mirroring of a Fame gain
// is a separate thing entirely -- see grantFame in combat.js -- this control
// is purely the DM's own manual dial on top of that).
//
// The pencil button opens a direct numeric entry for jumping straight to a
// value -- clicking +/- one at a time doesn't scale once Fame/Heat climb
// into the hundreds from actual play.
//
// With `sliderMax` a slider sits under the row so the DM can see where a value
// lands on the scale and drag to it. `sliderTrack` is its track's CSS background
// (Heat passes its blue-to-red gauge). The stepper still has no cap: a value
// past `sliderMax` just pins the thumb to the end. The slider holds a local
// value while dragging and only commits on release, so one drag is one PATCH.
export default function FameHeatStepper({ label, value, onChange, icon, valueColor, sliderMax, sliderTrack }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [sliding, setSliding] = useState(null);

  // `valueColor` is a colour, or a function of the value so the number can
  // follow the slider while it's still being dragged.
  const shownValue = sliding ?? value ?? 0;
  const shownColor = typeof valueColor === "function" ? valueColor(shownValue) : valueColor;

  function commitSlide() {
    if (sliding == null) return;
    if (sliding !== value) onChange?.(sliding);
    setSliding(null);
  }

  function adjust(delta) {
    const next = Math.max(0, (value ?? 0) + delta);
    if (next !== value) onChange?.(next);
  }

  function startEditing() {
    setDraft(String(value ?? 0));
    setEditing(true);
  }

  function commitEdit() {
    const parsed = Math.round(Number(draft));
    if (Number.isFinite(parsed)) {
      const next = Math.max(0, parsed);
      if (next !== value) onChange?.(next);
    }
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

  return (
    <div className="fame-heat-row">
      <span className="fame-heat-label">{label}</span>
      {editing ? (
        <div className="fame-heat-editor">
          <input
            type="number"
            className="fame-heat-input"
            value={draft}
            min={0}
            autoFocus
            onFocus={(e) => e.target.select()}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") cancelEdit();
            }}
          />
          <button type="button" onClick={commitEdit} aria-label={`Confirm ${label}`}>
            <CheckIcon weight="bold" />
          </button>
          <button type="button" onClick={cancelEdit} aria-label={`Cancel editing ${label}`}>
            <XIcon weight="bold" />
          </button>
        </div>
      ) : (
        <div className="fame-heat-editor">
          <button type="button" onClick={() => adjust(-1)} disabled={(value ?? 0) <= 0} aria-label={`Decrease ${label}`}>
            <MinusIcon weight="bold" />
          </button>
          <span className="fame-heat-value" style={shownColor ? { color: shownColor } : undefined}>
            {icon}
            {shownValue}
          </span>
          <button type="button" onClick={() => adjust(1)} aria-label={`Increase ${label}`}>
            <PlusIcon weight="bold" />
          </button>
          <button type="button" className="fame-heat-edit-btn" onClick={startEditing} aria-label={`Edit ${label}`}>
            <PencilSimpleIcon weight="bold" />
          </button>
        </div>
      )}
      {sliderMax ? (
        <input
          type="range"
          className="fame-heat-slider"
          style={sliderTrack ? { background: sliderTrack } : undefined}
          min={0}
          max={sliderMax}
          step={Math.max(1, Math.round(sliderMax / 500))}
          value={Math.min(sliding ?? value ?? 0, sliderMax)}
          aria-label={`Set ${label}`}
          onChange={(e) => setSliding(Number(e.target.value))}
          onPointerUp={commitSlide}
          onKeyUp={commitSlide}
          onBlur={commitSlide}
        />
      ) : null}
    </div>
  );
}
