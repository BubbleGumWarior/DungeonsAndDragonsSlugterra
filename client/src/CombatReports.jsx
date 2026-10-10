import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  CrosshairIcon,
  CrownSimpleIcon,
  FirstAidKitIcon,
  LightningIcon,
  MedalIcon,
  ScrollIcon,
  ShieldCheckIcon,
  SkullIcon,
  SwordIcon,
  TargetIcon,
  TrophyIcon,
  WarningIcon,
  WindIcon,
} from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import NavBar from "./NavBar.jsx";
import { typeColor } from "./slugData.js";
import "./Panel.css";
import "./CombatReports.css";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const AWARD_ICONS = {
  heavy: SwordIcon,
  sharp: CrosshairIcon,
  big: LightningIcon,
  finisher: SkullIcon,
  wall: ShieldCheckIcon,
  slippery: WindIcon,
  medic: FirstAidKitIcon,
  clash: TrophyIcon,
  style: MedalIcon,
};

const VIA_LABELS = {
  direct: "Direct hits",
  counter: "Reflected counters",
  splash: "Blast & splash",
  chain: "Chain arcs",
  ricochet: "Ricochets",
  dot: "Burn & poison",
  hazard: "Hazard patches",
  pod: "Steam pods",
  star: "Star wall",
  cone: "Spike cones",
  ram: "Ramming",
};

const ACTION_LABELS = {
  reload: "Reload",
  "hunker-down": "Hunker Down",
  hide: "Hide",
  intimidate: "Intimidate",
  "first-aid": "First Aid",
  "switch-weapon": "Switch weapon",
  "wall-run": "Wall run",
  mount: "Mount",
  dismount: "Dismount",
  "mecha-mode": "Mecha mode",
  ram: "Ram",
};

const STATUS_LABELS = {
  burning: "Burning",
  poison: "Poison",
  snared: "Snare",
  confused: "Confusion",
  stunned: "Stun",
  shocked: "Shock",
  feared: "Fear",
  blinded: "Blind",
  jammed: "Jam",
  disarmed: "Disarm",
  slippery: "Slippery",
  reversedDirection: "Reversed",
  slowedReaction: "Slowed",
  marked: "Marked",
};

const FUNNEL = [
  { key: "landed", label: "Landed", tone: "landed" },
  { key: "missed", label: "Missed", tone: "missed" },
  { key: "evaded", label: "Dodged by target", tone: "evaded" },
  { key: "stopped", label: "Stopped in a clash", tone: "stopped" },
  { key: "wasted", label: "Wasted", tone: "wasted" },
];

const resolvedShots = (c) => c.offense.landed + c.offense.missed + c.offense.evaded;
const evadedRate = (c) => (c.defense.shotsFaced ? Math.round(((c.defense.missedAgainst + c.defense.evadedAgainst) / c.defense.shotsFaced) * 100) : null);

// best: which direction wins the row. "none" rows are shown but never crowned.
const GROUPS = [
  {
    title: "Offence",
    rows: [
      { key: "dmg", label: "Damage dealt", get: (c) => c.damage.total, best: "max" },
      { key: "acc", label: "Accuracy", get: (c) => (resolvedShots(c) ? c.offense.accuracy : null), fmt: (v) => `${v}%`, best: "max" },
      { key: "shots", label: "Shots fired", get: (c) => c.offense.shots, best: "none" },
      { key: "big", label: "Biggest hit", get: (c) => c.damage.biggest?.amount ?? 0, best: "max" },
      { key: "avg", label: "Average per hit", get: (c) => c.damage.avgPerHit, best: "max" },
      { key: "kills", label: "Takedowns", get: (c) => c.damage.takedowns, best: "max" },
    ],
  },
  {
    title: "Defence",
    rows: [
      { key: "taken", label: "Damage taken", get: (c) => c.defense.taken, best: "min" },
      { key: "evade", label: "Shots avoided", get: evadedRate, fmt: (v) => `${v}%`, best: "max" },
      { key: "dodge", label: "Dodges won", get: (c) => c.defense.dodgesWon, best: "max" },
      { key: "clash", label: "Clashes won", get: (c) => c.defense.counters.won, best: "max" },
      { key: "down", label: "Times downed", get: (c) => c.defense.downed, best: "min" },
    ],
  },
  {
    title: "Support & economy",
    rows: [
      { key: "heal", label: "Healing given", get: (c) => c.healing.given, best: "max" },
      { key: "ap", label: "AP unspent per turn", get: (c) => c.utility.avgApLeft, fmt: (v) => v.toFixed(1), best: "min" },
      { key: "fame", label: "Fame earned", get: (c) => c.fame, best: "max" },
    ],
  },
];

function fmtDuration(ms) {
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${String(s).padStart(2, "0")}s`;
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function Avatar({ c, size = 28 }) {
  return (
    <span className="cr-avatar" style={{ "--size": `${size}px` }}>
      {c.portrait ? <img src={c.portrait} alt="" /> : <span>{c.name?.[0] ?? "?"}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Honours
// ---------------------------------------------------------------------------

function Honours({ awards, byId }) {
  if (awards.length === 0) return null;
  return (
    <section className="cr-section" aria-labelledby="cr-honours-h">
      <h2 id="cr-honours-h" className="cr-h2">
        Honours
      </h2>
      <ul className="cr-honours">
        {awards.map((a, i) => {
          const winner = byId.get(a.combatantId);
          const Icon = AWARD_ICONS[a.id] || MedalIcon;
          return (
            <li key={a.id} className="cr-honour" style={{ "--i": i }}>
              <span className="cr-honour-medal" aria-hidden="true">
                <Icon weight="duotone" />
              </span>
              <span className="cr-honour-body">
                <span className="cr-honour-title">{a.title}</span>
                <span className="cr-honour-blurb">{a.blurb}</span>
              </span>
              <span className="cr-honour-winner">
                {winner && <Avatar c={winner} size={26} />}
                <span className="cr-honour-name">{winner?.name ?? "—"}</span>
                <span className="cr-honour-value">{a.value}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Head to head
// ---------------------------------------------------------------------------

function HeadToHead({ columns, canToggleFoes, showFoes, onToggleFoes }) {
  if (columns.length < 1) return null;
  return (
    <section className="cr-section" aria-labelledby="cr-h2h-h">
      <div className="cr-section-head">
        <h2 id="cr-h2h-h" className="cr-h2">
          Head to head
        </h2>
        {canToggleFoes && (
          <label className="cr-toggle">
            <input type="checkbox" checked={showFoes} onChange={(e) => onToggleFoes(e.target.checked)} />
            <span>Include foes &amp; NPCs</span>
          </label>
        )}
      </div>
      <div className="cr-matrix-scroll" tabIndex={0} role="region" aria-label="Head to head comparison table">
        <table className="cr-matrix">
          <thead>
            <tr>
              <th scope="col" className="cr-matrix-corner">
                <span className="cr-sr">Stat</span>
              </th>
              {columns.map((c) => (
                <th key={c.id} scope="col" className="cr-matrix-who">
                  <Avatar c={c} size={34} />
                  <span>{c.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          {GROUPS.map((g) => (
            <tbody key={g.title}>
              <tr className="cr-matrix-group">
                <th colSpan={columns.length + 1} scope="colgroup">
                  {g.title}
                </th>
              </tr>
              {g.rows.map((row) => {
                const values = columns.map((c) => row.get(c));
                const nums = values.filter((v) => v != null);
                const max = Math.max(0, ...nums);
                const winVal = row.best === "max" ? max : row.best === "min" && nums.length ? Math.min(...nums) : null;
                const contested = nums.length > 1 && new Set(nums).size > 1;
                const crowned = row.best !== "none" && contested && winVal != null && (row.best === "min" || winVal > 0);
                return (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    {columns.map((c, idx) => {
                      const v = values[idx];
                      const isBest = crowned && v === winVal;
                      const pctWidth = v != null && max > 0 ? Math.max(3, (v / max) * 100) : 0;
                      return (
                        <td key={c.id} className={isBest ? "is-best" : undefined}>
                          {v == null ? (
                            <span className="cr-dash">—</span>
                          ) : (
                            <>
                              <span className="cr-cellbar" style={{ width: `${pctWidth}%`, "--i": idx }} aria-hidden="true" />
                              <span className="cr-cellval">
                                {isBest && <CrownSimpleIcon weight="fill" aria-label="Best" />}
                                {row.fmt ? row.fmt(v) : v}
                              </span>
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dossier
// ---------------------------------------------------------------------------

function Lede({ c }) {
  const acc = resolvedShots(c) ? c.offense.accuracy : null;
  return (
    <p className="cr-lede">
      Dealt <b>{c.damage.total}</b> damage
      {acc != null && (
        <>
          {" "}
          at <b>{acc}%</b> accuracy
        </>
      )}
      , took <b>{c.defense.taken}</b>
      {c.defense.downed > 0 && (
        <>
          , and went down <b>{c.defense.downed}</b> time{c.defense.downed === 1 ? "" : "s"}
        </>
      )}
      .
      {c.damage.takedowns > 0 && (
        <>
          {" "}
          Landed <b>{c.damage.takedowns}</b> finishing blow{c.damage.takedowns === 1 ? "" : "s"}.
        </>
      )}
    </p>
  );
}

function Funnel({ o }) {
  const total = FUNNEL.reduce((n, f) => n + o[f.key], 0);
  if (total === 0) {
    return <p className="cr-quiet">No attack shots were fired.</p>;
  }
  return (
    <div className="cr-funnel">
      <div className="cr-funnel-top">
        <p className="cr-funnel-acc">
          <span className="cr-bignum">{o.accuracy != null ? `${o.accuracy}%` : "—"}</span>
          <span>accuracy on {o.landed + o.missed + o.evaded} aimed shot{o.landed + o.missed + o.evaded === 1 ? "" : "s"}</span>
        </p>
        <p className="cr-funnel-fired">{o.shots} fired in total</p>
      </div>
      <div className="cr-stack" role="img" aria-label={FUNNEL.map((f) => `${o[f.key]} ${f.label.toLowerCase()}`).join(", ")}>
        {FUNNEL.filter((f) => o[f.key] > 0).map((f, i) => (
          <i key={f.key} className={`cr-seg cr-seg--${f.tone}`} style={{ flexGrow: o[f.key], "--i": i }} />
        ))}
      </div>
      <ul className="cr-legend">
        {FUNNEL.map((f) => (
          <li key={f.key} className={o[f.key] === 0 ? "is-zero" : undefined}>
            <i className={`cr-swatch cr-seg--${f.tone}`} />
            <span>{f.label}</span>
            <b>{o[f.key]}</b>
          </li>
        ))}
      </ul>
      {o.wasted > 0 && (
        <p className="cr-fine">
          Wasted:{" "}
          {[
            o.jams && `${o.jams} misfire${o.jams === 1 ? "" : "s"}`,
            o.tooClose && `${o.tooClose} fired too close`,
            o.outOfRange && `${o.outOfRange} out of range`,
            o.wild && `${o.wild} thrown off course`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

function DamageSources({ d }) {
  const entries = Object.entries(d.byVia).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (d.total === 0) return <p className="cr-quiet">No damage dealt.</p>;
  const maxTarget = Math.max(1, ...d.byTarget.map((t) => t.amount));
  return (
    <div className="cr-sources">
      <div className="cr-stack cr-stack--tall" role="img" aria-label={entries.map(([k, v]) => `${VIA_LABELS[k] || k} ${v}`).join(", ")}>
        {entries.map(([k, v], i) => (
          <i key={k} className={`cr-seg cr-via cr-via--${i % 6}`} style={{ flexGrow: v, "--i": i }} />
        ))}
      </div>
      <ul className="cr-legend cr-legend--cols">
        {entries.map(([k, v], i) => (
          <li key={k}>
            <i className={`cr-swatch cr-via cr-via--${i % 6}`} />
            <span>{VIA_LABELS[k] || k}</span>
            <b>{v}</b>
          </li>
        ))}
      </ul>
      {d.biggest && (
        <p className="cr-fine">
          Biggest blow: <b>{d.biggest.amount}</b>
          {d.biggest.slug ? ` with ${d.biggest.slug}` : ""}
          {d.biggest.target ? ` on ${d.biggest.target}` : ""}.
          {d.overkill > 0 ? ` ${d.overkill} damage was overkill.` : ""}
        </p>
      )}
      {d.byTarget.length > 0 && (
        <ul className="cr-targets">
          {d.byTarget.slice(0, 6).map((t, i) => (
            <li key={t.name}>
              <span className="cr-targets-name">{t.name}</span>
              <span className="cr-track">
                <i style={{ width: `${(t.amount / maxTarget) * 100}%`, "--i": i }} />
              </span>
              <b>{t.amount}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SlugLedger({ slugs }) {
  if (slugs.length === 0) return <p className="cr-quiet">No slugs were used.</p>;
  const anyCounters = slugs.some((s) => s.counters > 0);
  return (
    <div className="cr-table-scroll" tabIndex={0} role="region" aria-label="Slug performance table">
      <table className="cr-slugs">
        <thead>
          <tr>
            <th scope="col">Slug</th>
            <th scope="col" className="num">
              Shots
            </th>
            <th scope="col">Hit rate</th>
            <th scope="col" className="num">
              Damage
            </th>
            <th scope="col" className="num">
              Best hit
            </th>
            <th scope="col" className="num">
              Downs
            </th>
            {anyCounters && (
              <th scope="col" className="num">
                Counters
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {slugs.map((s, i) => {
            const rate = s.shots ? Math.round((s.landed / s.shots) * 100) : null;
            return (
              <tr key={s.name}>
                <th scope="row">
                  <i className="cr-typedot" style={{ background: typeColor(s.type) }} aria-hidden="true" />
                  {s.name}
                </th>
                <td className="num">{s.shots}</td>
                <td>
                  {rate == null ? (
                    <span className="cr-dash">—</span>
                  ) : (
                    <span className="cr-rate">
                      <span className="cr-track">
                        <i style={{ width: `${rate}%`, "--i": i }} />
                      </span>
                      <b>{rate}%</b>
                    </span>
                  )}
                </td>
                <td className="num">{s.damage}</td>
                <td className="num">{s.biggest || "—"}</td>
                <td className="num">{s.takedowns || "—"}</td>
                {anyCounters && <td className="num">{s.counters ? `${s.countersWon}/${s.counters}` : "—"}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Readout({ rows }) {
  const shown = rows.filter((r) => r[1] != null && r[1] !== false);
  return (
    <dl className="cr-readout">
      {shown.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Dossier({ c }) {
  const strengths = c.insights.filter((i) => i.tone === "good");
  const weaknesses = c.insights.filter((i) => i.tone === "bad");
  const df = c.defense;
  const o = c.offense;
  const u = c.utility;
  const actions = Object.entries(u.actions).sort((a, b) => b[1] - a[1]);
  const statuses = Object.entries(u.statuses).sort((a, b) => b[1] - a[1]);

  return (
    <div className="cr-dossier" id={`cr-dossier-${c.id}`} role="tabpanel" aria-labelledby={`cr-tab-${c.id}`}>
      <header className="cr-dossier-head">
        <Avatar c={c} size={64} />
        <div>
          <h3 className="cr-h3">{c.name}</h3>
          <Lede c={c} />
        </div>
      </header>

      <div className="cr-dossier-grid">
        <div className="cr-col">
          <section aria-labelledby={`cr-shots-${c.id}`}>
            <h4 id={`cr-shots-${c.id}`} className="cr-h4">
              <TargetIcon weight="bold" aria-hidden="true" /> Shots
            </h4>
            <Funnel o={o} />
          </section>
          <section aria-labelledby={`cr-dmg-${c.id}`}>
            <h4 id={`cr-dmg-${c.id}`} className="cr-h4">
              <SwordIcon weight="bold" aria-hidden="true" /> Damage
            </h4>
            <DamageSources d={c.damage} />
          </section>
          <section aria-labelledby={`cr-slug-${c.id}`}>
            <h4 id={`cr-slug-${c.id}`} className="cr-h4">
              <ScrollIcon weight="bold" aria-hidden="true" /> Slugs
            </h4>
            <SlugLedger slugs={c.slugs} />
          </section>
        </div>

        <div className="cr-col cr-col--side">
          <section aria-labelledby={`cr-good-${c.id}`}>
            <h4 id={`cr-good-${c.id}`} className="cr-h4 cr-h4--good">
              <CheckCircleIcon weight="bold" aria-hidden="true" /> What went well
            </h4>
            {strengths.length ? (
              <ul className="cr-notes cr-notes--good">
                {strengths.map((n) => (
                  <li key={n.text}>{n.text}</li>
                ))}
              </ul>
            ) : (
              <p className="cr-quiet">Nothing stood out — not enough happened to judge.</p>
            )}
          </section>
          <section aria-labelledby={`cr-bad-${c.id}`}>
            <h4 id={`cr-bad-${c.id}`} className="cr-h4 cr-h4--bad">
              <WarningIcon weight="bold" aria-hidden="true" /> Where to improve
            </h4>
            {weaknesses.length ? (
              <ul className="cr-notes cr-notes--bad">
                {weaknesses.map((n) => (
                  <li key={n.text}>{n.text}</li>
                ))}
              </ul>
            ) : (
              <p className="cr-quiet">No weak spots showed up.</p>
            )}
          </section>

          <section aria-labelledby={`cr-fire-${c.id}`}>
            <h4 id={`cr-fire-${c.id}`} className="cr-h4">
              <ShieldCheckIcon weight="bold" aria-hidden="true" /> Under fire
            </h4>
            <Readout
              rows={[
                ["Damage taken", df.taken],
                ["…of which burn & poison", df.dot || null],
                ["…of which terrain", df.environment || null],
                ["Biggest hit taken", df.biggest || null],
                ["Shots avoided", df.shotsFaced ? `${df.missedAgainst + df.evadedAgainst} of ${df.shotsFaced}` : null],
                ["Dodges", df.dodgesTried ? `${df.dodgesWon} of ${df.dodgesTried}` : null],
                ["Counter-clashes won", df.counters.tried ? `${df.counters.won} of ${df.counters.tried}` : null],
                ["Knockout rolls", df.koMade + df.koFailed ? `${df.koMade} passed · ${df.koFailed} failed` : null],
                ["Times downed", df.downed || null],
                ["Healing received", c.healing.received || null],
              ]}
            />
          </section>

          <section aria-labelledby={`cr-roll-${c.id}`}>
            <h4 id={`cr-roll-${c.id}`} className="cr-h4">
              <CrosshairIcon weight="bold" aria-hidden="true" /> Dice &amp; tempo
            </h4>
            <Readout
              rows={[
                ["Average attack d20", o.avgRoll],
                ["Average margin over DC", o.avgMargin != null ? (o.avgMargin > 0 ? `+${o.avgMargin}` : `${o.avgMargin}`) : null],
                ["Natural 20s", o.nat20 || null],
                ["Natural 1s", o.nat1 || null],
                ["Style shots", o.styleShots || null],
                ["Turns taken", u.turns || null],
                ["AP unspent per turn", u.avgApLeft],
                ["Moves", u.moves ? `${u.moves} (${u.distance} units)` : null],
                ["Healing given", c.healing.given || null],
                ["Fame earned", c.fame || null],
              ]}
            />
            {(actions.length > 0 || statuses.length > 0) && (
              <ul className="cr-chips">
                {actions.map(([k, v]) => (
                  <li key={k}>
                    {ACTION_LABELS[k] || k} <b>×{v}</b>
                  </li>
                ))}
                {statuses.map(([k, v]) => (
                  <li key={k} className="is-status">
                    Inflicted {STATUS_LABELS[k] || k} <b>×{v}</b>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ReportBody({ report }) {
  const [showFoes, setShowFoes] = useState(false);
  const people = useMemo(() => report.combatants.filter((c) => c.kind !== "mecha"), [report]);
  const byId = useMemo(() => new Map(report.combatants.map((c) => [c.id, c])), [report]);
  const players = people.filter((c) => c.isPlayer);
  const foes = people.filter((c) => !c.isPlayer);
  const [selectedId, setSelectedId] = useState((players[0] || people[0])?.id ?? null);
  const columns = showFoes || players.length === 0 ? people : players;
  const selected = byId.get(selectedId) || people[0];

  return (
    <>
      <header className="cr-masthead">
        <h1 className="cr-h1">{report.encounter.name}</h1>
        <p className="cr-meta">
          <span>
            {report.encounter.rounds} round{report.encounter.rounds === 1 ? "" : "s"}
          </span>
          <span>{fmtDuration(report.encounter.durationMs)}</span>
          <span>{report.encounter.totalDamage} damage dealt</span>
          <span>{report.encounter.totalShots} shots fired</span>
        </p>
      </header>

      <Honours awards={report.awards} byId={byId} />

      <HeadToHead columns={columns} canToggleFoes={players.length > 0 && foes.length > 0} showFoes={showFoes} onToggleFoes={setShowFoes} />

      <section className="cr-section" aria-labelledby="cr-dossiers-h">
        <h2 id="cr-dossiers-h" className="cr-h2">
          Dossiers
        </h2>
        <div className="cr-tabs" role="tablist" aria-label="Choose a combatant">
          {[...players, ...foes].map((c, i) => (
            <button
              key={c.id}
              id={`cr-tab-${c.id}`}
              type="button"
              role="tab"
              aria-selected={selected?.id === c.id}
              aria-controls={`cr-dossier-${c.id}`}
              className={`cr-tab ${selected?.id === c.id ? "is-on" : ""} ${i === players.length && players.length > 0 ? "is-first-foe" : ""}`}
              onClick={() => setSelectedId(c.id)}
            >
              <Avatar c={c} size={26} />
              <span>{c.name}</span>
            </button>
          ))}
        </div>
        {selected && <Dossier key={selected.id} c={selected} />}
      </section>
    </>
  );
}

export default function CombatReports() {
  const { token } = useAuth();
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
    let live = true;
    fetch("/api/combat/reports", { headers: authHeaders })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load your battle reports."))))
      .then((d) => live && setList(d.reports))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [authHeaders]);

  const activeId = Number(params.get("id")) || list?.[0]?.id || null;

  useEffect(() => {
    if (!activeId) return undefined;
    let live = true;
    setDetail(null);
    fetch(`/api/combat/reports/${activeId}`, { headers: authHeaders })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load that report."))))
      .then((d) => {
        if (!live) return;
        setDetail(d);
        fetch(`/api/combat/reports/${activeId}/seen`, { method: "POST", headers: authHeaders }).catch(() => {});
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [activeId, authHeaders]);

  return (
    <>
      <NavBar />
      <main className="cr-page">
        <div className="cr-topline">
          <Link className="panel-btn panel-btn--ghost" to="/combat">
            <ArrowLeftIcon weight="bold" /> Back to combat
          </Link>
          {list && list.length > 1 && (
            <label className="cr-picker">
              <span className="cr-sr">Choose a battle report</span>
              <select value={activeId ?? ""} onChange={(e) => setParams({ id: e.target.value })}>
                {list.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {fmtDate(r.createdAt)}
                    {r.seen ? "" : " (new)"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {error && (
          <p className="cr-error" role="alert">
            {error}
          </p>
        )}

        {list && list.length === 0 && !error && (
          <div className="panel panel--quiet cr-empty">
            <div className="panel-body">
              <ScrollIcon weight="duotone" aria-hidden="true" />
              <h1 className="cr-h1">No battle reports yet</h1>
              <p>When the Dungeon Master ends an encounter, a report of every shot, hit and miss is written and sent to everyone who fought in it.</p>
            </div>
          </div>
        )}

        {!detail && list && list.length > 0 && !error && <p className="cr-loading">Unrolling the report…</p>}

        {detail && <ReportBody key={detail.id} report={detail.report} />}
      </main>
    </>
  );
}
