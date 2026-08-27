import { useEffect, useRef, useState } from "react";
import { DiceSixIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { formatModifier } from "./characterData.js";
import Die, { keptIndex } from "./Die.jsx";
import "./Panel.css";
import "./DiceRollPrompt.css";

const ROLL_ANIMATION_MS = 900;
const ROLL_TICK_MS = 45;
const RESULT_LINGER_MS = 15000;
const FADE_OUT_MS = 400;

function randomDie(pair) {
  return pair
    ? [1 + Math.floor(Math.random() * 20), 1 + Math.floor(Math.random() * 20)]
    : [1 + Math.floor(Math.random() * 20)];
}

function PromptCard({ offer, onDismiss }) {
  const { token } = useAuth();
  const [rolling, setRolling] = useState(false);
  const [displayDice, setDisplayDice] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [fadingOut, setFadingOut] = useState(false);
  const tickRef = useRef(null);
  const fadeTimerRef = useRef(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => () => clearInterval(tickRef.current), []);

  // Once the result is in, auto-dismiss the card after a linger period so a
  // large multi-roll that overflows the screen still clears itself.
  useEffect(() => {
    if (!result) return undefined;
    const lingerTimer = setTimeout(() => {
      setFadingOut(true);
      fadeTimerRef.current = setTimeout(() => dismissRef.current(), FADE_OUT_MS);
    }, RESULT_LINGER_MS);
    return () => {
      clearTimeout(lingerTimer);
      clearTimeout(fadeTimerRef.current);
    };
  }, [result]);

  function handleRoll() {
    if (rolling || result) return;
    setError(null);
    setRolling(true);
    const pair = offer.rollType !== "normal";
    setDisplayDice(Array.from({ length: offer.diceCount }, () => randomDie(pair)));

    const startedAt = Date.now();
    tickRef.current = setInterval(() => {
      setDisplayDice(Array.from({ length: offer.diceCount }, () => randomDie(pair)));
    }, ROLL_TICK_MS);

    fetch(`/api/dice-roll/${offer.id}/resolve`, {
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
          clearInterval(tickRef.current);
          setDisplayDice(roll.results.map((r) => r.values));
          setResult(roll);
          setRolling(false);
        }, wait);
      })
      .catch((err) => {
        clearInterval(tickRef.current);
        setRolling(false);
        setError(err.message);
      });
  }

  const typeLabel = offer.rollType === "advantage" ? "Advantage" : offer.rollType === "disadvantage" ? "Disadvantage" : null;

  return (
    <div className={`dice-prompt-card${fadingOut ? " dice-prompt-card--out" : ""}`}>
      <button type="button" className="dice-prompt-close" onClick={onDismiss} aria-label="Dismiss">
        <XIcon weight="bold" />
      </button>

      <div className="dice-prompt-head">
        <span className="dice-prompt-icon">
          <DiceSixIcon weight="duotone" />
        </span>
        <div>
          <p className="dice-prompt-kicker">{offer.calledBy} calls for a roll</p>
          <h3 className="dice-prompt-title">
            {offer.skillLabel}
            {offer.diceCount > 1 ? ` ×${offer.diceCount}` : ""}
            {typeLabel && <span className="dice-prompt-type"> · {typeLabel}</span>}
          </h3>
        </div>
      </div>

      {!result && !rolling && (
        <button type="button" className="panel-btn dice-prompt-roll" onClick={handleRoll}>
          <DiceSixIcon weight="bold" />
          Roll
        </button>
      )}

      {(rolling || result) && (
        <div className="dice-prompt-dice">
          {displayDice.map((values, i) => {
            const r = result?.results[i];
            const settled = Boolean(r) && !rolling;
            const winIdx = settled ? keptIndex(values, offer.rollType) : -1;
            return (
              <div key={i} className="dice-group">
                <div className="dice-pair">
                  {values.map((v, vi) => (
                    <Die
                      key={vi}
                      value={v}
                      rolling={rolling}
                      state={!settled ? null : vi === winIdx ? "kept" : "discarded"}
                    />
                  ))}
                </div>
                {r && (
                  <div className="dice-group-total">
                    <span className="dice-group-total-value num-tabular">{r.total}</span>
                    <span className="dice-group-total-mod num-tabular">{formatModifier(result.modifier)} mod</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {result && <p className="dice-prompt-logged">Logged in Party Chat</p>}
      {error && <p className="panel-error">{error}</p>}
    </div>
  );
}

export default function DiceRollPrompt() {
  const { diceRollOffered } = useLiveState();
  const [offers, setOffers] = useState([]);

  useEffect(() => {
    if (!diceRollOffered) return;
    setOffers((prev) => (prev.some((o) => o.id === diceRollOffered.id) ? prev : [...prev, diceRollOffered]));
  }, [diceRollOffered]);

  if (offers.length === 0) return null;

  function dismiss(id) {
    setOffers((prev) => prev.filter((o) => o.id !== id));
  }

  return (
    <div className="dice-prompt-stack">
      {offers.map((offer) => (
        <PromptCard key={offer.id} offer={offer} onDismiss={() => dismiss(offer.id)} />
      ))}
    </div>
  );
}
