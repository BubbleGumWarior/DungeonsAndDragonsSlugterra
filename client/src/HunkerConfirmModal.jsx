import { BandaidsIcon } from "@phosphor-icons/react";
import { hunkerGritCap } from "./combatSkills.js";
import "./SlugManagement.css";
import "./SlugActionModal.css";

// Patch Up dumps *all* remaining AP into the heal -- a flat max(1, CON mod)
// Grit per AP, no roll. Anyone with more than 1 AP left gets this confirm first
// so a stray click doesn't quietly burn their whole turn -- see CombatPage's
// runAction.
export default function HunkerConfirmModal({ ap, conMod = 0, currentGrit = 0, maxGrit = 0, onConfirm, onClose }) {
  const perAp = Math.max(1, conMod);
  const cap = hunkerGritCap(maxGrit);
  const heal = Math.max(0, Math.min(ap * perAp, cap - currentGrit));
  const capped = ap * perAp > heal;

  return (
    <div className="slug-modal-backdrop" onClick={onClose}>
      <div className="slug-modal slug-action-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Patch Up</h2>
        <p className="slug-action-modal-hint">
          This spends <strong>all {ap} remaining AP</strong> and ends your turn. You recover
          {" "}{perAp} Grit per AP spent -- <strong>{heal} Grit</strong>
          {capped ? ", the most Patch Up can heal (50% of max Grit)." : "."}
        </p>
        <div className="slug-action-grid">
          <button type="button" className="slug-action-item" onClick={onConfirm}>
            <span className="slug-action-item-icon">
              <BandaidsIcon weight="duotone" />
            </span>
            <span className="slug-action-item-label">Patch Up ({ap} AP)</span>
          </button>
        </div>
        <button type="button" className="slug-form-cancel slug-action-modal-close" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
