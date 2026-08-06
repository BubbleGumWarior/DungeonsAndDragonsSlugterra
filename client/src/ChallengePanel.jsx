import { useEffect, useRef, useState } from "react";
import { TrophyIcon, XIcon, FlagCheckeredIcon, DiceSixIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import "./Panel.css";
import "./ChallengePanel.css";

const ROLL_ANIMATION_MS = 900;
const ROLL_TICK_MS = 45;

function sortRolls(rolls) {
  return [...rolls].sort((a, b) => b.value - a.value || new Date(a.createdAt) - new Date(b.createdAt));
}

export default function ChallengePanel({ isDungeonMaster = false }) {
  const { token, user } = useAuth();
  const { challengeIssued, challengeRollAdded, challengeRollRemoved, challengeFinished } = useLiveState();

  const [challenge, setChallenge] = useState(null);
  const [rolls, setRolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [targetDraft, setTargetDraft] = useState("");
  const [rewardDraft, setRewardDraft] = useState("");
  const [issuing, setIssuing] = useState(false);

  const [rolling, setRolling] = useState(false);
  const [displayValue, setDisplayValue] = useState(null);
  const rollIntervalRef = useRef(null);
  const pendingRollTimersRef = useRef(new Set());

  // Hydrate from the server on mount / whenever a fresh challenge is issued
  // (the roll-animation state should not survive into a brand new challenge).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch("/api/challenge/current", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setChallenge(data.challenge);
        setRolls(sortRolls(data.rolls || []));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!challengeIssued) return;
    pendingRollTimersRef.current.forEach(clearTimeout);
    pendingRollTimersRef.current.clear();
    setChallenge(challengeIssued.challenge);
    setRolls(sortRolls(challengeIssued.rolls || []));
    setDisplayValue(null);
    setError(null);
  }, [challengeIssued]);

  // Deliberately withheld from the shared list for the same window the
  // roller's own dice are "cycling" -- otherwise anyone (including the
  // roller) could skip the animation entirely by just watching the list.
  useEffect(() => {
    if (!challengeRollAdded) return;
    const { challengeId, roll } = challengeRollAdded;
    const timer = setTimeout(() => {
      pendingRollTimersRef.current.delete(timer);
      setChallenge((current) => {
        if (!current || current.id !== challengeId) return current;
        setRolls((prev) => (prev.some((r) => r.id === roll.id) ? prev : sortRolls([...prev, roll])));
        return current;
      });
    }, ROLL_ANIMATION_MS);
    pendingRollTimersRef.current.add(timer);
  }, [challengeRollAdded]);

  useEffect(() => {
    if (!challengeRollRemoved) return;
    setChallenge((current) => {
      if (!current || current.id !== challengeRollRemoved.challengeId) return current;
      setRolls((prev) => prev.filter((r) => r.userId !== challengeRollRemoved.userId));
      return current;
    });
  }, [challengeRollRemoved]);

  useEffect(() => {
    if (!challengeFinished) return;
    setChallenge((current) =>
      current && current.id === challengeFinished.challenge.id ? { ...current, status: "finished" } : current
    );
  }, [challengeFinished]);

  useEffect(() => {
    return () => {
      clearInterval(rollIntervalRef.current);
      pendingRollTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  const ownRoll = rolls.find((r) => r.userId === user?.id);
  const isActive = challenge?.status === "active";

  async function handleIssue(e) {
    e.preventDefault();
    const target = Number(targetDraft);
    const reward = rewardDraft.trim();
    if (!Number.isInteger(target) || target < 1 || target > 100 || !reward || issuing) return;

    setIssuing(true);
    setError(null);
    try {
      const res = await fetch("/api/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ target, reward }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not issue challenge.");
      }
      setTargetDraft("");
      setRewardDraft("");
    } catch (err) {
      setError(err.message);
    } finally {
      setIssuing(false);
    }
  }

  function handleRoll() {
    if (rolling || ownRoll || !isActive || !challenge) return;

    setError(null);
    setRolling(true);
    const startedAt = Date.now();
    rollIntervalRef.current = setInterval(() => {
      setDisplayValue(1 + Math.floor(Math.random() * 100));
    }, ROLL_TICK_MS);

    fetch(`/api/challenge/${challenge.id}/roll`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not roll.");
        return data.roll;
      })
      .then((roll) => {
        const elapsed = Date.now() - startedAt;
        const wait = Math.max(0, ROLL_ANIMATION_MS - elapsed);
        setTimeout(() => {
          clearInterval(rollIntervalRef.current);
          setDisplayValue(roll.value);
          setRolling(false);
        }, wait);
      })
      .catch((err) => {
        clearInterval(rollIntervalRef.current);
        setRolling(false);
        setDisplayValue(null);
        setError(err.message);
      });
  }

  async function handleRemoveRoll(userId) {
    if (!challenge) return;
    try {
      const res = await fetch(`/api/challenge/${challenge.id}/roll/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not remove roll.");
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleFinish() {
    if (!challenge || !isActive) return;
    try {
      const res = await fetch(`/api/challenge/${challenge.id}/finish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not finish challenge.");
      }
    } catch (err) {
      setError(err.message);
    }
  }

  const highest = rolls.length > 0 ? rolls[0].value : null;

  return (
    <div className="panel challenge-panel">
      <div className="panel-header">
        <span className="panel-header-icon">
          <TrophyIcon weight="duotone" />
        </span>
        <div className="panel-header-text">
          <h2>Challenge Roll</h2>
          <p>Beat the target to earn the reward</p>
        </div>
        {challenge && (
          <span className={`panel-header-badge${isActive ? "" : " panel-header-badge--muted"}`}>
            {isActive ? "Active" : "Finished"}
          </span>
        )}
      </div>

      <div className="panel-body">
        {isDungeonMaster && (
          <form className="challenge-setup" onSubmit={handleIssue}>
            <div className="panel-row">
              <div className="panel-field">
                <label>Roll above</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  placeholder="15"
                  value={targetDraft}
                  onChange={(e) => setTargetDraft(e.target.value)}
                  disabled={issuing}
                />
              </div>
              <div className="panel-field">
                <label>Reward</label>
                <input
                  type="text"
                  placeholder="Potion of Healing"
                  value={rewardDraft}
                  onChange={(e) => setRewardDraft(e.target.value)}
                  disabled={issuing}
                />
              </div>
            </div>
            <button
              type="submit"
              className="panel-btn"
              disabled={issuing || !targetDraft || !rewardDraft.trim()}
            >
              <FlagCheckeredIcon weight="bold" />
              {challenge ? "Issue New Challenge" : "Issue Challenge"}
            </button>
          </form>
        )}

        {loading ? (
          <div className="panel-empty">Loading challenge...</div>
        ) : !challenge ? (
          <div className="panel-empty">
            <TrophyIcon weight="duotone" />
            {isDungeonMaster ? "Set a target and reward above to issue one." : "No challenge has been issued yet."}
          </div>
        ) : (
          <>
            <div className="challenge-target">
              <span>Roll above</span>
              <strong className="num-tabular">{challenge.target}</strong>
              <span>to earn</span>
              <strong className="challenge-target-reward">{challenge.reward}</strong>
            </div>

            {!isDungeonMaster && (
              <button
                type="button"
                className={`panel-btn challenge-roll-btn${rolling ? " challenge-roll-btn--rolling" : ""}`}
                onClick={handleRoll}
                disabled={rolling || Boolean(ownRoll) || !isActive}
              >
                <DiceSixIcon weight="bold" className={rolling ? "challenge-roll-icon-spin" : ""} />
                {rolling
                  ? displayValue ?? "..."
                  : ownRoll
                  ? `You rolled ${ownRoll.value}`
                  : isActive
                  ? "Roll"
                  : "Challenge closed"}
              </button>
            )}

            <div className="challenge-results">
              {rolls.length === 0 ? (
                <div className="panel-empty">No rolls yet.</div>
              ) : (
                rolls.map((roll, i) => (
                  <div
                    key={roll.id}
                    className={`challenge-result-row${roll.value === highest ? " challenge-result-row--top" : ""}`}
                  >
                    <span className="challenge-result-rank">#{i + 1}</span>
                    <span className="challenge-result-name">{roll.username}</span>
                    <span className="challenge-result-value num-tabular">{roll.value}</span>
                    {isDungeonMaster && (
                      <button
                        type="button"
                        className="panel-btn panel-btn--ghost panel-btn--icon"
                        onClick={() => handleRemoveRoll(roll.userId)}
                        title="Remove roll (lets them reroll)"
                      >
                        <XIcon weight="bold" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {isDungeonMaster && isActive && (
              <button type="button" className="panel-btn panel-btn--ghost" onClick={handleFinish}>
                Finish Challenge
              </button>
            )}
          </>
        )}

        {error && <p className="panel-error">{error}</p>}
      </div>
    </div>
  );
}
