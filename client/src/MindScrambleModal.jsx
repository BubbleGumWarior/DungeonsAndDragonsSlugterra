import { ArrowsLeftRightIcon, MoonIcon, HourglassIcon, LightningIcon, EyeIcon } from "@phosphor-icons/react";
import "./SlugManagement.css";
import "./SlugActionModal.css";

// Perplexus's mind_scramble: which effect to arm this shot with. The server
// re-validates against whichever pool actually applies once it knows the
// real target (enemy vs self) and silently falls back to a random pick from
// that pool if this choice doesn't match how the shot ends up being aimed --
// see dealHit's mind_scramble block in routes/combat.js. Picking here just
// states your intent before you've clicked a target.
const ENEMY_EFFECTS = [
  { key: "reverse", label: "Reverse Direction", icon: ArrowsLeftRightIcon },
  { key: "darkness", label: "Darkness", icon: MoonIcon },
  { key: "slow", label: "Slow Reaction", icon: HourglassIcon },
];

const SELF_EFFECTS = [
  { key: "enhance", label: "Enhance Reaction", icon: LightningIcon },
  { key: "vision", label: "Keen Vision", icon: EyeIcon },
];

function EffectGrid({ effects, slug, onPick }) {
  return (
    <div className="slug-action-grid">
      {effects.map((e) => {
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
  );
}

export default function MindScrambleModal({ slug, onPick, onClose }) {
  if (!slug) return null;

  return (
    <div className="slug-modal-backdrop" onClick={onClose}>
      <div className="slug-modal slug-action-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{slug.name}</h2>
        <p className="slug-action-modal-hint">
          Pick which effect to scramble into whoever this hits -- an enemy gets one of 3 debuffs, yourself gets one of 2 buffs.
        </p>
        <p className="slug-mind-scramble-group-label">If fired at an enemy</p>
        <EffectGrid effects={ENEMY_EFFECTS} slug={slug} onPick={onPick} />
        <p className="slug-mind-scramble-group-label">If fired at yourself</p>
        <EffectGrid effects={SELF_EFFECTS} slug={slug} onPick={onPick} />
        <button type="button" className="slug-form-cancel slug-action-modal-close" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
