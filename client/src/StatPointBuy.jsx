import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import {
  DM_MAX_STAT,
  DM_MIN_STAT,
  MAX_STAT,
  MIN_STAT,
  STATS,
  TOTAL_STAT_POINTS,
  scoreLabel,
  statCost,
  totalStatCost,
} from "./characterData.js";
import "./StatPointBuy.css";

export default function StatPointBuy({ stats, onChange, unrestricted = false }) {
  const minStat = unrestricted ? DM_MIN_STAT : MIN_STAT;
  const maxStat = unrestricted ? DM_MAX_STAT : MAX_STAT;
  const spent = totalStatCost(stats);
  const remaining = TOTAL_STAT_POINTS - spent;

  function adjust(key, delta) {
    const current = stats[key];
    const next = current + delta;
    if (next < minStat || next > maxStat) return;

    if (!unrestricted) {
      const deltaCost = delta > 0 ? statCost(next) - statCost(current) : statCost(current) - statCost(next);
      if (delta > 0 && deltaCost > remaining) return;
    }

    onChange({ ...stats, [key]: next });
  }

  return (
    <div className="point-buy">
      {!unrestricted && (
        <div className={`point-buy-remaining ${remaining === 0 ? "point-buy-remaining--done" : ""}`}>
          <span className="point-buy-remaining-value">{remaining}</span>
          <span className="point-buy-remaining-label">points remaining</span>
        </div>
      )}

      <div className="point-buy-rows">
        {STATS.map(({ key, label, abbr, description }) => {
          const value = stats[key];
          const nextCost = !unrestricted && value < maxStat ? statCost(value + 1) - statCost(value) : null;
          return (
            <div className="point-buy-row" key={key}>
              <div className="point-buy-row-info">
                <div className="point-buy-row-title">
                  <span className="point-buy-row-abbr">{abbr}</span>
                  <span className="point-buy-row-label">{label}</span>
                </div>
                <p className="point-buy-row-description">{description}</p>
              </div>

              <div className="point-buy-row-controls">
                <button
                  type="button"
                  className="point-buy-btn"
                  onClick={() => adjust(key, -1)}
                  disabled={value <= minStat}
                  aria-label={`Decrease ${label}`}
                >
                  <MinusIcon weight="bold" />
                </button>

                <div className="point-buy-scale">
                  <span className="point-buy-value">{value}</span>
                  <span className="point-buy-scale-label">{scoreLabel(value)}</span>
                </div>

                <button
                  type="button"
                  className="point-buy-btn"
                  onClick={() => adjust(key, 1)}
                  disabled={value >= maxStat || (nextCost !== null && nextCost > remaining)}
                  aria-label={`Increase ${label}`}
                >
                  <PlusIcon weight="bold" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
