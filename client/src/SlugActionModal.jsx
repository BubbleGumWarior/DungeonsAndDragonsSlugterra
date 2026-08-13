import { TargetIcon, HammerIcon, WallIcon, BridgeIcon } from "@phosphor-icons/react";
import "./SlugManagement.css";
import "./SlugActionModal.css";

const ACTIONS = [
  { type: "attack", label: "Attack a Slinger", icon: TargetIcon, always: true },
  { type: "break-wall", label: "Break a Wall", icon: HammerIcon, flag: "breaksWalls" },
  { type: "make-wall", label: "Make a Wall", icon: WallIcon, flag: "wallMaker" },
  { type: "build-bridge", label: "Build a Bridge", icon: BridgeIcon, flag: "bridgeMaker" },
];

export default function SlugActionModal({ slug, onPick, onClose }) {
  if (!slug) return null;

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
        <button type="button" className="slug-form-cancel slug-action-modal-close" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
