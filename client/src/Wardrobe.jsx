import { useEffect, useState } from "react";
import { CheckIcon, ThermometerIcon, TShirtIcon, WarningIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { PLANETS } from "./planetData.js";
import { climateTier, degreesOutside, effectiveRange, formatRange, outfitChips, tierEffects } from "./outfitData.js";
import "./Wardrobe.css";

// The temperature scale shared by every outfit's comfort track, so the list
// reads as a comparison against the weather right now. "Any temperature"
// outfits (max 500+) run off the right edge.
function trackDomain(outfits, fortitudeMod, temp) {
  let lo = temp ?? 16;
  let hi = temp ?? 26;
  for (const o of outfits) {
    const r = effectiveRange(o, fortitudeMod);
    lo = Math.min(lo, r.min);
    if (r.max < 500) hi = Math.max(hi, r.max);
  }
  return { lo: Math.max(-100, Math.floor(lo - 8)), hi: Math.min(100, Math.ceil(hi + 8)) };
}

// The closet: every outfit you own, text only. Exactly one is worn at all
// times; the climate banner says how it copes with where the party is.
// `bare` drops the heading, for when a tab already names it.
export default function Wardrobe({ bare = false }) {
  const { token, user } = useAuth();
  const { outfitsChanged, marketChanged, slugHuntArea } = useLiveState();
  const myChange = outfitsChanged && outfitsChanged.userId === user?.id ? outfitsChanged.at : null;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    fetch("/api/outfits/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((body) => setData(body.outfits ? body : { outfits: [], climate: null, fortitudeMod: 0 }))
      .catch(() => setData({ outfits: [], climate: null, fortitudeMod: 0 }));
    // The climate moves when the party travels (slugHuntArea) and a purchase adds
    // an outfit (marketChanged).
  }, [token, myChange, marketChanged, slugHuntArea, tick]);

  if (!data || data.outfits.length === 0) return null;

  const { outfits, climate, fortitudeMod } = data;
  const worn = outfits.find((o) => o.equipped) ?? null;
  const world = climate ? PLANETS[climate.area] : null;

  function wear(outfit) {
    setError(null);
    setData((prev) => ({ ...prev, outfits: prev.outfits.map((o) => ({ ...o, equipped: o.id === outfit.id })) }));
    fetch(`/api/outfits/${outfit.id}/equip`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (res.ok) return;
        const body = await res.json().catch(() => ({}));
        setError(body.error || "That didn't work.");
        setTick((n) => n + 1);
      })
      .catch(() => setTick((n) => n + 1));
  }

  // How an outfit copes with the temperature right now.
  function fit(outfit) {
    if (!climate) return null;
    const range = effectiveRange(outfit, fortitudeMod);
    const outside = degreesOutside(range, climate.temp);
    return { range, outside, tier: climateTier(outside) };
  }

  const current = worn ? fit(worn) : null;
  const effects = current ? tierEffects(current.tier) : [];
  const { lo, hi } = trackDomain(outfits, fortitudeMod, climate?.temp);
  const pct = (v) => ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * 100;
  const place = climate ? (climate.traveling ? "Aboard the ship" : world?.name ?? "The party's world") : null;

  return (
    <section className="wardrobe">
      {!bare && <h2 className="weapon-loadout-title">Wardrobe</h2>}

      {climate && (
        <div className={`wardrobe-climate wardrobe-climate--${current?.tier.key ?? "comfortable"}`}>
          <div className="wardrobe-climate-temp">
            <ThermometerIcon weight="duotone" aria-hidden="true" />
            <span className="wardrobe-climate-deg num-tabular">
              {climate.temp}
              <small>°C</small>
            </span>
            <span className="wardrobe-climate-where">{place}</span>
          </div>
          {current && worn && (
            <div className="wardrobe-climate-body">
              <p className="wardrobe-climate-status">
                <span className="wardrobe-climate-outfit">{worn.name}</span>
                <span className="wardrobe-tier">{current.tier.label}</span>
              </p>
              <p className="wardrobe-climate-note">
                {current.outside > 0
                  ? `${current.outside} °C outside this outfit's comfort range.`
                  : "Within this outfit's comfort range. No penalties."}
              </p>
              {effects.length > 0 && (
                <ul className="wardrobe-effects" aria-label="Effects in a fight">
                  {effects.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              {current.outside > 0 && (
                <p className="wardrobe-climate-warn">
                  <WarningIcon weight="fill" aria-hidden="true" /> Sleeping like this risks illness.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {error && (
        <p className="panel-error" role="alert">
          {error}
        </p>
      )}

      <ul className="wardrobe-list">
        {outfits.map((outfit) => {
          const f = fit(outfit);
          const chips = outfitChips(outfit);
          const range = f?.range ?? effectiveRange(outfit, fortitudeMod);
          const left = pct(range.min);
          const width = Math.max(2, pct(Math.min(range.max, hi)) - left);
          const tierKey = f?.tier.key ?? "comfortable";
          return (
            <li key={outfit.id} className={`wardrobe-item wardrobe-item--${tierKey} ${outfit.equipped ? "wardrobe-item--worn" : ""}`}>
              <div className="wardrobe-item-main">
                <TShirtIcon weight="duotone" className="wardrobe-item-icon" aria-hidden="true" />
                <div className="wardrobe-item-text">
                  <span className="wardrobe-item-name">{outfit.name}</span>
                  <p className="wardrobe-item-desc">{outfit.description}</p>
                  {chips.length > 0 && (
                    <ul className="wardrobe-chips">
                      {chips.map((c) => (
                        <li key={c.label} className={`wardrobe-chip ${c.good ? "wardrobe-chip--good" : "wardrobe-chip--bad"}`}>
                          {c.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="wardrobe-item-comfort">
                <div
                  className="wardrobe-track"
                  role="img"
                  aria-label={`Comfortable ${formatRange(range)}${climate ? `; it is ${climate.temp} °C now` : ""}`}
                >
                  <span className="wardrobe-track-band" style={{ left: `${left}%`, width: `${width}%` }} />
                  {climate && <span className="wardrobe-track-now" style={{ left: `${pct(climate.temp)}%` }} />}
                </div>
                <div className="wardrobe-comfort-text">
                  <span className="wardrobe-range">
                    {formatRange(range)}
                    {fortitudeMod > 0 && range.min !== outfit.comfortMin && " with Fortitude"}
                  </span>
                  {f && <span className="wardrobe-fit">{f.outside === 0 ? "Comfortable here" : `${f.tier.label} here`}</span>}
                </div>
              </div>

              <button type="button" className="panel-btn wardrobe-wear" disabled={outfit.equipped} onClick={() => wear(outfit)}>
                {outfit.equipped ? (
                  <>
                    <CheckIcon weight="bold" aria-hidden="true" /> Worn
                  </>
                ) : (
                  "Wear"
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
