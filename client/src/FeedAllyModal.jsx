import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftIcon, BowlFoodIcon, CaretRightIcon, CircleDashedIcon, MinusIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { FOOD_MAX, distributeKibble, foodState, kibbleNeededAll } from "./careData.js";
import "./Panel.css";
import "./BarterModal.css";
import "./SlugCare.css";
import "./FeedAllyModal.css";

// Feed Ally Slugs: look after a friend who missed the session. Pick a
// character, pick how many scoops of your own kibble to spend, and the server
// hands them out one at a time to whichever of their slugs is hungriest.
// `perScoop` is what one scoop restores in the feeder's hands.
export default function FeedAllyModal({ kibble, perScoop, onClose, onFed }) {
  const { token } = useAuth();
  const [allies, setAllies] = useState(null);
  const [allyId, setAllyId] = useState(null);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/slugs/allies", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not load your allies.");
        if (!cancelled) setAllies(data.allies || []);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const ally = allies?.find((a) => a.userId === allyId) ?? null;
  const needed = ally ? kibbleNeededAll(ally.slugs, perScoop) : 0;
  const maxSpend = Math.min(needed, kibble);
  const spend = Math.max(0, Math.min(count, maxSpend));
  // Hungriest first, so the preview reads in the order the scoops go out.
  const preview = useMemo(() => {
    if (!ally) return [];
    return distributeKibble(ally.slugs, spend, perScoop).sort((a, b) => (a.food ?? FOOD_MAX) - (b.food ?? FOOD_MAX));
  }, [ally, spend, perScoop]);

  function choose(a) {
    setAllyId(a.userId);
    setCount(Math.min(kibbleNeededAll(a.slugs, perScoop), kibble));
    setError(null);
  }

  async function feed() {
    if (!ally || spend < 1) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/slugs/feed-ally", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: ally.userId, count: spend }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not feed those slugs.");
      setResult(data);
      onFed?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Portalled to <body>: Slug Care's panel is its own stacking context, so
  // inline the Pack panel above it would paint through the card.
  return createPortal(
    <div className="barter-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="barter-card feed-ally" role="dialog" aria-modal="true" aria-labelledby="feed-ally-title">
        <button type="button" className="barter-close" onClick={onClose} aria-label="Close" disabled={busy}>
          <XIcon weight="bold" />
        </button>
        <div className="barter-head">
          <span className="barter-head-icon">
            <BowlFoodIcon weight="duotone" />
          </span>
          <div>
            <p className="barter-kicker">Feed Ally Slugs</p>
            <h3 id="feed-ally-title" className="barter-title">
              {ally ? `${ally.name}'s slugs` : "Choose an ally"}
            </h3>
            <p className="feed-ally-sub">
              Your Slug Kibble <strong className="num-tabular">×{kibble}</strong> · one scoop restores{" "}
              <strong className="num-tabular">{perScoop}%</strong>
            </p>
          </div>
        </div>

        {error && <p className="panel-error">{error}</p>}

        {result ? (
          <div className="feed-ally-body">
            <p className="feed-ally-done" role="status">
              You spent {result.spent} {result.spent === 1 ? "scoop" : "scoops"} on {ally?.name}'s slugs.
            </p>
            <ul className="feed-ally-preview">
              {result.fed.map((f) => (
                <li key={f.slugId} className="feed-ally-preview-row">
                  <span className="feed-ally-slug-name">{f.name}</span>
                  <span className="feed-ally-change num-tabular">
                    {f.from}% → <strong>{f.to}%</strong>
                  </span>
                  <span className="feed-ally-scoops num-tabular">+{f.scoops}</span>
                </li>
              ))}
            </ul>
            <button type="button" className="panel-btn barter-done" onClick={onClose}>
              Done
            </button>
          </div>
        ) : !ally ? (
          <div className="feed-ally-body">
            {allies === null && !error ? (
              <p className="feed-ally-empty">Loading the party…</p>
            ) : allies?.length === 0 ? (
              <p className="feed-ally-empty">There's nobody else in the party to feed for.</p>
            ) : (
              <ul className="feed-ally-list">
                {allies?.map((a) => {
                  const need = kibbleNeededAll(a.slugs, perScoop);
                  const hungry = a.slugs.filter((s) => (s.food ?? FOOD_MAX) < FOOD_MAX).length;
                  const lowest = a.slugs.reduce((min, s) => Math.min(min, s.food ?? FOOD_MAX), FOOD_MAX);
                  const tone = a.slugs.length ? foodState(lowest).tone : "good";
                  return (
                    <li key={a.userId}>
                      <button type="button" className="feed-ally-pick" disabled={need === 0} onClick={() => choose(a)}>
                        <span className="feed-ally-pick-text">
                          <span className="feed-ally-pick-name">{a.name}</span>
                          <span className={`feed-ally-pick-meta feed-ally-tone--${tone}`}>
                            {a.slugs.length === 0
                              ? "No slugs"
                              : need === 0
                                ? `${a.slugs.length} ${a.slugs.length === 1 ? "slug" : "slugs"}, all full`
                                : `${hungry} of ${a.slugs.length} hungry · hungriest at ${lowest}%`}
                          </span>
                        </span>
                        {need > 0 && (
                          <span className="feed-ally-pick-need num-tabular">
                            {need} <small>{need === 1 ? "scoop" : "scoops"}</small>
                          </span>
                        )}
                        <CaretRightIcon weight="bold" className="feed-ally-pick-caret" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="feed-ally-body">
            <p className="feed-ally-need">
              Filling all of {ally.name}'s slugs takes <strong className="num-tabular">{needed}</strong>{" "}
              {needed === 1 ? "scoop" : "scoops"}
              {kibble < needed ? (
                <>
                  . You have <strong className="num-tabular">{kibble}</strong>.
                </>
              ) : (
                "."
              )}
            </p>

            <div className="feed-ally-amount">
              <button
                type="button"
                className="feed-ally-step"
                aria-label="One scoop fewer"
                disabled={busy || spend <= 1}
                onClick={() => setCount(Math.max(1, spend - 1))}
              >
                <MinusIcon weight="bold" />
              </button>
              <input
                type="number"
                className="feed-ally-input num-tabular"
                aria-label="Scoops to feed"
                min={1}
                max={Math.max(1, maxSpend)}
                value={spend}
                disabled={busy || maxSpend < 1}
                onChange={(e) => setCount(Math.trunc(Number(e.target.value) || 0))}
              />
              <button
                type="button"
                className="feed-ally-step"
                aria-label="One scoop more"
                disabled={busy || spend >= maxSpend}
                onClick={() => setCount(spend + 1)}
              >
                <PlusIcon weight="bold" />
              </button>
              <button
                type="button"
                className="panel-btn panel-btn--ghost slug-care-btn"
                disabled={busy || spend === maxSpend}
                onClick={() => setCount(maxSpend)}
              >
                {maxSpend === needed ? "Fill all" : "All I have"}
              </button>
            </div>

            <p className="feed-ally-hint">Each scoop goes to whichever slug is hungriest at that moment.</p>
            <ul className="feed-ally-preview" aria-label="What each slug will get">
              {preview.map((s) => {
                const before = s.food ?? FOOD_MAX;
                const state = foodState(s.after);
                return (
                  <li key={s.id} className={`feed-ally-preview-row slug-care-row--${state.tone}`}>
                    <span className="slug-care-thumb feed-ally-thumb">
                      {s.protoformImage ? (
                        <img src={s.protoformImage} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <CircleDashedIcon weight="duotone" />
                      )}
                    </span>
                    <span className="feed-ally-slug">
                      <span className="feed-ally-slug-name">{s.name}</span>
                      <span className="slug-care-meter" role="meter" aria-label={`${s.name}'s food after feeding`} aria-valuemin={0} aria-valuemax={FOOD_MAX} aria-valuenow={s.after}>
                        <span className="slug-care-meter-fill" style={{ transform: `scaleX(${s.after / FOOD_MAX})` }} />
                      </span>
                    </span>
                    <span className="feed-ally-change num-tabular">
                      {s.scoops > 0 ? (
                        <>
                          {before}% → <strong>{s.after}%</strong>
                        </>
                      ) : (
                        <strong>{before}%</strong>
                      )}
                    </span>
                    <span className="feed-ally-scoops num-tabular">{s.scoops > 0 ? `+${s.scoops}` : ""}</span>
                  </li>
                );
              })}
            </ul>

            <div className="feed-ally-actions">
              <button type="button" className="panel-btn panel-btn--ghost" disabled={busy} onClick={() => setAllyId(null)}>
                <ArrowLeftIcon weight="bold" />
                Back
              </button>
              <button type="button" className="panel-btn" disabled={busy || spend < 1} onClick={feed}>
                {busy ? "Feeding…" : kibble < 1 ? "No kibble left" : `Feed ${spend} ${spend === 1 ? "scoop" : "scoops"}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
