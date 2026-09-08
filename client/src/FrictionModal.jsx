import { HandGrabbingIcon, WavesIcon } from "@phosphor-icons/react";
import "./SlugManagement.css";
import "./SlugActionModal.css";

// Psi's friction_shift: which friction to apply to whoever this hits --
// always a debuff, no self-target buff reading here (unlike Perplexus's
// split pools). The server re-validates this choice and falls back to a
// random pick between the two if it's missing/invalid -- see dealHit's
// friction_shift block in routes/combat.js.
const EFFECTS = [
  { key: "harsh", label: "Harsh Friction (Rooted)", icon: HandGrabbingIcon },
  { key: "slippery", label: "Slippery (Ice Slip)", icon: WavesIcon },
];

export default function FrictionModal({ slug, onPick, onClose }) {
  if (!slug) return null;

  return (
    <div className="slug-modal-backdrop" onClick={onClose}>
      <div className="slug-modal slug-action-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{slug.name}</h2>
        <p className="slug-action-modal-hint">Crank the target's friction up or down -- which way?</p>
        <div className="slug-action-grid">
          {EFFECTS.map((e) => {
            const Icon = e.icon;
            return (
              <button type="button" key={e.key} className="slug-action-item" onClick={() => onPick(slug, e.key)}>
                <span className="slug-action-item-icon">
                  <Icon weight="duotone" />
                </span>
                <span className="slug-action-item-label">{e.label}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="slug-form-cancel slug-action-modal-close" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
