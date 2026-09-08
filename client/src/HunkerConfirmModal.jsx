import { CampfireIcon } from "@phosphor-icons/react";
import "./SlugManagement.css";
import "./SlugActionModal.css";

// Hunker Down now dumps *all* remaining AP into the heal (one 1d4 + CON roll
// per AP). Anyone with more than 1 AP left gets this confirm first so a stray
// click doesn't quietly burn their whole turn -- see CombatPage's runAction.
export default function HunkerConfirmModal({ ap, conMod = 0, onConfirm, onClose }) {
  const min = Math.max(1, ap * (1 + conMod));
  const max = Math.max(1, ap * (4 + conMod));
  const conText = conMod === 0 ? "" : ` ${conMod > 0 ? "+" : "-"} ${Math.abs(conMod)}`;

  return (
    <div className="slug-modal-backdrop" onClick={onClose}>
      <div className="slug-modal slug-action-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Hunker Down</h2>
        <p className="slug-action-modal-hint">
          This spends <strong>all {ap} remaining AP</strong> and ends your turn. You recover
          {" "}1d4{conText} Grit per AP spent -- roughly <strong>{min}&ndash;{max} Grit</strong>.
        </p>
        <div className="slug-action-grid">
          <button type="button" className="slug-action-item" onClick={onConfirm}>
            <span className="slug-action-item-icon">
              <CampfireIcon weight="duotone" />
            </span>
            <span className="slug-action-item-label">Hunker down ({ap} AP)</span>
          </button>
        </div>
        <button type="button" className="slug-form-cancel slug-action-modal-close" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
