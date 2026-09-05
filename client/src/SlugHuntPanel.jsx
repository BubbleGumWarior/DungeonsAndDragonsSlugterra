import { useEffect, useMemo, useState } from "react";
import { CompassIcon, QuestionIcon, XIcon, BinocularsIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { formatModifier } from "./characterData.js";
import { oddsByArea } from "./slugHuntOdds.json";
import "./Panel.css";
import "./SlugHuntPanel.css";

// The eight layers of the Deep, top to bottom.
const AREAS = [
  {
    name: "The Overcrust",
    description:
      "Grassland under a sky that isn't sky. Far overhead, light filters down through countless hairline cracks in stone, diffused into something dimmer and bluer than sunlight, so the whole layer sits in a permanent, gentle late-afternoon haze. Roots hang from the ceiling in places thick enough to mistake for trees, and where they've broken through, thin trickles of groundwater feed shallow puddles that never quite dry. The grass itself grows pale gold rather than green, starved of true sun, and hushes underfoot instead of rustling. Streams braid across the open ground toward low points, gathering into a scatter of ponds and one long, still lake. It's quiet in the way abandoned places are quiet — not empty, just holding its breath.",
  },
  {
    name: "The Throat",
    description:
      "No biome, just the way down — a vertical labyrinth of shafts, chimneys, and collapsed-in sinkholes connecting the Overcrust to the sea below. Walls here are raw and unweathered, water-slicked in places, bone-dry and crumbling in others. Sound behaves strangely: a dropped stone can echo for longer than it should, or vanish entirely into some larger cavity nobody can see. Faint light from above thins out fast, replaced by nothing at all within the first hundred feet of descent, and then, gradually, by something else — a cold, blue-green glow bleeding up from far below that has nothing to do with the sun.",
  },
  {
    name: "The Hollow Sea",
    description:
      "An ocean with no horizon, its ceiling the pale underside of the Overcrust's water table, glimpsed only when the surface calms enough to reflect it. The water itself is startlingly clear near the surface and impenetrably dark within a few dozen feet of depth, lit only by drifting clouds of bioluminescent plankton and the slow, cold pulses of things moving beneath. Rock spires break the surface at odd intervals, worn smooth, some large enough to stand on. The air smells of salt and stone. Waves here are slower and heavier than surface waves, as if the water itself is thicker, older, in less of a hurry.",
  },
  {
    name: "The Underroot",
    description:
      "Warmth, humidity, and a canopy made of roots rather than branches — the Overcrust's own root systems, grown vast and tangled, forming a living ceiling threaded with hanging vines and moss. Warm ponds steam gently in clearings, ringed by broad-leafed plants that seem to lean toward any moving heat source. Light is scarce and green-gold, filtered through root-gaps rather than open sky, giving the whole layer a permanent dappled dimness. Sound carries strangely well here — a call from one side of a clearing reaches the other with unnerving clarity — and something is always rustling just out of sight, close enough to notice, never close enough to see.",
  },
  {
    name: "The Rift Peaks",
    description:
      "The ground tilts upward into genuine mountains, jagged and grey, riddled with fissures that breathe faint heat into the air. This is the first layer where warmth stops being pleasant and starts being present — hot springs pool in the folds between ridges, steam curling off their surfaces even in the colder passes above them. Wind moves through the peaks in low, constant moans, funneled by the rock into something almost like a voice. Visibility is good but the terrain is brutal: narrow ledges, loose scree, sudden drops. At night — if there is a night here — the springs glow faintly from mineral deposits, the only warm light in an otherwise cold, hard landscape.",
  },
  {
    name: "The Steam Barrens",
    description:
      "A flat, cracked expanse where the ground itself seems to be under pressure — geysers erupt without warning, sheets of scalding vapor roll low across the terrain, and the air is thick enough to fog goggles and swallow sound. Visibility rarely extends more than a few dozen feet. The rock underfoot is stained white and orange with mineral crust, brittle in places, treacherously hollow in others. Everything here is loud, wet-hot, and disorienting — the Barrens don't attack so much as they simply make it very hard to know where you're standing until the ground reminds you.",
  },
  {
    name: "The Emberdeep",
    description:
      "The last livable layer, and it looks it. The ceiling glows faint orange from heat bleeding through from below, and rivers of slow-moving lava carve the landscape into black, glassy ridges and stark red seams. Ash drifts in the air like snow that never lands. The heat here isn't a spike, it's a constant, oppressive weight, thick enough to taste. Structures — natural or otherwise — cast long, wavering shadows in the heat-shimmer, and everything solid seems to creak faintly, as if the rock itself is being slowly cooked. It's beautiful in the way a wound can be beautiful: vivid, raw, and clearly not meant to be lingered in.",
  },
  {
    name: "The Core",
    description:
      "Below the lava, silence — not the tense quiet of the Overcrust, but something older and stranger. The heat drops here, inexplicably, replaced by a cool, mineral stillness. The cavern opens into a space too vast for any light source to fully reveal, its true ceiling and walls lost in darkness beyond the reach of torchlight. Faint bioluminescent veins run through the stone like exposed nerves, pulsing slowly, unhurried, on a rhythm that doesn't match anything human. The air itself feels attended to — not empty, not hostile, just deeply, patiently aware. Nothing here needs to move quickly, because nothing here has anywhere else to be.",
  },
];

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
          <p>Odds of finding slugs at the party's location</p>
        </div>
      </div>

      <div className="panel-body">
        {isDungeonMaster ? (
          <div className="panel-field">
            <label>Party Location</label>
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
            <span>Current Location</span>
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
              ? "No slugs are listed for this area."
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
            <p className="slughunt-area-modal-body">{area.description}</p>
          </div>
        </div>
      )}
    </div>
  );
}
