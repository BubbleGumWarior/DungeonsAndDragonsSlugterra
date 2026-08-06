import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { actionPoints, initiativeBonus, maxGrit } from "./characterData.js";
import "./CharacterVitals.css";

export default function CharacterVitals({ stats, currentGrit, editable = false, onChangeCurrentGrit }) {
  const grit = maxGrit(stats);
  const current = currentGrit ?? grit;
  const percent = grit > 0 ? Math.max(0, Math.min(100, (current / grit) * 100)) : 0;
  const initiative = initiativeBonus(stats);
  const ap = actionPoints(stats);

  function adjust(delta) {
    const next = Math.max(0, Math.min(grit, current + delta));
    if (next !== current) onChangeCurrentGrit?.(next);
  }

  return (
    <div className="vitals">
      <div className="vitals-grit">
        <div className="vitals-grit-label">
          <span>Current Grit</span>
          <span className="vitals-grit-value">{current} / {grit}</span>
        </div>
        <div className="vitals-grit-bar">
          <div className="vitals-grit-fill" style={{ transform: `scaleX(${percent / 100})` }} />
        </div>
        {editable && (
          <div className="vitals-grit-editor">
            <button type="button" onClick={() => adjust(-1)} disabled={current <= 0} aria-label="Decrease current Grit">
              <MinusIcon weight="bold" />
            </button>
            <span className="vitals-grit-editor-label">Edit Current Grit</span>
            <button type="button" onClick={() => adjust(1)} disabled={current >= grit} aria-label="Increase current Grit">
              <PlusIcon weight="bold" />
            </button>
          </div>
        )}
      </div>

      <div className="vitals-chips">
        <div className="vitals-chip">
          <span className="vitals-chip-value">{initiative}</span>
          <span className="vitals-chip-label">Initiative Bonus</span>
        </div>
        <div className="vitals-chip">
          <span className="vitals-chip-value">{ap}</span>
          <span className="vitals-chip-label">AP per Turn</span>
        </div>
      </div>
    </div>
  );
}
