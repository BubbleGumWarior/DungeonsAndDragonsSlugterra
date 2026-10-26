import { CheckIcon, GaugeIcon, PathIcon, RocketLaunchIcon, XIcon } from "@phosphor-icons/react";
import { PLANETS } from "./planetData.js";
import "./TravelPanel.css";

const worldName = (i) => PLANETS[i]?.name ?? "Unknown";
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The strip above the Galaxy Map: what day it is, how fast the ship goes, and
// whichever of the three states the party is in -- docked, voting on a
// destination, or under way. Every long rest is a day.
export default function TravelPanel({ travel, isDungeonMaster, act, busy, error }) {
  if (!travel) return null;
  const { ship, proposal, traveling } = travel;
  const elapsed = travel.daysTotal - travel.daysLeft;

  return (
    <section className="travel-panel" aria-label="Ship travel">
      <header className="travel-head">
        <span className="travel-day">Day {travel.day}</span>
        {ship ? (
          <span className="travel-ship" title={`Base speed ${ship.base}, compartments ${ship.bonus >= 0 ? "+" : ""}${ship.bonus}`}>
            <GaugeIcon weight="bold" />
            {ship.name} · speed {ship.effective}
            {ship.bonus !== 0 && (
              <span className="travel-ship-bonus">
                {" "}
                ({ship.base} {ship.bonus > 0 ? "+" : "−"} {Math.abs(ship.bonus)})
              </span>
            )}
          </span>
        ) : (
          <span className="travel-ship travel-ship--none">No ship yet</span>
        )}
      </header>

      {traveling ? (
        <div className="travel-body">
          <p className="travel-line">
            <RocketLaunchIcon weight="bold" />
            <span>
              Under way from <strong>{worldName(travel.origin)}</strong> to <strong>{worldName(travel.destination)}</strong>
            </span>
          </p>
          <div
            className="travel-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={travel.daysTotal}
            aria-valuenow={elapsed}
          >
            <span style={{ transform: `scaleX(${elapsed / Math.max(1, travel.daysTotal)})` }} />
          </div>
          <p className="travel-sub">
            {plural(travel.daysLeft, "day")} left of {travel.daysTotal}. Each long rest is one day.
          </p>
          {isDungeonMaster && (
            <button type="button" className="travel-btn travel-btn--danger" disabled={busy} onClick={() => act("abort")}>
              <XIcon weight="bold" /> Turn the ship around
            </button>
          )}
        </div>
      ) : proposal ? (
        <div className="travel-body">
          <p className="travel-line">
            <PathIcon weight="bold" />
            <span>
              {proposal.proposerName ?? "The DM"} proposes flying to <strong>{worldName(proposal.area)}</strong>:{" "}
              {plural(proposal.days, "day")} at speed {ship?.effective ?? "?"}
            </span>
          </p>

          <ul className="travel-votes">
            {proposal.yes.map((n) => (
              <li key={`y-${n}`} className="travel-vote travel-vote--yes">
                <CheckIcon weight="bold" /> {n}
              </li>
            ))}
            {proposal.no.map((n) => (
              <li key={`n-${n}`} className="travel-vote travel-vote--no">
                <XIcon weight="bold" /> {n}
              </li>
            ))}
            {proposal.waiting.map((n) => (
              <li key={`w-${n}`} className="travel-vote">
                {n} · waiting
              </li>
            ))}
          </ul>
          <p className="travel-sub">
            {proposal.yes.length} of {proposal.needed} yes votes needed to launch.
          </p>

          <div className="travel-actions">
            {travel.canVote && (
              <>
                <button
                  type="button"
                  className={`travel-btn travel-btn--yes ${travel.myVote === true ? "travel-btn--on" : ""}`}
                  disabled={busy}
                  onClick={() => act("vote", { vote: "yes" })}
                >
                  <CheckIcon weight="bold" /> Let's go
                </button>
                <button
                  type="button"
                  className={`travel-btn travel-btn--no ${travel.myVote === false ? "travel-btn--on" : ""}`}
                  disabled={busy}
                  onClick={() => act("vote", { vote: "no" })}
                >
                  <XIcon weight="bold" /> Not there
                </button>
              </>
            )}
            {(isDungeonMaster || proposal.mine) && (
              <button type="button" className="travel-btn" disabled={busy} onClick={() => act("withdraw")}>
                Withdraw
              </button>
            )}
            {isDungeonMaster && (
              <button type="button" className="travel-btn travel-btn--primary" disabled={busy} onClick={() => act("depart")}>
                <RocketLaunchIcon weight="bold" /> Launch now
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="travel-body">
          <p className="travel-line">
            <RocketLaunchIcon weight="bold" />
            <span>
              Docked at <strong>{worldName(travel.area)}</strong>.{" "}
              {ship ? "Pick a world on the map and propose a course." : "Without a ship the party can't travel."}
            </span>
          </p>
        </div>
      )}

      {error && <p className="travel-error">{error}</p>}
    </section>
  );
}
