import { useEffect, useState } from "react";
import { TrophyIcon, UserCircleIcon } from "@phosphor-icons/react";
import { useLiveState } from "./AccessSocket.jsx";
import "./ChallengeResultOverlay.css";

export default function ChallengeResultOverlay() {
  const { challengeFinished } = useLiveState();
  // A queue, not a single slot: if a second challenge finishes before the
  // first result is acknowledged, the player still sees both, one at a
  // time, instead of losing one. Never cleared by navigation or by a new
  // challenge being issued -- only "OK" advances the queue.
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    if (!challengeFinished) return;
    setQueue((prev) => (prev.some((q) => q.at === challengeFinished.at) ? prev : [...prev, challengeFinished]));
  }, [challengeFinished]);

  if (queue.length === 0) return null;

  const { challenge, winners, highest } = queue[0];
  const noOneQualified = winners.length === 0;

  function handleOk() {
    setQueue((prev) => prev.slice(1));
  }

  return (
    <div className="challenge-overlay" role="dialog" aria-modal="true" aria-label="Challenge results">
      <div className={`challenge-overlay-card${noOneQualified ? " challenge-overlay-card--empty" : ""}`}>
        <span className="challenge-overlay-icon">
          <TrophyIcon weight="fill" />
        </span>
        <p className="challenge-overlay-kicker">Challenge complete</p>
        <h1 className="challenge-overlay-title">
          {noOneQualified ? "No one made it" : winners.length > 1 ? "It's a tie!" : "We have a winner!"}
        </h1>
        <p className="challenge-overlay-sub">
          {noOneQualified ? (
            <>
              Nobody rolled above <strong>{challenge.target}</strong>. <strong>{challenge.reward}</strong> goes
              unclaimed.
            </>
          ) : (
            <>
              Rolled above <strong>{challenge.target}</strong> with a <strong>{highest}</strong> to earn{" "}
              <strong>{challenge.reward}</strong>
            </>
          )}
        </p>

        {!noOneQualified && (
          <div className="challenge-overlay-winners">
            {winners.map((w) => (
              <div key={w.userId} className="challenge-overlay-winner">
                <span className="challenge-overlay-winner-portrait">
                  <UserCircleIcon weight="duotone" />
                </span>
                <span className="challenge-overlay-winner-name">{w.username}</span>
                <span className="challenge-overlay-winner-value">{w.value}</span>
              </div>
            ))}
          </div>
        )}

        <button type="button" className="challenge-overlay-ok" onClick={handleOk}>
          OK
        </button>
        {queue.length > 1 && (
          <p className="challenge-overlay-queue">+{queue.length - 1} more result{queue.length - 1 > 1 ? "s" : ""} waiting</p>
        )}
      </div>
    </div>
  );
}
