import { useEffect, useMemo, useRef, useState } from "react";
import {
  TargetIcon,
  HammerIcon,
  WallIcon,
  BridgeIcon,
  SparkleIcon,
  GitMergeIcon,
  LassoIcon,
  PlantIcon,
  CaretLeftIcon,
  LightningIcon,
  LockSimpleIcon,
} from "@phosphor-icons/react";
import { typeColor } from "./slugData.js";
import { useShowLocked } from "./useShowLocked.js";
import { canJoinDualShot, dualShotPairError, dualPreview } from "./dualShot.js";
import "./SlugManagement.css";
import "./SlugActionModal.css";

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

// Terrain actions: only the ones the slug actually has a flag for are offered,
// so the list is as long as the slug is capable -- never a wall of greyed-out tiles.
const TERRAIN_ACTIONS = [
  {
    type: "break-wall",
    flag: "breaksWalls",
    label: "Break a Wall",
    icon: HammerIcon,
    summary: "Blast a gap in the first wall (or bridge) in the line of fire.",
    detail:
      "Shoot at a wall and the slug breaks the first one it hits. A bigger Clash Power takes a bigger bite out of it; the rest of the wall stays up. A bridge in the way collapses outright.",
  },
  {
    type: "make-wall",
    flag: "wallMaker",
    label: "Make a Wall",
    icon: WallIcon,
    summary: "Raise a wall where the shot lands. You choose which way it faces.",
    detail:
      "After you pick this, a ghost of the wall follows your cursor on the map. Rotate it with Q / E (or R for a quarter turn) before you click to fire. The wall grows with the slug's loyalty tier.",
    steerable: true,
  },
  {
    type: "build-bridge",
    flag: "bridgeMaker",
    label: "Build a Bridge",
    icon: BridgeIcon,
    summary: "Lay a bridge over water or hazards. You choose which way it runs.",
    detail:
      "After you pick this, a ghost of the bridge follows your cursor on the map. Rotate it with Q / E (or R for a quarter turn) before you click to fire. Anyone crossing it is untouched by the water and hazards beneath.",
    steerable: true,
  },
  {
    type: "grapple",
    flag: "grapple",
    label: "Grapple to a Spot",
    icon: LassoIcon,
    summary: "Hook a wall or bridge and reel yourself across to it.",
    detail: "Click a wall or bridge in range -- the line hooks it and reels you across. To yank an enemy toward you instead, use a standard shot.",
  },
  {
    type: "summon-plant",
    flag: "summonsPlant",
    label: "Summon a Plant",
    icon: PlantIcon,
    summary: "Plant a carnivorous bloom that bites anything that comes close.",
    detail:
      "Click the ground in range. The bloom bites enemies already in reach, then anyone who moves into, out of or through its reach, and can be shot down.",
  },
];

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
  const [lookedAt, setLookedAt] = useState("attack"); // the option whose rules the detail strip shows
  const [showLocked, toggleLocked] = useShowLocked("fireModalShowLocked");
  const shellRef = useRef(null);

  const showMega = Boolean(slug?.megaMorphAllowed);
  const megaEnabled = showMega && !megaBlockedReason;
  const showDual = Boolean(dual) && Boolean(slug) && canJoinDualShot(slug);

  // Every option the slug can offer, in the order the number keys follow.
  const options = useMemo(() => {
    if (!slug) return [];
    const slinger = [
      {
        id: "attack",
        group: "slinger",
        label: "Standard Shot",
        icon: TargetIcon,
        summary: "Aim at a slinger and fire.",
        detail: "A normal attack on a slinger. They get a window to counter before it lands.",
        cost: null,
      },
    ];
    if (showMega) {
      slinger.push({
        id: "mega-morph",
        group: "slinger",
        label: "Mega Morph",
        icon: SparkleIcon,
        accent: "mega",
        summary: "Full power: double speed, double clash power.",
        detail: `The slug unleashes everything. After its wind-up it flies at double speed, halving the target's reaction window. Its clash power is doubled, on top of any tripling from abilities like Emberblade or Meduslug. It burns ${MEGA_MORPH_PIP_COST} energy pips instead of one, and needs a weapon with a speed of ${MEGA_MORPH_MIN_SPEED}+.`,
        cost: `${MEGA_MORPH_PIP_COST} pips`,
        blocked: megaBlockedReason,
        disabled: !megaEnabled,
      });
    }
    if (showDual) {
      slinger.push({
        id: "dual-shot",
        group: "slinger",
        label: "Dual Shot",
        icon: GitMergeIcon,
        accent: "dual",
        summary: "Fire two slugs from one weapon as a single bolt.",
        detail:
          "Fire this slug and a second one from the same weapon together. Their powers add up and their elements combine into a new effect. Both slugs need loyalty tier 3+ and a different element, cost the higher AP +1, and both go on cooldown -- and both are lost if it loses a clash.",
        cost: "+1 AP",
        opensStep: true,
      });
    }
    // Terrain actions the slug doesn't have are kept as locked rows, listed only on request.
    const terrain = TERRAIN_ACTIONS.map((a) => {
      const has = Boolean(slug[a.flag]);
      return { ...a, id: a.type, group: "terrain", ...(has ? {} : { disabled: true, blocked: `${slug.name} can't do this` }) };
    });
    return [...slinger, ...terrain];
  }, [slug, showMega, megaEnabled, megaBlockedReason, showDual]);

  // Locked options (blocked Mega Morph, actions the slug lacks) stay out of sight unless asked for;
  // the number keys only ever count the options that can actually be fired.
  const lockedCount = options.filter((o) => o.disabled).length;
  const visible = useMemo(() => (showLocked ? options : options.filter((o) => !o.disabled)), [options, showLocked]);
  const keyed = useMemo(() => visible.filter((o) => !o.disabled), [visible]);

  function choose(option) {
    if (!option || option.disabled) return;
    if (option.opensStep) {
      setStep("dual");
      return;
    }
    onPick(slug, option.id);
  }

  // Number keys fire the Nth enabled option; Esc backs out one level.
  useEffect(() => {
    if (!slug) return undefined;
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (step === "dual") setStep("actions");
        else onClose?.();
        return;
      }
      if (step !== "actions" || !/^[1-9]$/.test(e.key)) return;
      const option = keyed[Number(e.key) - 1];
      if (option) {
        e.preventDefault();
        choose(option);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // choose() only closes over props/state that are already in the dep list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, step, keyed, onClose, onPick]);

  // Land focus on the first option so Enter fires a standard shot.
  useEffect(() => {
    if (step !== "actions") return;
    shellRef.current?.querySelector(".fire-opt:not(:disabled)")?.focus({ preventScroll: true });
  }, [step, slug?.id]);

  if (!slug) return null;

  const color = typeColor(slug.type);
  const pips = Array.isArray(slug.energyPips) ? slug.energyPips : [];
  const header = (
    <div className="fire-head" style={{ "--type-color": color }}>
      <div className="fire-head-main">
        <h2 className="fire-title">{slug.name}</h2>
        <span className="fire-type">{slug.type}</span>
      </div>
      <div className="fire-stats" aria-label="Slug stats">
        {slug.clashPower != null && (
          <span className="fire-stat">
            <strong>{slug.clashPower}</strong> PWR
          </span>
        )}
        {slug.apCost != null && (
          <span className="fire-stat">
            <LightningIcon weight="fill" aria-hidden="true" />
            <strong>{slug.apCost}</strong> AP
          </span>
        )}
        {pips.length > 0 && (
          <span className="fire-stat fire-pips" title={`${livePips(slug)} of ${pips.length} energy pips`}>
            {pips.map((on, i) => (
              <i key={i} className={on ? "fire-pip fire-pip--on" : "fire-pip"} />
            ))}
          </span>
        )}
      </div>
    </div>
  );

  const lockedToggle = (count) => (
    <button type="button" className="fire-locked-toggle" aria-pressed={showLocked} onClick={toggleLocked}>
      <LockSimpleIcon weight="bold" aria-hidden="true" />
      {showLocked ? "Hide locked" : `Show locked (${count})`}
    </button>
  );

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
    const lockedPartners = partners.filter((p) => dualShotPairError(slug, p) || notReadyReason(p)).length;

    return (
      <div className="slug-modal-backdrop" onClick={onClose}>
        <div
          ref={shellRef}
          className="slug-modal slug-action-modal fire-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`Dual shot with ${slug.name}`}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="fire-back" onClick={() => setStep("actions")}>
            <CaretLeftIcon weight="bold" aria-hidden="true" /> Back
          </button>
          {header}
          <p className="fire-group-label">Pick a partner from the same weapon</p>

          <div className="slug-dual-partners">
            {partners.map((p) => {
              const reason = dualShotPairError(slug, p) || notReadyReason(p);
              if (reason && !showLocked) return null;
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
            {partners.length > 0 && !showLocked && lockedPartners === partners.length && (
              <p className="slug-action-modal-hint">No partner is ready to fire right now.</p>
            )}
          </div>
          {lockedPartners > 0 && lockedToggle(lockedPartners)}

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
            <button type="button" className="slug-form-cancel" onClick={onClose}>
              Cancel
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

  const slingerOptions = visible.filter((o) => o.group === "slinger");
  const terrainOptions = visible.filter((o) => o.group === "terrain");
  const looked = visible.find((o) => o.id === lookedAt) ?? visible[0];

  function renderOption(o) {
    const Icon = o.icon;
    const key = keyed.indexOf(o) + 1; // 0 = locked, no shortcut
    return (
      <li key={o.id}>
        <button
          type="button"
          className={`fire-opt ${o.accent ? `fire-opt--${o.accent}` : ""}`}
          disabled={o.disabled}
          aria-keyshortcuts={key > 0 && key <= 9 ? String(key) : undefined}
          onMouseEnter={() => setLookedAt(o.id)}
          onFocus={() => setLookedAt(o.id)}
          onClick={() => choose(o)}
        >
          <span className="fire-opt-icon">
            <Icon weight={o.disabled ? "regular" : "duotone"} aria-hidden="true" />
          </span>
          <span className="fire-opt-text">
            <span className="fire-opt-label">
              {o.label}
              {o.steerable && <span className="fire-opt-tag">Rotatable</span>}
            </span>
            <span className="fire-opt-summary">{o.blocked || o.summary}</span>
          </span>
          {o.cost && <span className="fire-opt-cost">{o.cost}</span>}
          {key > 0 && key <= 9 && <kbd className="fire-opt-key">{key}</kbd>}
          {o.disabled && <LockSimpleIcon className="fire-opt-lock" weight="bold" aria-hidden="true" />}
        </button>
      </li>
    );
  }

  return (
    <div className="slug-modal-backdrop" onClick={onClose}>
      <div
        ref={shellRef}
        className="slug-modal slug-action-modal fire-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Fire ${slug.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        {header}

        <section aria-labelledby="fire-grp-slinger">
          <p className="fire-group-label" id="fire-grp-slinger">
            At a slinger
          </p>
          <ul className="fire-list">{slingerOptions.map(renderOption)}</ul>
        </section>

        {terrainOptions.length > 0 && (
          <section aria-labelledby="fire-grp-terrain">
            <p className="fire-group-label" id="fire-grp-terrain">
              At the field
            </p>
            <ul className="fire-list">{terrainOptions.map(renderOption)}</ul>
          </section>
        )}

        <p className="fire-detail" aria-live="polite">
          {looked?.detail}
        </p>

        <div className="fire-foot">
          <span className="fire-foot-hint">
            <kbd>1</kbd>-<kbd>{Math.min(keyed.length, 9)}</kbd> to fire · <kbd>Esc</kbd> to cancel
          </span>
          {lockedCount > 0 && lockedToggle(lockedCount)}
          <button type="button" className="slug-form-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
