import { TargetIcon, HammerIcon, WallIcon, BridgeIcon, SparkleIcon } from "@phosphor-icons/react";
import "./SlugManagement.css";
import "./SlugActionModal.css";

const ACTIONS = [
  { type: "attack", label: "Attack a Slinger", icon: TargetIcon, always: true },
  { type: "break-wall", label: "Break a Wall", icon: HammerIcon, flag: "breaksWalls" },
  { type: "make-wall", label: "Make a Wall", icon: WallIcon, flag: "wallMaker" },
  { type: "build-bridge", label: "Build a Bridge", icon: BridgeIcon, flag: "bridgeMaker" },
];

// Mirrors server/src/combatRules.js's MEGA_MORPH_* -- keep the numbers in sync.
export const MEGA_MORPH_MIN_RANGE = 150;
export const MEGA_MORPH_PIP_COST = 3;

// `megaBlockedReason` is a string when a Mega Morph can't be fired right now
// (weapon too short-ranged, too few pips), or null when it's available. The
// server re-validates both.
export default function SlugActionModal({ slug, megaBlockedReason = null, onPick, onClose }) {
  if (!slug) return null;

  const showMega = Boolean(slug.megaMorphAllowed);
  const megaEnabled = showMega && !megaBlockedReason;

  return (
    <div className="slug-modal-backdrop" onClick={onClose}>
      <div className="slug-modal slug-action-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{slug.name}</h2>
        <p className="slug-action-modal-hint">What do you want to do with this slug?</p>
        <div className="slug-action-grid">
          {ACTIONS.map((a) => {
            const enabled = a.always || Boolean(slug[a.flag]);
            const Icon = a.icon;
            return (
              <button
                type="button"
                key={a.type}
                className={`slug-action-item ${enabled ? "" : "slug-action-item--disabled"}`}
                disabled={!enabled}
                title={enabled ? undefined : `${slug.name} can't do that`}
                onClick={() => enabled && onPick(slug, a.type)}
              >
                <span className="slug-action-item-icon">
                  <Icon weight={enabled ? "duotone" : "regular"} />
                </span>
                <span className="slug-action-item-label">{a.label}</span>
                {!enabled && <span className="slug-action-item-note">{slug.name} can't do this</span>}
              </button>
            );
          })}
        </div>

        {showMega && (
          <button
            type="button"
            className={`slug-action-mega ${megaEnabled ? "" : "slug-action-mega--disabled"}`}
            disabled={!megaEnabled}
            onClick={() => megaEnabled && onPick(slug, "mega-morph")}
          >
            <span className="slug-action-mega-head">
              <SparkleIcon weight="fill" className="slug-action-mega-icon" />
              <span className="slug-action-mega-title">Shoot Mega Morph</span>
              <span className="slug-action-mega-tag">Attack a Slinger</span>
            </span>
            <span className="slug-action-mega-desc">
              The slug unleashes its full power. After its wind-up it flies at <strong>double speed</strong>, halving the
              target's reaction window (stacking with Zeus-style ultra-fast slugs). Its <strong>clash power is doubled</strong>,
              on top of any tripling from abilities like Emberblade or Meduslug. It burns{" "}
              <strong>{MEGA_MORPH_PIP_COST} energy pips</strong> instead of one, and needs a weapon with a range of{" "}
              <strong>{MEGA_MORPH_MIN_RANGE}+</strong>.
            </span>
            {megaBlockedReason && <span className="slug-action-mega-blocked">{megaBlockedReason}</span>}
          </button>
        )}

        <button type="button" className="slug-form-cancel slug-action-modal-close" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
