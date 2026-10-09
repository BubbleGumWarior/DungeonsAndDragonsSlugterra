import { useState } from "react";
import { TargetIcon, HammerIcon, WallIcon, BridgeIcon, SparkleIcon, GitMergeIcon } from "@phosphor-icons/react";
import { typeColor } from "./slugData.js";
import { canJoinDualShot, dualShotPairError, dualPreview } from "./dualShot.js";
import "./SlugManagement.css";
import "./SlugActionModal.css";

const ACTIONS = [
  { type: "attack", label: "Attack a Slinger", icon: TargetIcon, always: true },
  { type: "break-wall", label: "Break a Wall", icon: HammerIcon, flag: "breaksWalls" },
  { type: "make-wall", label: "Make a Wall", icon: WallIcon, flag: "wallMaker" },
  { type: "build-bridge", label: "Build a Bridge", icon: BridgeIcon, flag: "bridgeMaker" },
];

// Mirrors server/src/combatRules.js's MEGA_MORPH_* -- keep the numbers in sync.
export const MEGA_MORPH_MIN_SPEED = 165;
export const MEGA_MORPH_PIP_COST = 3;

const livePips = (s) => (Array.isArray(s.energyPips) ? s.energyPips.filter(Boolean).length : 0);

// Why a slug can't be used right now (returned to hand, chambered, charged), or null.
function notReadyReason(s) {
  if ((s.cooldownTurnsLeft || 0) > 0) return "Not back in hand yet";
  if (s.loaded === false) return "Not loaded";
  if (livePips(s) === 0) return "Out of energy";
  return null;
}

// `megaBlockedReason` is a string when a Mega Morph can't be fired right now
// (weapon too short-ranged, too few pips), or null when it's available.
// `dual` is null when the slug can't dual shot at all, else
// { partners: the other slugs loaded in the same weapon, rangeReason: why the
// weapon is too short for a Mega Morph (or null) }. The server re-validates
// all of it.
export default function SlugActionModal({ slug, megaBlockedReason = null, dual = null, onPick, onClose }) {
  const [step, setStep] = useState("actions"); // "actions" | "dual"
  const [partnerId, setPartnerId] = useState(null);
  const [dualMega, setDualMega] = useState(false);
  if (!slug) return null;

  const showMega = Boolean(slug.megaMorphAllowed);
  const megaEnabled = showMega && !megaBlockedReason;
  const showDual = Boolean(dual) && canJoinDualShot(slug);

  if (step === "dual") {
    const partners = dual?.partners ?? [];
    const partner = partners.find((p) => p.id === partnerId) ?? null;
    const preview = partner ? dualPreview(slug, partner, { mega: dualMega }) : null;

    // A dual Mega Morph needs both slugs allowed, 3 pips each, and a long enough weapon.
    let megaReason = null;
    if (partner) {
      if (!slug.megaMorphAllowed || !partner.megaMorphAllowed) megaReason = "Both slugs must be able to Mega Morph.";
      else if (dual.rangeReason) megaReason = dual.rangeReason;
      else if (livePips(slug) < MEGA_MORPH_PIP_COST || livePips(partner) < MEGA_MORPH_PIP_COST) {
        megaReason = `Each slug needs ${MEGA_MORPH_PIP_COST} energy pips.`;
      }
    }
    const canMega = partner && !megaReason;

    return (
      <div className="slug-modal-backdrop" onClick={onClose}>
        <div className="slug-modal slug-action-modal" onClick={(e) => e.stopPropagation()}>
          <h2>Dual Shot</h2>
          <p className="slug-action-modal-hint">
            Fire {slug.name} together with a second slug from the same weapon. Their elements combine.
          </p>

          <div className="slug-dual-partners">
            {partners.map((p) => {
              const reason = dualShotPairError(slug, p) || notReadyReason(p);
              return (
                <button
                  type="button"
                  key={p.id}
                  className={`slug-dual-partner ${p.id === partnerId ? "slug-dual-partner--picked" : ""}`}
                  style={{ "--type-color": typeColor(p.type) }}
                  disabled={Boolean(reason)}
                  title={reason || undefined}
                  onClick={() => setPartnerId(p.id)}
                >
                  <span className="slug-dual-partner-name">{p.name}</span>
                  <span className="slug-dual-partner-type">{p.type}</span>
                  <span className="slug-dual-partner-stats">PWR {p.clashPower}</span>
                  {reason && <span className="slug-dual-partner-note">{reason}</span>}
                </button>
              );
            })}
            {partners.length === 0 && <p className="slug-action-modal-hint">No other slug is loaded in this weapon.</p>}
          </div>

          {preview && (
            <div className="slug-dual-preview">
              <div className="slug-dual-preview-head">
                <GitMergeIcon weight="bold" />
                <span className="slug-dual-preview-combo">{preview.comboName || "No named combo"}</span>
                <span className="slug-dual-preview-pair">
                  {slug.type} + {partner.type}
                </span>
              </div>
              <p className="slug-dual-preview-summary">{preview.comboSummary}</p>
              <div className="slug-dual-preview-stats">
                <span>
                  <strong>{preview.power}</strong> PWR
                </span>
                <span>
                  <strong>{preview.defense}</strong> DEF
                </span>
                <span>
                  <strong>{preview.apCost}</strong> AP
                </span>
                <span>
                  <strong>{dualMega ? MEGA_MORPH_PIP_COST : 1}</strong> pip{dualMega ? "s" : ""} each
                </span>
              </div>

              {(slug.megaMorphAllowed || partner.megaMorphAllowed) && (
                <label className={`slug-dual-mega ${canMega ? "" : "slug-dual-mega--disabled"}`}>
                  <input
                    type="checkbox"
                    disabled={!canMega}
                    checked={Boolean(dualMega && canMega)}
                    onChange={(e) => setDualMega(e.target.checked)}
                  />
                  <span>
                    <strong>Mega Morph the dual shot</strong> -- double power and speed, {MEGA_MORPH_PIP_COST} pips from each slug.
                    {megaReason && <em> {megaReason}</em>}
                  </span>
                </label>
              )}
            </div>
          )}

          <div className="slug-dual-actions">
            <button type="button" className="slug-form-cancel" onClick={() => setStep("actions")}>
              Back
            </button>
            <button
              type="button"
              className="slug-form-submit slug-dual-fire"
              disabled={!partner}
              onClick={() => partner && onPick(slug, "dual-shot", { partnerSlug: partner, megaMorph: Boolean(dualMega && canMega) })}
            >
              Fire Dual Shot
            </button>
          </div>
        </div>
      </div>
    );
  }

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

        {showDual && (
          <button type="button" className="slug-action-dual" onClick={() => setStep("dual")}>
            <span className="slug-action-dual-head">
              <GitMergeIcon weight="bold" className="slug-action-dual-icon" />
              <span className="slug-action-dual-title">Dual Shot</span>
              <span className="slug-action-dual-tag">Attack a Slinger</span>
            </span>
            <span className="slug-action-dual-desc">
              Fire this slug and a second one from the same weapon as a single bolt. Their <strong>powers add up</strong> and
              their <strong>elements combine</strong> into a new effect. Both slugs need <strong>loyalty tier 3+</strong> and a
              different element, cost the higher AP <strong>+1</strong>, and both go on cooldown -- and both are lost if it
              loses a clash.
            </span>
          </button>
        )}

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
              <strong>{MEGA_MORPH_PIP_COST} energy pips</strong> instead of one, and needs a weapon with a speed of{" "}
              <strong>{MEGA_MORPH_MIN_SPEED}+</strong>.
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
