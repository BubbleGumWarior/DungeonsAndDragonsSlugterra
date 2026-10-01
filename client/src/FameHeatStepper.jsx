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
export default function FameHeatStepper({ label, value, onChange, icon, valueColor }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

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
          <span className="fame-heat-value" style={valueColor ? { color: valueColor } : undefined}>
            {icon}
            {value ?? 0}
          </span>
          <button type="button" onClick={() => adjust(1)} aria-label={`Increase ${label}`}>
            <PlusIcon weight="bold" />
          </button>
          <button type="button" className="fame-heat-edit-btn" onClick={startEditing} aria-label={`Edit ${label}`}>
            <PencilSimpleIcon weight="bold" />
          </button>
        </div>
      )}
    </div>
  );
}
