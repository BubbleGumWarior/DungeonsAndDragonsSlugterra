import { useState } from "react";
import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import ImageCropper from "./ImageCropper.jsx";
import EnergyPips from "./EnergyPips.jsx";
import {
  SLUG_TYPES,
  LOYALTY_TIER_LABELS,
  CLASH_POWER_MIN,
  CLASH_POWER_MAX,
  CLASH_DEFENSE_MIN,
  CLASH_DEFENSE_MAX,
  AP_COST_MIN,
  AP_COST_MAX,
  ENERGY_PIPS_MIN,
  ENERGY_PIPS_MAX,
  LOYALTY_TIER_MIN,
  LOYALTY_TIER_MAX,
  defaultSlugFields,
} from "./slugData.js";
import "./SlugForm.css";

function Stepper({ label, value, min, max, onChange, formatValue }) {
  return (
    <div className="slug-form-stepper">
      <label>{label}</label>
      <div className="slug-form-stepper-control">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
          <MinusIcon weight="bold" />
        </button>
        <span>{formatValue ? formatValue(value) : value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
          <PlusIcon weight="bold" />
        </button>
      </div>
    </div>
  );
}

export default function SlugForm({ mode, initialValues, players, slugId, onSubmit, onCancel, submitLabel }) {
  const { token } = useAuth();
  const [fields, setFields] = useState(() => ({ ...defaultSlugFields(), ...initialValues }));
  const [energyPips, setEnergyPips] = useState(() => initialValues?.energyPips ?? []);
  const [selectedPlayerId, setSelectedPlayerId] = useState(players?.[0]?.id ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function update(key, value) {
    setFields((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "maxEnergyPips" && mode === "instance" && value !== prev.maxEnergyPips) {
        setEnergyPips(Array(value).fill(true));
      }
      return next;
    });
  }

  async function toggleEnergyPip(index) {
    const nextPips = energyPips.map((v, i) => (i === index ? !v : v));
    setEnergyPips(nextPips);
    if (mode === "instance" && slugId) {
      await fetch(`/api/slugs/${slugId}/energy`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ energyPips: nextPips }),
      }).catch(() => {});
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload = { ...fields };
      if (mode === "assign") {
        payload.userId = selectedPlayerId;
        payload.templateId = initialValues?.templateId ?? null;
      }
      await onSubmit(payload);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = fields.name.trim().length > 0 && (mode !== "assign" || selectedPlayerId);

  return (
    <form className="slug-form" onSubmit={handleSubmit}>
      <div className="slug-form-images">
        <div className="slug-form-image-field">
          <label>Protoform Image</label>
          <ImageCropper value={fields.protoformImage} onChange={(v) => update("protoformImage", v)} shape="portrait" />
        </div>
        <div className="slug-form-image-field">
          <label>Velocity Image</label>
          <ImageCropper value={fields.velocityImage} onChange={(v) => update("velocityImage", v)} shape="landscape" />
        </div>
      </div>

      <div className="slug-form-field">
        <label htmlFor="slug-form-name">Name</label>
        <input
          id="slug-form-name"
          type="text"
          maxLength={40}
          value={fields.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </div>

      <div className="slug-form-field">
        <label htmlFor="slug-form-type">Type</label>
        <select id="slug-form-type" value={fields.type} onChange={(e) => update("type", e.target.value)}>
          {SLUG_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.key}
            </option>
          ))}
        </select>
      </div>

      <div className="slug-form-steppers">
        <Stepper
          label="Clash Power"
          value={fields.clashPower}
          min={CLASH_POWER_MIN}
          max={CLASH_POWER_MAX}
          onChange={(v) => update("clashPower", v)}
        />
        <Stepper
          label="Clash Defense"
          value={fields.clashDefense}
          min={CLASH_DEFENSE_MIN}
          max={CLASH_DEFENSE_MAX}
          onChange={(v) => update("clashDefense", v)}
        />
        <Stepper
          label="AP Cost"
          value={fields.apCost}
          min={AP_COST_MIN}
          max={AP_COST_MAX}
          onChange={(v) => update("apCost", v)}
        />
        <Stepper
          label="Max Energy Pips"
          value={fields.maxEnergyPips}
          min={ENERGY_PIPS_MIN}
          max={ENERGY_PIPS_MAX}
          onChange={(v) => update("maxEnergyPips", v)}
        />
        <Stepper
          label="Loyalty Tier"
          value={fields.loyaltyTier}
          min={LOYALTY_TIER_MIN}
          max={LOYALTY_TIER_MAX}
          onChange={(v) => update("loyaltyTier", v)}
          formatValue={(v) => LOYALTY_TIER_LABELS[v]}
        />
      </div>

      {mode === "instance" && (
        <div className="slug-form-field">
          <label>Current Energy</label>
          <EnergyPips size="lg" pips={energyPips} editable onToggle={toggleEnergyPip} />
        </div>
      )}

      <div className="slug-form-field slug-form-checkboxes">
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.breaksWalls)}
            onChange={(e) => update("breaksWalls", e.target.checked)}
          />
          Breaks walls (explosive/heavy hits punch through terrain)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.causesKnockback)}
            onChange={(e) => update("causesKnockback", e.target.checked)}
          />
          Causes knockback (doubles Metal/Earth's built-in shove, or gives any other type a short one)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.wallMaker)}
            onChange={(e) => update("wallMaker", e.target.checked)}
          />
          Wall maker (can raise a barrier on the field, e.g. an ice or crystal wall)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.bridgeMaker)}
            onChange={(e) => update("bridgeMaker", e.target.checked)}
          />
          Bridge maker (can create a crossable path, e.g. an ice bridge or vine swing)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.aoeBlast)}
            onChange={(e) => update("aoeBlast", e.target.checked)}
          />
          AOE blast (also hits every other combatant near the impact point, at full effect)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.hazardMaker)}
            onChange={(e) => update("hazardMaker", e.target.checked)}
          />
          Hazard maker (leaves a damaging patch of terrain wherever it lands, e.g. a burning pool or acid cloud)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.causesBlind)}
            onChange={(e) => update("causesBlind", e.target.checked)}
          />
          Causes blind (gives a type without a blind trait Light's disadvantage-on-next-attack effect)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.causesSnare)}
            onChange={(e) => update("causesSnare", e.target.checked)}
          />
          Causes snare (gives a type without a snare trait Plant's can't-Move-for-2-turns effect)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.causesShock)}
            onChange={(e) => update("causesShock", e.target.checked)}
          />
          Causes shock (a stronger stun -- the target's entire next turn is skipped, not just 1 AP)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.causesJam)}
            onChange={(e) => update("causesJam", e.target.checked)}
          />
          Causes jam (fries the target's blaster on a hit or miss -- their next shot automatically misfires)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.piercesWalls)}
            onChange={(e) => update("piercesWalls", e.target.checked)}
          />
          Pierces walls (an Attack breaks through the first wall in its path instead of being blocked -- Bladier)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.causesChain)}
            onChange={(e) => update("causesChain", e.target.checked)}
          />
          Causes chain (generalizes Electricity's uncounterable half-power arc to any type)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.ricochets)}
            onChange={(e) => update("ricochets", e.target.checked)}
          />
          Ricochets (a landed hit bounces on to a second target, with their own full counter-clash chance)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.ultraFast)}
            onChange={(e) => update("ultraFast", e.target.checked)}
          />
          Ultra fast (shrinks the counter window -- and speeds up the bolt itself -- way down)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.causesInvisible)}
            onChange={(e) => update("causesInvisible", e.target.checked)}
          />
          Causes invisible (self/ally-targeted -- hides the token from other players for 1 turn)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.causesFear)}
            onChange={(e) => update("causesFear", e.target.checked)}
          />
          Causes fear (the target's entire next turn is spent fleeing away from the shooter)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.causesConfusion)}
            onChange={(e) => update("causesConfusion", e.target.checked)}
          />
          Causes confusion (the target's own shots risk firing a full 180 off target for a few turns)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.trailWall)}
            onChange={(e) => update("trailWall", e.target.checked)}
          />
          Trail wall (leaves a wall of fire along the exact path the shot traveled)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.clashTripled)}
            onChange={(e) => update("clashTripled", e.target.checked)}
          />
          Clash tripled (this slug's own power/defense triple specifically while it's in a clash)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.coneBlast)}
            onChange={(e) => update("coneBlast", e.target.checked)}
          />
          Cone blast (travels to its target as a normal hit, then a cone of spikes beyond it deals reduced damage)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.spawnsPods)}
            onChange={(e) => update("spawnsPods", e.target.checked)}
          />
          Spawns pods (scatters 3 permanent timed pods that periodically fire a damaging line)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.mirageDecoy)}
            onChange={(e) => update("mirageDecoy", e.target.checked)}
          />
          Mirage decoy (self-targeted, spawns 2 decoys that mimic the owner until hit)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.starWall)}
            onChange={(e) => update("starWall", e.target.checked)}
          />
          Star wall (forms a 5-point damaging wall burst on impact that then persists as normal walls)
        </label>
        <label className="slug-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(fields.anchorZone)}
            onChange={(e) => update("anchorZone", e.target.checked)}
          />
          Anchor zone (creates a zone that suppresses knockback and wall-breaking inside it)
        </label>
      </div>

      <div className="slug-form-field">
        <label htmlFor="slug-form-protoform-utility">Protoform Utility</label>
        <textarea
          id="slug-form-protoform-utility"
          maxLength={500}
          value={fields.protoformUtility}
          onChange={(e) => update("protoformUtility", e.target.value)}
          placeholder="The non-combat skill or benefit this slug provides while dormant."
        />
      </div>

      <div className="slug-form-field">
        <label htmlFor="slug-form-velocity-ability">Velocity Ability</label>
        <textarea
          id="slug-form-velocity-ability"
          maxLength={500}
          value={fields.velocityAbility}
          onChange={(e) => update("velocityAbility", e.target.value)}
          placeholder="The transformation effect when this slug reaches full velocity."
        />
      </div>

      {error && <div className="slug-form-error">{error}</div>}

      <div className="slug-form-actions">
        {mode === "assign" && (
          <div className="slug-form-assign-field">
            <label htmlFor="slug-form-player">Assign To</label>
            <select
              id="slug-form-player"
              value={selectedPlayerId ?? ""}
              onChange={(e) => setSelectedPlayerId(Number(e.target.value))}
            >
              {(players || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.username}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="slug-form-actions-buttons">
          {onCancel && (
            <button type="button" className="slug-form-cancel" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="slug-form-submit" disabled={!canSubmit || submitting}>
            {submitting ? "Saving..." : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
