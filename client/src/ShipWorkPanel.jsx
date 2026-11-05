import { useState } from "react";
import { DiceSixIcon, WrenchIcon } from "@phosphor-icons/react";
import { ROMAN, describeShipWork } from "./shipData.js";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

// What one tier costs and how the roll to start it will go. `tier` is a row of
// a blueprint from GET /api/ships/blueprints; `info` is the whole response.
function Quote({ tier, info }) {
  const have = info.stores[tier.grade] ?? 0;
  const short = have < tier.cost;
  const mod = (info.modifier ?? 0) + (info.buildBonus ?? 0);
  return (
    <ul className="ship-quote">
      <li>{tier.effect}</li>
      <li className={short ? "ship-quote-short" : undefined}>
        Costs <strong>{tier.cost}</strong> {tier.gradeName}. The stores hold {have}.
      </li>
      <li>Takes {plural(tier.buildDays, "day")} of work once the roll lands.</li>
      <li>
        Roll d20 {signed(mod)} against <strong>DC {tier.dc}</strong>. A miss wastes {Math.ceil(tier.cost / 2)} of the{" "}
        {tier.gradeName} and starts nothing.
      </li>
    </ul>
  );
}

function AttemptButton({ tier, info, busy, label, onClick }) {
  const short = (info.stores[tier.grade] ?? 0) < tier.cost;
  return (
    <button type="button" className="ship-btn ship-btn--primary" disabled={busy || short} onClick={onClick}>
      <DiceSixIcon weight="bold" /> {busy ? "Rolling…" : label}
    </button>
  );
}

function Result({ result }) {
  if (!result) return null;
  const text = describeShipWork(result);
  return (
    <p className={`ship-result ${result.success ? "ship-result--good" : "ship-result--bad"}`}>
      <strong>{result.success ? "Success." : "Failed."}</strong> {text.detail}
    </p>
  );
}

// The crew's side of a compartment: build on an empty slot the DM placed, or
// lift an online one to its next tier. One player rolls Engineering for the party.
export default function ShipWorkPanel({ compartment, info, busy, error, result, onAttempt }) {
  const [pick, setPick] = useState("");
  if (!info) return null;

  const bp = info.blueprints.find((b) => b.key === compartment.templateKey) ?? null;
  const tier = Math.max(1, Math.min(bp?.maxTier ?? 1, compartment.tier || 1));

  if (compartment.status === "empty") {
    const options = info.blueprints.filter((b) => b.buildable);
    const chosen = options.find((b) => b.key === pick) ?? null;
    return (
      <div className="ship-build">
        <h3 className="ship-build-title">
          <WrenchIcon weight="bold" /> Build here
        </h3>
        <p className="ship-progress-text">
          An empty slot. Pick what to build, then one of you rolls Engineering for the party. Supplies come from the
          ship's stores, which the market stocks when a merchant has them.
        </p>
        <label className="ship-detail-field">
          Compartment
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose…</option>
            {options.map((b) => (
              <option key={b.key} value={b.key}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        {chosen && (
          <>
            <p className="ship-detail-body">{chosen.description}</p>
            <Quote tier={chosen.tiers[0]} info={info} />
            <div className="ship-build-actions">
              <AttemptButton
                tier={chosen.tiers[0]}
                info={info}
                busy={busy}
                label="Roll Engineering to build"
                onClick={() => onAttempt("build", compartment.id, chosen.key)}
              />
            </div>
          </>
        )}
        <Result result={result} />
        {error && <p className="ship-error">{error}</p>}
      </div>
    );
  }

  if (compartment.status === "online" && bp) {
    const current = bp.tiers[tier - 1];
    const next = bp.tiers[tier] ?? null;
    const upgrading = compartment.upgradingTo ? bp.tiers[compartment.upgradingTo - 1] : null;
    return (
      <div className="ship-build">
        <h3 className="ship-build-title">
          <WrenchIcon weight="bold" /> {bp.maxTier > 1 ? `Tier ${ROMAN[tier]} of ${ROMAN[bp.maxTier]}` : "In service"}
        </h3>
        <p className="ship-detail-body">{current.effect}</p>
        {!upgrading && next && (
          <>
            <p className="ship-progress-text">
              <strong>Upgrade to Tier {ROMAN[next.tier]}.</strong> It keeps working while the upgrade is under way.
            </p>
            <Quote tier={next} info={info} />
            <div className="ship-build-actions">
              <AttemptButton
                tier={next}
                info={info}
                busy={busy}
                label={`Roll Engineering to upgrade`}
                onClick={() => onAttempt("upgrade", compartment.id)}
              />
            </div>
          </>
        )}
        {!upgrading && !next && bp.maxTier > 1 && <p className="ship-progress-text">At its highest tier.</p>}
        <Result result={result} />
        {error && <p className="ship-error">{error}</p>}
      </div>
    );
  }

  return null;
}
