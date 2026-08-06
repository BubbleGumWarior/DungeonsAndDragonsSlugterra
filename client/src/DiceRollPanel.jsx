import { useEffect, useState } from "react";
import { DiceSixIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { PROFICIENCIES, statByKey } from "./characterData.js";
import "./Panel.css";

export default function DiceRollPanel() {
  const { token } = useAuth();
  const [players, setPlayers] = useState([]);
  const [diceCount, setDiceCount] = useState(1);
  const [skill, setSkill] = useState(PROFICIENCIES[0].key);
  const [targetUserId, setTargetUserId] = useState("");
  const [rollType, setRollType] = useState("normal");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;
    fetch("/api/characters", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setPlayers(data.characters || []))
      .catch(() => {});
  }, [token]);

  function handleSend() {
    if (sending || !targetUserId || !skill) return;
    setError(null);
    setStatus(null);
    setSending(true);

    fetch("/api/dice-roll", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ diceCount, skill, targetUserId: Number(targetUserId), rollType }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not call roll.");
        return data;
      })
      .then((data) => {
        setStatus(`Sent to ${data.targetName} — waiting for them to roll.`);
      })
      .catch((err) => setError(err.message))
      .finally(() => setSending(false));
  }

  return (
    <div className="dm-console dice-console">
      <span className="dm-console-label">
        <DiceSixIcon weight="duotone" />
        Call a Roll
      </span>

      <div className="dm-console-fields">
        <div className="dm-console-field">
          <label>Dice</label>
          <input
            type="number"
            min={1}
            max={10}
            value={diceCount}
            onChange={(e) => setDiceCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
            disabled={sending}
          />
        </div>
        <div className="dm-console-field" style={{ minWidth: 190 }}>
          <label>Skill</label>
          <select value={skill} onChange={(e) => setSkill(e.target.value)} disabled={sending}>
            {PROFICIENCIES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label} ({statByKey(p.stat)?.abbr})
              </option>
            ))}
          </select>
        </div>
        <div className="dm-console-field" style={{ minWidth: 150 }}>
          <label>Target Player</label>
          <select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} disabled={sending}>
            <option value="">Select a player...</option>
            {players.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="dm-console-field">
          <label>Roll Type</label>
          <div className="dm-console-toggle">
            {[
              ["normal", "Normal"],
              ["advantage", "Adv"],
              ["disadvantage", "Disadv"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`dm-console-toggle-btn${rollType === value ? " dm-console-toggle-btn--active" : ""}`}
                onClick={() => setRollType(value)}
                disabled={sending}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button type="button" className="panel-btn" onClick={handleSend} disabled={sending || !targetUserId}>
        <PaperPlaneTiltIcon weight="bold" />
        {sending ? "Sending..." : "Call Roll"}
      </button>

      {status && <p className="dice-console-summary">{status}</p>}
      {error && <p className="panel-error">{error}</p>}
    </div>
  );
}
