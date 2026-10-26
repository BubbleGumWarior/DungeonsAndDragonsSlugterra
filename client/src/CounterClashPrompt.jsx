import { useEffect, useRef, useState } from "react";
import { LightningIcon, PersonSimpleRunIcon, ShieldIcon, ShieldWarningIcon, SwordIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { typeColor } from "./slugData.js";
import { prefetchSlugImage } from "./slugImageCache.js";
import { useSlugImage } from "./useSlugImage.js";
import "./Panel.css";
import "./CounterClashPrompt.css";

// `primary` marks the one card the keyboard shortcuts answer: with several
// shooters firing at once there can be a few prompts up together, and a key
// press should only ever answer one of them.
function CounterCard({ offer, onDone, primary = true }) {
  const { token } = useAuth();
  // The offer arrives already `elapsedMs` into the window (the server's clock
  // at send time), so the bar starts there and the reaction time reported back
  // is measured on that same clock: elapsedMs + time since receipt. That keeps
  // network delay out of the player's window -- the server judges the click by
  // when it was made, not by when the request got there.
  const elapsedAtReceipt = offer.elapsedMs > 0 ? offer.elapsedMs : 0;
  const [remaining, setRemaining] = useState(offer.windowMs - elapsedAtReceipt);
  const [resolving, setResolving] = useState(false);
  const startRef = useRef(performance.now());
  // The prompt only appears once the shot's windup is over -- until the slug
  // has left the barrel and transformed there's nothing to identify yet. The
  // countdown below still runs from the moment the offer arrived (the real
  // window isn't extended), so a late reveal shows an already part-spent bar.
  // A window that ends before the windup does never reveals at all.
  const [revealed, setRevealed] = useState(() => !(offer.revealAfterMs > 0));
  useEffect(() => {
    if (revealed) return undefined;
    const timeout = setTimeout(() => setRevealed(true), offer.revealAfterMs);
    return () => clearTimeout(timeout);
  }, [revealed, offer]);
  // The incoming slug's transformed art -- normally already cached (see
  // CounterClashPrompt below), so this is a synchronous hit with no flash.
  const incomingImage = useSlugImage(offer.slugId, token);
  // A dual shot brings a second slug -- shown alongside the first.
  const partnerImage = useSlugImage(offer.partnerSlugId, token);
  const isDual = offer.partnerSlugId != null;

  useEffect(() => {
    const interval = setInterval(() => {
      const left = offer.windowMs - elapsedAtReceipt - (performance.now() - startRef.current);
      if (left <= 0) {
        clearInterval(interval);
        setRemaining(0);
        onDone();
      } else {
        setRemaining(left);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [offer, onDone, elapsedAtReceipt]);

  async function respond(slugId, { dodge = false } = {}) {
    if (resolving) return;
    setResolving(true);
    const reactedAtMs = Math.round(elapsedAtReceipt + (performance.now() - startRef.current));
    try {
      await fetch(`/api/combat/counters/${offer.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(dodge ? { dodge: true, reactedAtMs } : { slugId, reactedAtMs }),
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
    if (!revealed || !primary) return undefined; // no responding to a prompt nobody can see yet
    // Flags the prompt as open on the body so VoiceChatContext's push-to-talk
    // spacebar handler can back off -- Dodge's own hotkey is Space too.
    document.body.dataset.counterPromptOpen = "true";
    function onKeyDown(e) {
      if (e.key === "Escape") {
        respondRef.current(null);
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        if (offer.canDodge) respondRef.current(null, { dodge: true });
        return;
      }
      const num = Number(e.key);
      if (!Number.isInteger(num) || num < 1 || num > 9) return;
      const slug = offer.eligibleSlugs.find((s, i) => hotkeyFor(s, i) === num);
      if (!slug) return;
      respondRef.current(slug.id);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      delete document.body.dataset.counterPromptOpen;
    };
  }, [offer, revealed, primary]);

  const percent = Math.max(0, Math.min(100, (remaining / offer.windowMs) * 100));

  if (!revealed) return null;

  // Seen for a few seconds at a time, so it's built to be read at a glance:
  // what's coming (art + name), how long is left, then big one-key answers
  // with numbers and icons instead of sentences.
  const target = offer.forNpc && offer.defenderName ? offer.defenderName : null;
  const urgent = percent <= 35;
  const title = offer.slugName || offer.primarySlugName;

  return (
    <section
      className={`counter-card ${primary ? "" : "counter-card--queued"} ${urgent ? "counter-card--urgent" : ""}`}
      role="alertdialog"
      aria-label={`${offer.attackerName} fires ${title}`}
    >
      <div className="counter-timer" aria-hidden="true">
        <div className="counter-timer-fill" style={{ transform: `scaleX(${percent / 100})` }} />
      </div>

      <header className="counter-head">
        {incomingImage ? (
          <span className="counter-portraits">
            <span className="counter-portrait" style={{ "--type-color": typeColor(offer.slugType) }}>
              <img src={incomingImage} alt="" />
            </span>
            {isDual && partnerImage && (
              <span className="counter-portrait counter-portrait--second" style={{ "--type-color": typeColor(offer.secondaryType) }}>
                <img src={partnerImage} alt="" />
              </span>
            )}
          </span>
        ) : (
          <span className="counter-portrait counter-portrait--empty">
            <ShieldWarningIcon weight="duotone" />
          </span>
        )}

        <div className="counter-incoming">
          <h3 className="counter-title">{title}</h3>
          <p className="counter-from">
            <span className="counter-type" style={{ "--type-color": typeColor(offer.slugType) }}>
              {offer.slugType}
            </span>
            <span className="counter-from-name">
              {offer.attackerName}
              {target ? ` → ${target}` : ""}
            </span>
          </p>
          {(offer.mega || offer.comboName || (isDual && offer.comboSummary)) && (
            <p className="counter-tags">
              {offer.mega && <span className="counter-tag counter-tag--mega">Mega</span>}
              {(offer.comboName || (isDual && offer.comboSummary)) && (
                <span className="counter-tag counter-tag--combo" title={offer.comboSummary || undefined}>
                  {offer.comboName || "Dual shot"}
                </span>
              )}
            </p>
          )}
        </div>

        <span className="counter-clock num-tabular" aria-hidden="true">
          {(Math.max(0, remaining) / 1000).toFixed(1)}
        </span>
      </header>

      <div className="counter-options">
        {offer.canDodge && (
          <button type="button" className="counter-option counter-option--dodge" disabled={resolving} onClick={() => respond(null, { dodge: true })}>
            <span className="counter-key counter-key--wide">Space</span>
            <span className="counter-option-name">
              <PersonSimpleRunIcon weight="bold" aria-hidden="true" />
              Dodge
            </span>
            <span className="counter-option-meta">
              <span className="counter-stat" title="AP cost">
                <LightningIcon weight="fill" aria-label="AP" />
                {offer.dodgeApCost}
              </span>
            </span>
          </button>
        )}
        {offer.eligibleSlugs.map((s, i) => {
          const hotkey = hotkeyFor(s, i);
          return (
            <button
              key={s.id}
              type="button"
              className="counter-option"
              style={{ "--type-color": typeColor(s.type) }}
              disabled={resolving}
              onClick={() => respond(s.id)}
              title={s.type}
            >
              {hotkey <= 9 && <span className="counter-key">{hotkey}</span>}
              <span className="counter-option-name">
                <span className="counter-dot" aria-hidden="true" />
                {s.name}
              </span>
              <span className="counter-option-meta">
                <span className="counter-stat" title="Clash power">
                  <SwordIcon weight="fill" aria-label="Power" />
                  {s.clashPower}
                </span>
                <span className="counter-stat" title="Clash defense">
                  <ShieldIcon weight="fill" aria-label="Defense" />
                  {s.clashDefense}
                </span>
                {s.apCost != null && (
                  <span className="counter-stat" title="AP cost">
                    <LightningIcon weight="fill" aria-label="AP" />
                    {s.apCost}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <button type="button" className="counter-skip" disabled={resolving} onClick={() => respond(null)}>
        Skip <span className="counter-key counter-key--wide">Esc</span>
      </button>
    </section>
  );
}

export default function CounterClashPrompt() {
  const { token } = useAuth();
  const { counterOffers, slugArmed, shotFx } = useLiveState();
  // Teammates acting at the same time can all fire on one defender, so there
  // may be several offers open together. They stack, oldest on top, and the
  // defender answers whichever they can -- the rest run out and land.
  const [offers, setOffers] = useState([]);
  const shownIds = useRef(new Set());

  // Warm the incoming slug's art as early as possible so the counter window
  // never waits on it: when a shooter merely picks a slug (before choosing a
  // target), and again when the shot actually launches as a second chance if
  // that first signal was missed. Everyone connected does this, not just
  // whoever ends up being shot at -- nobody knows the target yet.
  useEffect(() => {
    if (slugArmed) prefetchSlugImage(slugArmed.slugId, token);
  }, [slugArmed, token]);
  useEffect(() => {
    if (shotFx?.slugId != null) prefetchSlugImage(shotFx.slugId, token);
    if (shotFx?.partnerSlugId != null) prefetchSlugImage(shotFx.partnerSlugId, token);
  }, [shotFx, token]);

  useEffect(() => {
    if (!counterOffers?.length) return;
    const fresh = counterOffers.filter((o) => !shownIds.current.has(o.id));
    if (fresh.length === 0) return;
    fresh.forEach((o) => shownIds.current.add(o.id));
    setOffers((prev) => [...prev, ...fresh]);
  }, [counterOffers]);

  // Space is Dodge's hotkey, and the browser's own Space scrolls the page to the
  // bottom. The card only swallows it once its windup reveal is over, and not
  // at all after it closes -- so a press before the reveal, or a held key still
  // repeating just after Dodge, would scroll. Cover the whole offer instead,
  // plus a short grace after it ends. (Text fields keep their spaces.)
  const spaceGuardUntil = useRef(0);
  const offerOpen = useRef(false);
  useEffect(() => {
    if (offers.length > 0) {
      offerOpen.current = true;
      return undefined;
    }
    if (offerOpen.current) {
      offerOpen.current = false;
      spaceGuardUntil.current = Date.now() + 1500;
    }
    return undefined;
  }, [offers.length]);
  useEffect(() => {
    function guard(e) {
      if (e.key !== " " && e.code !== "Space") return;
      if (!offerOpen.current && Date.now() > spaceGuardUntil.current) return;
      const el = e.target;
      if (el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      e.preventDefault();
    }
    window.addEventListener("keydown", guard);
    window.addEventListener("keyup", guard);
    return () => {
      window.removeEventListener("keydown", guard);
      window.removeEventListener("keyup", guard);
    };
  }, []);

  if (offers.length === 0) return null;

  return (
    <div className="counter-stack">
      {offers.map((offer, i) => (
        <CounterCard
          key={offer.id}
          offer={offer}
          primary={i === 0}
          onDone={() => setOffers((prev) => prev.filter((o) => o.id !== offer.id))}
        />
      ))}
    </div>
  );
}
