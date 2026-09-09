import { useEffect, useMemo, useState } from "react";
import { CompassIcon, QuestionIcon, XIcon, BinocularsIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { formatModifier } from "./characterData.js";
import { oddsByArea } from "./slugHuntOdds.json";
import { PLANETS } from "./planetData.js";
import "./Panel.css";
import "./SlugHuntPanel.css";

// The party hunts on one of the system's eight charted worlds -- shared with
// the Galaxy Map (see planetData.js). The index is campaign_settings
// .slug_hunt_area, kept in sync with slugHuntOdds.json's `areas`.
const AREAS = PLANETS;

export default function SlugHuntPanel({ isDungeonMaster = false }) {
  const { token, user } = useAuth();
  const { slugpediaUpdate, slugHuntArea, slugHuntResolved, slugHuntLock } = useLiveState();
  const [infoOpen, setInfoOpen] = useState(false);
  const areaIndex = Math.min(Math.max(slugHuntArea ?? 0, 0), AREAS.length - 1);
  const area = AREAS[areaIndex];

  // "Try Hunt" (players only): d20 + Survival, rolled server-side. One attempt
  // per rest -- `locked` until the DM's next Heal All. On a success the DM is
  // prompted to approve the slug it turns up.
  const [hunt, setHunt] = useState(null); // { state: 'rolling'|'fail'|'pending'|'found'|'dismissed'|'error', ... }
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (isDungeonMaster || !token) return;
    let cancelled = false;
    fetch("/api/slug-hunt/status", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setLocked(Boolean(data.locked));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isDungeonMaster, token]);

  useEffect(() => {
    if (!slugHuntLock) return;
    if (slugHuntLock.all) {
      setLocked(false);
      setHunt(null);
    } else if (slugHuntLock.userId === user?.id) {
      setLocked(Boolean(slugHuntLock.locked));
    }
  }, [slugHuntLock, user?.id]);

  useEffect(() => {
    if (!slugHuntResolved || !hunt || hunt.state !== "pending") return;
    if (slugHuntResolved.outcome === "found") {
      setHunt({ state: "found", slugName: slugHuntResolved.slugName, slugType: slugHuntResolved.slugType });
    } else if (slugHuntResolved.outcome === "dismissed") {
      setHunt({ state: "dismissed" });
    }
  }, [slugHuntResolved]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setArea(nextIndex) {
    try {
      await fetch("/api/settings/slug-hunt-area", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ area: nextIndex }),
      });
    } catch {
      /* the broadcast is the source of truth; a failed write just no-ops */
    }
  }

  async function tryHunt() {
    if (hunt?.state === "rolling" || hunt?.state === "pending") return;
    setHunt({ state: "rolling" });
    try {
      const res = await fetch("/api/slug-hunt/attempt", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not attempt the hunt.");
      setLocked(true);
      if (data.success) {
        setHunt({
          state: "pending",
          roll: data.roll,
          modifier: data.modifier,
          total: data.total,
          pityBreak: data.pityBreak,
        });
      } else {
        setHunt({ state: "fail", roll: data.roll, modifier: data.modifier, total: data.total });
      }
    } catch (err) {
      setHunt({ state: "error", message: err.message });
    }
  }

  // Players only see odds for slugs the party has recorded in the Slugpedia;
  // the DM sees the full table. `null` = not loaded yet.
  const [knownNames, setKnownNames] = useState(null);

  useEffect(() => {
    if (isDungeonMaster || !token) return;
    let cancelled = false;
    fetch("/api/slugpedia", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setKnownNames(new Set((data.entries || []).map((e) => e.name)));
      })
      .catch(() => {
        if (!cancelled) setKnownNames(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [isDungeonMaster, token, slugpediaUpdate]);

  // Draft odds from docs/slug-hunt-odds.md — each area is a distribution summing to 100%.
  const allOdds = oddsByArea[area.name] ?? [];
  const odds = useMemo(() => {
    if (isDungeonMaster) return allOdds;
    if (!knownNames) return [];
    return allOdds.filter((slug) => knownNames.has(slug.name));
  }, [isDungeonMaster, allOdds, knownNames]);
  const topChance = odds.length ? Math.max(...odds.map((s) => s.chance)) : 1;
  const loadingKnown = !isDungeonMaster && knownNames === null;

  return (
    <div className="panel panel--quiet slughunt-panel">
      <div className="panel-header">
        <span className="panel-header-icon">
          <CompassIcon weight="duotone" />
        </span>
        <div className="panel-header-text">
          <h2>Slug Hunt</h2>
          <p>Odds of finding slugs on the party's current planet</p>
        </div>
      </div>

      <div className="panel-body">
        {isDungeonMaster ? (
          <div className="panel-field">
            <label>Party Planet</label>
            <div className="slughunt-area-picker">
              <select
                value={areaIndex}
                onChange={(e) => setArea(Number(e.target.value))}
              >
                {AREAS.map((a, i) => (
                  <option key={a.name} value={i}>
                    {`${i + 1} — ${a.name}`}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="slughunt-info-btn"
                aria-label={`About ${area.name}`}
                title={`About ${area.name}`}
                onClick={() => setInfoOpen(true)}
              >
                <QuestionIcon weight="bold" />
              </button>
            </div>
          </div>
        ) : (
          <div className="slughunt-location">
            <span>Current Planet</span>
            <span className="slughunt-location-name">
              <strong>{area.name}</strong>
              <button
                type="button"
                className="slughunt-info-btn"
                aria-label={`About ${area.name}`}
                title={`About ${area.name}`}
                onClick={() => setInfoOpen(true)}
              >
                <QuestionIcon weight="bold" />
              </button>
            </span>
          </div>
        )}

        {loadingKnown ? (
          <p className="panel-empty">Loading your Slugpedia…</p>
        ) : odds.length === 0 ? (
          <p className="panel-empty">
            {isDungeonMaster
              ? "No slugs are listed for this planet."
              : "None of the slugs in your Slugpedia turn up here — discover more to see their odds."}
          </p>
        ) : (
          <div className="slughunt-list">
            {odds.map((slug) => (
              <div key={slug.name} className="slughunt-row">
                <span className="slughunt-name" title={`${slug.name} · ${slug.type}`}>
                  {slug.name}
                </span>
                <div className="slughunt-bar-track">
                  <div
                    className="slughunt-bar-fill"
                    style={{ "--fill": Math.max(slug.chance / topChance, 0.02) }}
                  />
                </div>
                <span className="slughunt-chance">{slug.chance}%</span>
              </div>
            ))}
          </div>
        )}

        {!isDungeonMaster && (
          <div className="slughunt-hunt">
            <button
              type="button"
              className="panel-btn slughunt-hunt-btn"
              onClick={tryHunt}
              disabled={locked || hunt?.state === "rolling" || hunt?.state === "pending"}
            >
              <BinocularsIcon weight="bold" />
              {hunt?.state === "rolling"
                ? "Rolling…"
                : hunt?.state === "pending"
                ? "Waiting for the DM…"
                : locked
                ? "Already hunted this rest"
                : "Try Hunt"}
            </button>

            {locked && !hunt && (
              <p className="slughunt-hunt-result">
                You've used your hunt for now — it refreshes when the party rests.
              </p>
            )}

            {hunt?.state === "fail" && (
              <p className="slughunt-hunt-result">
                Rolled <strong>{hunt.total}</strong> ({hunt.roll} {formatModifier(hunt.modifier)} Survival) — nothing
                turned up this time.
              </p>
            )}
            {hunt?.state === "pending" && (
              <p className="slughunt-hunt-result">
                {hunt.pityBreak ? (
                  <>Your instincts finally catch a break — </>
                ) : (
                  <>
                    Rolled <strong>{hunt.total}</strong> ({hunt.roll} {formatModifier(hunt.modifier)} Survival) —{" "}
                  </>
                )}
                something's out there. The DM is confirming what you found.
              </p>
            )}
            {hunt?.state === "found" && (
              <p className="slughunt-hunt-result slughunt-hunt-result--good">
                You found a wild <strong>{hunt.slugName}</strong> ({hunt.slugType})! It's been logged in the Slugpedia.
              </p>
            )}
            {hunt?.state === "dismissed" && (
              <p className="slughunt-hunt-result">The trail went cold — you found nothing this time.</p>
            )}
            {hunt?.state === "error" && <p className="panel-error">{hunt.message}</p>}
          </div>
        )}
      </div>

      {infoOpen && (
        <div className="slughunt-modal-backdrop" onClick={() => setInfoOpen(false)}>
          <div
            className="slughunt-area-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="slughunt-area-modal-close"
              aria-label="Close"
              onClick={() => setInfoOpen(false)}
            >
              <XIcon weight="bold" />
            </button>
            <h2>{`${areaIndex + 1} — ${area.name}`}</h2>
            <p className="slughunt-area-modal-body">{area.blurb}</p>
          </div>
        </div>
      )}
    </div>
  );
}
