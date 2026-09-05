import { useEffect, useRef, useState } from "react";
import { ShieldWarningIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { typeColor } from "./slugData.js";
import "./Panel.css";
import "./CounterClashPrompt.css";

function CounterCard({ offer, onDone }) {
  const { token } = useAuth();
  const [remaining, setRemaining] = useState(offer.windowMs);
  const [resolving, setResolving] = useState(false);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const left = offer.windowMs - (Date.now() - startRef.current);
      if (left <= 0) {
        clearInterval(interval);
        setRemaining(0);
        onDone();
      } else {
        setRemaining(left);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [offer, onDone]);

  async function respond(slugId) {
    if (resolving) return;
    setResolving(true);
    try {
      await fetch(`/api/combat/counters/${offer.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slugId }),
      });
    } catch {
      // server auto-resolves on timeout regardless
    } finally {
      onDone();
    }
  }

  // The number key for a slug is its magazine slot (slot 1 -> "1"), the same
  // number shown on that slug in the combat slug panel -- so the muscle
  // memory carries over. Escape takes the hit. Only wired up for the window,
  // same as the panel -- this prompt has no particular element to focus.
  const hotkeyFor = (s, i) => (Number.isInteger(s.magazineSlot) ? s.magazineSlot + 1 : i + 1);
  const respondRef = useRef(respond);
  respondRef.current = respond;
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") {
        respondRef.current(null);
        return;
      }
      const num = Number(e.key);
      if (!Number.isInteger(num) || num < 1 || num > 9) return;
      const slug = offer.eligibleSlugs.find((s, i) => hotkeyFor(s, i) === num);
      if (!slug) return;
      respondRef.current(slug.id);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [offer]);

  const percent = Math.max(0, Math.min(100, (remaining / offer.windowMs) * 100));

  return (
    <div className="counter-prompt-card">
      <div className="counter-prompt-head">
        <span className="counter-prompt-icon">
          <ShieldWarningIcon weight="duotone" />
        </span>
        <div>
          <p className="counter-prompt-kicker">
            {offer.attackerName} fires {offer.slugName}
            {offer.forNpc && offer.defenderName ? ` at ${offer.defenderName}` : ""}!
          </p>
          <h3 className="counter-prompt-title">
            {offer.forNpc ? `Counter for ${offer.defenderName || "the NPC"}?` : "Counter with a slug?"}
          </h3>
          {offer.availableAp != null && (
            <p className="counter-prompt-ap">{offer.availableAp} AP left to spend on a counter</p>
          )}
        </div>
        <button type="button" className="counter-prompt-close" onClick={() => respond(null)} aria-label="No counter">
          <XIcon weight="bold" />
        </button>
      </div>

      <div className="counter-prompt-timer">
        <div className="counter-prompt-timer-fill" style={{ transform: `scaleX(${percent / 100})` }} />
      </div>

      <div className="counter-prompt-slugs">
        {offer.eligibleSlugs.map((s, i) => {
          const hotkey = hotkeyFor(s, i);
          return (
            <button
              key={s.id}
              type="button"
              className="counter-prompt-slug"
              style={{ "--type-color": typeColor(s.type) }}
              disabled={resolving}
              onClick={() => respond(s.id)}
            >
              {hotkey <= 9 && <span className="counter-prompt-slug-key">{hotkey}</span>}
              <span className="counter-prompt-slug-name">{s.name}</span>
              <span className="counter-prompt-slug-type">{s.type}</span>
              <span className="counter-prompt-slug-stats">
                PWR {s.clashPower} / DEF {s.clashDefense}
                {s.apCost != null && ` · ${s.apCost} AP`}
              </span>
            </button>
          );
        })}
      </div>

      <button type="button" className="panel-btn panel-btn--ghost counter-prompt-skip" disabled={resolving} onClick={() => respond(null)}>
        Take the hit <span className="counter-prompt-slug-key">Esc</span>
      </button>
    </div>
  );
}

export default function CounterClashPrompt() {
  const { counterOffered } = useLiveState();
  const [offer, setOffer] = useState(null);

  useEffect(() => {
    if (!counterOffered) return;
    setOffer(counterOffered);
  }, [counterOffered]);

  if (!offer) return null;

  return (
    <div className="counter-prompt-stack">
      <CounterCard offer={offer} onDone={() => setOffer((prev) => (prev?.id === offer.id ? null : prev))} />
    </div>
  );
}
