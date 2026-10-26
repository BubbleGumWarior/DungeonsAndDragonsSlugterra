import { useEffect, useRef, useState } from "react";
import {
  MoonStarsIcon,
  RocketLaunchIcon,
  SkullIcon,
  StorefrontIcon,
  WarningIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { PLANETS } from "./planetData.js";
import { LOYALTY_TIER_LABELS } from "./slugData.js";
import { FOOD_DRAIN_PER_REST } from "./careData.js";
import "./LongRestOverlay.css";

const AUTO_CLOSE_MS = 5200;
// How long the dawn fade lasts -- keep in step with rest-dawn in the CSS.
const WAKE_MS = 1100;

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");

// What the night cost, in words a player can act on.
function describeEvent(event, who) {
  const owner = who ? `${event.ownerName ?? "A player"}'s ` : "";
  switch (event.kind) {
    case "starving": {
      const penalty = event.tier <= 0 ? "leave for good" : "lose loyalty";
      return {
        tone: "warn",
        icon: <WarningIcon weight="fill" />,
        text: who
          ? `${owner}${event.slugName} is starving and will ${penalty} at the next long rest unless fed.`
          : `${event.slugName} is starving. Feed it before the next long rest or it will ${penalty}.`,
      };
    }
    case "loyalty":
      return {
        tone: "bad",
        icon: <WarningIcon weight="fill" />,
        text: `${owner}${event.slugName} went hungry. Its loyalty fell to ${LOYALTY_TIER_LABELS[event.toTier]}.`,
      };
    case "left":
      return {
        tone: "bad",
        icon: <SkullIcon weight="fill" />,
        text: `${owner}${event.slugName} was starving with no loyalty left to lose, and has left.`,
      };
    default:
      return null;
  }
}

// The ship's news from the night: the voyage and any compartments that moved
// on. Same for everyone, so it lives outside the per-player consequences.
function shipNews(day) {
  if (!day) return [];
  const lines = [];
  const world = (i) => PLANETS[i]?.name ?? "its destination";
  if (day.travel?.status === "arrived") {
    lines.push({ key: "arrived", icon: <RocketLaunchIcon weight="bold" />, text: `The ship has landed at ${world(day.travel.destination)}.` });
  } else if (day.travel?.status === "underway") {
    const left = day.travel.daysLeft;
    lines.push({
      key: "underway",
      icon: <RocketLaunchIcon weight="bold" />,
      text: `${left} ${left === 1 ? "day" : "days"} to ${world(day.travel.destination)}.`,
    });
  }
  for (const b of day.builds || []) {
    const text = b.completed
      ? `${b.label || "A compartment"} is finished and online.`
      : b.stalled
      ? `${b.label || "A compartment"} is stalled: nobody is engineering it while the ship is under way.`
      : `${b.label || "A compartment"}: ${b.progress} of ${b.buildDays} days built.`;
    lines.push({ key: `build-${b.label}-${b.progress}`, icon: <WrenchIcon weight="bold" />, text });
  }
  return lines;
}

// The whole table sees the party go to sleep, once. A player is told what their
// own slugs suffered; the DM sees everyone's, plus the merchants' new mood.
export default function LongRestOverlay() {
  const { token, user } = useAuth();
  const { longRest, markRestWoken } = useLiveState();
  const [shown, setShown] = useState(null);
  const [waking, setWaking] = useState(false);
  const buttonRef = useRef(null);
  const wakeTimer = useRef(null);
  const isDM = user?.role === "Dungeon Master";

  useEffect(() => {
    if (!token || !longRest) return;
    clearTimeout(wakeTimer.current);
    setWaking(false);
    setShown(longRest);
  }, [token, longRest]);

  useEffect(() => () => clearTimeout(wakeTimer.current), []);

  // Waking up fades the room back to light before the overlay is removed.
  function wake() {
    if (waking) return;
    markRestWoken();
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setShown(null);
      return;
    }
    setWaking(true);
    wakeTimer.current = setTimeout(() => {
      setShown(null);
      setWaking(false);
    }, WAKE_MS);
  }

  const rows = shown
    ? shown.slugEvents
        .filter((e) => isDM || e.userId === user?.id)
        .map((e) => ({ key: `${e.kind}-${e.slugId}`, ...describeEvent(e, isDM) }))
        .filter((r) => r.text)
    : [];
  const mood = shown?.marketMood;
  const news = shown ? shipNews(shown.day) : [];
  const hasConsequences = rows.length > 0;

  useEffect(() => {
    if (!shown) return undefined;
    buttonRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && wake();
    window.addEventListener("keydown", onKey);
    const timer = hasConsequences ? null : setTimeout(wake, AUTO_CLOSE_MS);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [shown, hasConsequences]);

  if (!token || !shown) return null;

  return (
    <div
      className={`rest-overlay${waking ? " rest-overlay--waking" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rest-title"
      onMouseDown={(e) => e.target === e.currentTarget && wake()}
    >
      <div className="rest-card">
        <span className="rest-moon" aria-hidden="true">
          <MoonStarsIcon weight="duotone" />
        </span>
        <h2 id="rest-title" className="rest-title">
          The party sleeps
        </h2>
        <p className="rest-sub">
          {shown.rested > 0
            ? `Grit is restored and every slug is recharged, though each lost ${FOOD_DRAIN_PER_REST}% of its food.`
            : "Nobody was free to rest -- everyone is still in the fight."}
        </p>

        {hasConsequences && (
          <ul className="rest-events">
            {rows.map((r) => (
              <li key={r.key} className={`rest-event rest-event--${r.tone}`}>
                {r.icon}
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
        )}

        {shown.day?.day != null && <p className="rest-sub">Day {shown.day.day}</p>}
        {news.map((n) => (
          <p key={n.key} className="rest-mood">
            {n.icon}
            <span>{n.text}</span>
          </p>
        ))}

        {isDM && mood && (
          <p className="rest-mood">
            <StorefrontIcon weight="bold" />
            <span>
              Merchants wake up <strong>{cap(mood.key)}</strong>
              {mood.pct !== 0 &&
                ` (${mood.pct > 0 ? "+" : "−"}${Math.abs(mood.pct)}% on prices)`}
              .
            </span>
          </p>
        )}

        <button ref={buttonRef} type="button" className="rest-wake" onClick={wake} disabled={waking}>
          Wake up
        </button>
      </div>
    </div>
  );
}
