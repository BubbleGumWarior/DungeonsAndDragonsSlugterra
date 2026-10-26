import { useState } from "react";
import { Link } from "react-router-dom";
import { BatteryChargingIcon, BowlFoodIcon, CircleDashedIcon, WarningIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { LOYALTY_TIER_LABELS, loyaltyTierColor } from "./slugData.js";
import {
  ENERGY_CELL_PIPS,
  FOOD_DRAIN_PER_REST,
  FOOD_MAX,
  KIBBLE_FOOD_MAX,
  KIBBLE_FOOD_MIN,
  foodState,
  kibbleFoodFor,
  kibbleNeeded,
} from "./careData.js";
import { characterSkillMod } from "./characterData.js";
import EnergyPips from "./EnergyPips.jsx";
import Hint from "./Hint.jsx";
import LoyaltyMeter from "./LoyaltyMeter.jsx";
import "./Panel.css";
import "./SlugCare.css";

// The one rule every food hover repeats, so a player always knows what is at
// stake before they let a meter run down.
export function FoodRules({ perScoop = KIBBLE_FOOD_MIN }) {
  return (
    <>
      <p>
        Every long rest drains <b>{FOOD_DRAIN_PER_REST}%</b> of a slug's food. In your hands one scoop of kibble
        restores <b>{perScoop}%</b>. A steadier Slug Handler stretches a scoop further, up to {KIBBLE_FOOD_MAX}%.
      </p>
      <p className="hint-warn">
        If the party sleeps while a slug is at 0%, it drops one loyalty level. A slug already at Wild leaves your
        inventory for good.
      </p>
    </>
  );
}

function EnergyRules() {
  return (
    <>
      <p>
        Slugs spend energy pips every time they are fired. A long rest recharges them all. An Energy Cell refills{" "}
        <b>{ENERGY_CELL_PIPS}</b> spent pips on one slug.
      </p>
      <p>Supplies can't be used while you are in a fight.</p>
    </>
  );
}

function consequence(slug, state) {
  if (state.key !== "starving") return null;
  return slug.loyaltyTier <= 0
    ? "Will leave you at the next long rest"
    : `Drops to ${LOYALTY_TIER_LABELS[slug.loyaltyTier - 1]} at the next long rest`;
}

// Per-slug upkeep: a food meter to keep above 0 and an energy row to top up.
// `kibble` and `energyCells` are the player's stock; `onSupplies` hands the
// server's new counts back up so the pack ledger stays in step.
export default function SlugCare({ slugs, character, kibble, energyCells, onSlugChange, onSupplies }) {
  const { token } = useAuth();
  const perScoop = kibbleFoodFor(characterSkillMod(character, "creatureHandling"));
  const [busy, setBusy] = useState(null); // "feed:<id>" | "charge:<id>"
  const [error, setError] = useState(null);

  async function call(tag, url, body, onDone) {
    setBusy(tag);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't work.");
      onSlugChange?.(data.slug);
      onDone(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const feed = (slug, fill) =>
    call(`feed:${slug.id}`, `/api/slugs/${slug.id}/feed`, fill ? { fill: true } : { count: 1 }, (d) =>
      onSupplies?.({ kibble: d.kibble })
    );
  const recharge = (slug) =>
    call(`charge:${slug.id}`, `/api/consumables/slugs/${slug.id}/recharge`, {}, (d) =>
      onSupplies?.({ energyCells: d.energyCells })
    );

  const hungry = slugs.filter((s) => (s.food ?? FOOD_MAX) < FOOD_MAX).length;

  return (
    <section className="slug-care" aria-labelledby="slug-care-title">
      <div className="slug-care-head">
        <div className="slug-care-heading">
          <h2 id="slug-care-title">Slug Care</h2>
          <p>
            {slugs.length === 0
              ? "You have no slugs to look after yet."
              : hungry === 0
                ? "Every slug is full."
                : `${hungry} ${hungry === 1 ? "slug has" : "slugs have"} room for a meal.`}
          </p>
        </div>
        {(kibble === 0 || energyCells === 0) && (
          <Link to="/market" className="slug-care-buy">
            Restock at the Market
          </Link>
        )}
      </div>

      {error && <p className="panel-error">{error}</p>}

      <ul className="slug-care-list">
        {slugs.map((slug) => {
          const food = slug.food ?? FOOD_MAX;
          const state = foodState(food);
          const needed = kibbleNeeded(food, perScoop);
          const full = needed === 0;
          const warning = consequence(slug, state);
          const pips = Array.isArray(slug.energyPips) ? slug.energyPips : [];
          const spent = pips.filter((p) => !p).length;
          const noKibble = !kibble;
          const noCells = !energyCells;
          const feeding = busy === `feed:${slug.id}`;
          const charging = busy === `charge:${slug.id}`;
          return (
            <li key={slug.id} className={`slug-care-row slug-care-row--${state.tone}`}>
              <div className="slug-care-id">
                <span className="slug-care-thumb">
                  {slug.protoformImage ? (
                    <img src={slug.protoformImage} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <CircleDashedIcon weight="duotone" />
                  )}
                </span>
                <div className="slug-care-who">
                  <span className="slug-care-name">{slug.name}</span>
                  <span className="slug-care-loyalty" style={{ color: loyaltyTierColor(slug.loyaltyTier) }}>
                    {LOYALTY_TIER_LABELS[slug.loyaltyTier]}
                  </span>
                  {typeof slug.loyaltyFill === "number" && (
                    <span className="slug-care-loyalty-meter">
                      <LoyaltyMeter fill={slug.loyaltyFill} tier={slug.loyaltyTier} />
                    </span>
                  )}
                </div>
              </div>

              <div className="slug-care-lanes">
                <div className="slug-care-lane">
                  <span className="slug-care-lane-label">
                    <BowlFoodIcon weight="bold" />
                    Food
                  </span>
                  <Hint align="start" title={`${slug.name}'s food`} tip={<FoodRules perScoop={perScoop} />} className="slug-care-lane-hint">
                    <div className="slug-care-food">
                      <div
                        className="slug-care-meter"
                        role="meter"
                        aria-label={`${slug.name}'s food`}
                        aria-valuemin={0}
                        aria-valuemax={FOOD_MAX}
                        aria-valuenow={food}
                        aria-valuetext={`${food}% — ${state.label}`}
                      >
                        <span className="slug-care-meter-fill" style={{ transform: `scaleX(${food / FOOD_MAX})` }} />
                      </div>
                      <span className="slug-care-state">
                        <strong className="num-tabular">{food}%</strong> {state.label}
                      </span>
                    </div>
                  </Hint>
                  <div className="slug-care-actions">
                    <button
                      type="button"
                      className="panel-btn slug-care-btn"
                      disabled={full || noKibble || feeding}
                      title={noKibble && !full ? "You're out of Slug Kibble" : undefined}
                      onClick={() => feed(slug, false)}
                    >
                      Feed
                    </button>
                    {needed > 1 && (
                      <button
                        type="button"
                        className="panel-btn panel-btn--ghost slug-care-btn"
                        disabled={noKibble || feeding}
                        onClick={() => feed(slug, true)}
                        title={`Spend up to ${needed} scoops to fill ${slug.name}`}
                      >
                        Fill up
                      </button>
                    )}
                  </div>
                </div>

                <div className="slug-care-lane">
                  <span className="slug-care-lane-label">
                    <BatteryChargingIcon weight="bold" />
                    Energy
                  </span>
                  <Hint align="start" title={`${slug.name}'s energy`} tip={<EnergyRules />} className="slug-care-lane-hint">
                    <div className="slug-care-food">
                      <EnergyPips pips={pips} size="sm" />
                      <span className="slug-care-state">
                        <strong className="num-tabular">
                          {pips.length - spent}/{pips.length}
                        </strong>{" "}
                        {spent === 0 ? "Charged" : "pips ready"}
                      </span>
                    </div>
                  </Hint>
                  <div className="slug-care-actions">
                    <button
                      type="button"
                      className="panel-btn slug-care-btn"
                      disabled={spent === 0 || noCells || charging}
                      title={noCells && spent > 0 ? "You're out of Energy Cells" : undefined}
                      onClick={() => recharge(slug)}
                    >
                      Recharge
                    </button>
                  </div>
                </div>
              </div>

              {warning && (
                <p className="slug-care-warning">
                  <WarningIcon weight="fill" />
                  {warning}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
