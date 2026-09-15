import { CampfireIcon } from "@phosphor-icons/react";
import "./SlugManagement.css";
import "./SlugActionModal.css";

// Hunker Down dumps *all* remaining AP into the heal -- a flat max(1, CON mod)
// Grit per AP, no roll. Anyone with more than 1 AP left gets this confirm first
// so a stray click doesn't quietly burn their whole turn -- see CombatPage's
// runAction.
export default function HunkerConfirmModal({ ap, conMod = 0, onConfirm, onClose }) {
  const perAp = Math.max(1, conMod);
  const heal = Math.max(1, ap * perAp);

  return (
    <div className="slug-modal-backdrop" onClick={onClose}>
      <div className="slug-modal slug-action-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Hunker Down</h2>
        <p className="slug-action-modal-hint">
          This spends <strong>all {ap} remaining AP</strong> and ends your turn. You recover
          {" "}{perAp} Grit per AP spent -- <strong>{heal} Grit</strong>.
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
