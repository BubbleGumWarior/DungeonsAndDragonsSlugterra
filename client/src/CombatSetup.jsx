import { useEffect, useMemo, useState } from "react";
import {
  CursorIcon,
  DropIcon,
  EraserIcon,
  FlagIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  PlusIcon,
  RobotIcon,
  UsersThreeIcon,
  WallIcon,
  XIcon,
} from "@phosphor-icons/react";
import { COMBAT_TEAMS, teamById } from "./combatTeams.js";
import { combatSide } from "./combatSkills.js";
import "./CombatSetup.css";

// Where each team musters on a fresh map, as fractions of its width/height --
// so a new arrival lands with its own side instead of in a random heap.
const TEAM_ANCHOR = {
  party: [0.18, 0.5],
  foes: [0.82, 0.5],
  azure: [0.5, 0.16],
  verdant: [0.5, 0.84],
  violet: [0.2, 0.16],
  rose: [0.8, 0.84],
};

const TOOLS = [
  { id: "move", label: "Place", key: "V", Icon: CursorIcon, hint: "Drag any token to place it." },
  { id: "walls", label: "Walls", key: "W", Icon: WallIcon, hint: "Click and drag to draw a wall. Click a wall to remove it." },
  { id: "paint", label: "Water", key: "B", Icon: DropIcon, hint: "Drag across the map to flood cells." },
  { id: "erase", label: "Drain", key: "E", Icon: EraserIcon, hint: "Drag across water to drain it." },
];

const BRUSHES = [
  { size: 1, label: "Fine" },
  { size: 3, label: "Medium" },
  { size: 5, label: "Broad" },
  { size: 9, label: "Flood" },
];

const ADD_TABS = [
  { id: "party", label: "Party" },
  { id: "npc", label: "NPCs" },
  { id: "grunt", label: "Grunts" },
  { id: "custom", label: "Custom" },
];

function spawnPoint(encounter, teamId) {
  const [fx, fy] = TEAM_ANCHOR[teamId] || [0.5, 0.5];
  const w = encounter.mapWidth || 1600;
  const h = encounter.mapHeight || 900;
  const jitter = () => (Math.random() - 0.5) * 140;
  return {
    x: Math.round(Math.min(w - 60, Math.max(60, w * fx + jitter()))),
    y: Math.round(Math.min(h - 60, Math.max(60, h * fy + jitter()))),
  };
}

const initial = (name) => (name || "?").trim().charAt(0).toUpperCase();

function Avatar({ src, name, teamId, size = 32 }) {
  const team = teamById(teamId);
  return (
    <span className="setup-avatar" style={{ "--team": team.token, width: size, height: size }}>
      {src ? <img src={src} alt="" loading="lazy" /> : <span>{initial(name)}</span>}
    </span>
  );
}

// "Deploy to": every add below drops the new combatant onto this team.
// Auto keeps the classic rule (players and their mecha join the party,
// everyone else by their relationship) so the common case is still one click.
function TeamPicker({ value, onChange, counts }) {
  return (
    <div className="setup-block">
      <div className="setup-block-head">
        <h3>Deploy to</h3>
        <span className="setup-block-note">{value === "auto" ? "by role" : teamById(value).label}</span>
      </div>
      <div className="setup-teams" role="radiogroup" aria-label="Team for new combatants">
        <button
          type="button"
          role="radio"
          aria-checked={value === "auto"}
          className={`setup-team setup-team--auto ${value === "auto" ? "is-on" : ""}`}
          onClick={() => onChange("auto")}
        >
          Auto
        </button>
        {COMBAT_TEAMS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={value === t.id}
            className={`setup-team ${value === t.id ? "is-on" : ""}`}
            style={{ "--team": t.token }}
            onClick={() => onChange(t.id)}
          >
            <i aria-hidden="true" />
            {t.label}
            {counts[t.id] > 0 && <b>{counts[t.id]}</b>}
          </button>
        ))}
      </div>
    </div>
  );
}

function PickRow({ avatar, name, meta, tint, taken, onPick, busy }) {
  return (
    <li>
      <button type="button" className="setup-pick" disabled={taken || busy} onClick={onPick}>
        {avatar}
        <span className="setup-pick-text">
          <span className="setup-pick-name" style={{ color: tint || undefined }}>
            {name}
          </span>
          {meta && <span className="setup-pick-meta">{meta}</span>}
        </span>
        <span className="setup-pick-add" aria-hidden="true">
          {taken ? "On map" : <PlusIcon weight="bold" />}
        </span>
      </button>
    </li>
  );
}

function CustomForm({ onAdd, busy }) {
  const [name, setName] = useState("");
  const [dex, setDex] = useState(0);
  const [con, setCon] = useState(0);
  return (
    <form
      className="setup-custom"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onAdd({ name: name.trim(), dexModifier: Number(dex), conModifier: Number(con) }).then(() => setName(""));
      }}
    >
      <div className="panel-field">
        <label htmlFor="setup-custom-name">Name</label>
        <input id="setup-custom-name" type="text" maxLength={40} value={name} placeholder="Blakk Goon" onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="panel-row">
        <div className="panel-field">
          <label htmlFor="setup-custom-dex">DEX mod</label>
          <input id="setup-custom-dex" type="number" min={-5} max={10} value={dex} onChange={(e) => setDex(e.target.value)} />
        </div>
        <div className="panel-field">
          <label htmlFor="setup-custom-con">CON mod</label>
          <input id="setup-custom-con" type="number" min={-5} max={10} value={con} onChange={(e) => setCon(e.target.value)} />
        </div>
      </div>
      <p className="setup-note">Grit and AP are derived from these, same as player characters.</p>
      <button type="submit" className="panel-btn panel-btn--ghost" disabled={busy || !name.trim()}>
        <PlusIcon weight="bold" /> Add combatant
      </button>
    </form>
  );
}

function Roster({ combatants, isDM, onSetTeam, onRemove }) {
  const groups = COMBAT_TEAMS.map((t) => ({ team: t, members: combatants.filter((c) => combatSide(c) === t.id) })).filter(
    (g) => g.members.length > 0
  );
  if (groups.length === 0) {
    return (
      <div className="setup-empty">
        <UsersThreeIcon weight="duotone" />
        <p>{isDM ? "Nobody on the map yet. Pick someone above and they muster on their team's side." : "The DM hasn't added anyone yet."}</p>
      </div>
    );
  }
  return (
    <div className="setup-roster">
      {groups.map(({ team, members }) => (
        <section key={team.id} className="setup-group" style={{ "--team": team.token }}>
          <h4>
            <i aria-hidden="true" />
            {team.label}
            <span>{members.length}</span>
          </h4>
          <ul>
            {members.map((c) => (
              <li key={c.id} className="setup-member">
                <Avatar src={c.portrait} name={c.name} teamId={team.id} size={30} />
                <span className="setup-member-text">
                  <span className="setup-member-name">{c.name}</span>
                  <span className="setup-member-kind">{c.kind === "npc" ? c.relationship || "NPC" : c.kind}</span>
                </span>
                {isDM && (
                  <>
                    <select
                      className="setup-member-team"
                      value={team.id}
                      aria-label={`Team for ${c.name}`}
                      onChange={(e) => onSetTeam(c.id, e.target.value)}
                    >
                      {COMBAT_TEAMS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="setup-member-remove" aria-label={`Remove ${c.name}`} onClick={() => onRemove(c.id)}>
                      <XIcon weight="bold" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function CombatSetup({
  encounter,
  isDM,
  players,
  mechas,
  npcTemplates,
  gruntTemplates,
  error,
  tool,
  onToolChange,
  brush,
  onBrushChange,
  onAddCombatant,
  onPullNpc,
  onPullGrunt,
  onSetTeam,
  onRemove,
  onStart,
  children,
}) {
  const [deployTeam, setDeployTeam] = useState("auto");
  const [tab, setTab] = useState("party");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const combatants = encounter.combatants;
  const counts = useMemo(() => {
    const out = {};
    for (const c of combatants) out[combatSide(c)] = (out[combatSide(c)] || 0) + 1;
    return out;
  }, [combatants]);
  const teamsInPlay = Object.keys(counts).length;

  // V / W / B / E switch map tools, unless the DM is typing somewhere.
  useEffect(() => {
    if (!isDM) return undefined;
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName) || e.target?.isContentEditable) return;
      const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (t) onToolChange(t.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDM, onToolChange]);

  // Resolve the team a new arrival lands on and where on the map it spawns.
  function placement(probe) {
    const teamId = deployTeam === "auto" ? combatSide(probe) : deployTeam;
    return { team: deployTeam === "auto" ? null : deployTeam, ...spawnPoint(encounter, teamId) };
  }

  async function run(fn) {
    setBusy(true);
    try {
      await fn();
    } catch {
      /* the page surfaces the error */
    } finally {
      setBusy(false);
    }
  }

  const q = query.trim().toLowerCase();
  const matches = (name) => !q || name.toLowerCase().includes(q);
  const takenUsers = new Set(combatants.filter((c) => c.kind === "character").map((c) => c.refUserId));
  const takenMechas = new Set(combatants.filter((c) => c.kind === "mecha").map((c) => c.refMechaId));
  const takenNpcs = new Set(combatants.filter((c) => c.refNpcTemplateId != null).map((c) => c.refNpcTemplateId));
  const gruntCount = (id) => combatants.filter((c) => c.refGruntTemplateId === id).length;
  const relTint = { Ally: "var(--rel-ally)", Friend: "var(--rel-friend)", Neutral: "var(--rel-neutral)", Rival: "var(--rel-rival)", Enemy: "var(--rel-enemy)" };
  const npcRel = (t) => t.profile?.fields?.relationship?.value || null;

  const tool_ = TOOLS.find((t) => t.id === tool) || TOOLS[0];
  const water = tool === "paint" || tool === "erase";
  const startHint =
    combatants.length === 0 ? "Add at least one combatant." : teamsInPlay < 2 ? "Only one team on the map, so nobody has an opponent." : null;

  return (
    <div className="setup">
      <header className="setup-head">
        <div className="setup-head-text">
          <p className="setup-eyebrow">
            <FlagIcon weight="duotone" /> Staging
          </p>
          <h2>{encounter.name}</h2>
          <p className="setup-summary num-tabular">
            {combatants.length} {combatants.length === 1 ? "combatant" : "combatants"} · {teamsInPlay} {teamsInPlay === 1 ? "team" : "teams"}
          </p>
        </div>
        {isDM ? (
          <div className="setup-start">
            <button type="button" className="panel-btn setup-start-btn" disabled={combatants.length === 0} onClick={onStart}>
              <PlayIcon weight="fill" /> Start encounter
            </button>
            {startHint && <p className="setup-note">{startHint}</p>}
          </div>
        ) : (
          <p className="setup-note">Waiting for the Dungeon Master to start the encounter.</p>
        )}
      </header>

      {error && <p className="panel-error">{error}</p>}

      <div className={`setup-layout ${isDM ? "" : "setup-layout--solo"}`}>
        <aside className="setup-rail">
          {isDM && (
            <>
              <TeamPicker value={deployTeam} onChange={setDeployTeam} counts={counts} />

              <div className="setup-block">
                <div className="setup-block-head">
                  <h3>Add to the map</h3>
                </div>
                <div className="setup-tabs" role="tablist" aria-label="Who to add">
                  {ADD_TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.id}
                      className={tab === t.id ? "is-on" : ""}
                      onClick={() => {
                        setTab(t.id);
                        setQuery("");
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {(tab === "npc" || tab === "grunt") && (
                  <label className="setup-search">
                    <MagnifyingGlassIcon weight="bold" aria-hidden="true" />
                    <input type="search" value={query} placeholder="Filter by name" onChange={(e) => setQuery(e.target.value)} />
                  </label>
                )}

                <div className="setup-picklist" role="tabpanel">
                  {tab === "party" && (
                    <>
                      <ul>
                        {players.filter((p) => matches(p.username)).map((p) => (
                          <PickRow
                            key={`u${p.id}`}
                            avatar={<Avatar src={p.portrait} name={p.username} teamId="party" />}
                            name={p.username}
                            meta="Player character"
                            tint="var(--gold-soft)"
                            taken={takenUsers.has(p.id)}
                            busy={busy}
                            onPick={() => run(() => onAddCombatant({ kind: "character", refUserId: p.id, ...placement({ kind: "character" }) }))}
                          />
                        ))}
                      </ul>
                      {players.length === 0 && <p className="setup-note">No players have signed up yet.</p>}
                      {mechas.length > 0 && (
                        <>
                          <h4 className="setup-sub">
                            <RobotIcon weight="duotone" /> Mecha
                          </h4>
                          <ul>
                            {mechas.map((m) => (
                              <PickRow
                                key={`m${m.id}`}
                                avatar={<Avatar src={m.image} name={m.name} teamId="party" />}
                                name={m.name}
                                meta={m.frameType || "Mecha"}
                                taken={takenMechas.has(m.id)}
                                busy={busy}
                                onPick={() => run(() => onAddCombatant({ kind: "mecha", refMechaId: m.id, ...placement({ kind: "mecha" }) }))}
                              />
                            ))}
                          </ul>
                        </>
                      )}
                    </>
                  )}

                  {tab === "npc" && (
                    <>
                      <ul>
                        {npcTemplates.filter((t) => matches(t.name)).map((t) => (
                          <PickRow
                            key={t.id}
                            avatar={<Avatar src={t.image} name={t.name} teamId={combatSide({ kind: "npc", relationship: npcRel(t) })} />}
                            name={t.name}
                            meta={npcRel(t) || "NPC"}
                            tint={relTint[npcRel(t)]}
                            taken={takenNpcs.has(t.id)}
                            busy={busy}
                            onPick={() =>
                              run(() => onPullNpc({ npcTemplateId: t.id, ...placement({ kind: "npc", relationship: npcRel(t) }) }))
                            }
                          />
                        ))}
                      </ul>
                      {npcTemplates.length === 0 && <p className="setup-note">No combat-ready NPCs yet. Create some on the Chronicle page first.</p>}
                    </>
                  )}

                  {tab === "grunt" && (
                    <>
                      <ul>
                        {gruntTemplates.filter((t) => matches(t.name)).map((t) => (
                          <PickRow
                            key={t.id}
                            avatar={<Avatar src={t.image} name={t.name} teamId={combatSide({ kind: "npc", relationship: t.relationship })} />}
                            name={t.name}
                            meta={gruntCount(t.id) ? `${t.relationship} · ${gruntCount(t.id)} sent` : `${t.relationship} · rolls its own loadout`}
                            tint={relTint[t.relationship]}
                            busy={busy}
                            onPick={() =>
                              run(() => onPullGrunt({ gruntTemplateId: t.id, ...placement({ kind: "npc", relationship: t.relationship }) }))
                            }
                          />
                        ))}
                      </ul>
                      {gruntTemplates.length === 0 && <p className="setup-note">No grunts yet. Create some on the Chronicle page first.</p>}
                    </>
                  )}

                  {tab === "custom" && (
                    <CustomForm
                      busy={busy}
                      onAdd={(stats) =>
                        onAddCombatant({ kind: "npc", ...stats, ...placement({ kind: "npc" }) }).catch(() => {})
                      }
                    />
                  )}
                </div>
              </div>
            </>
          )}

          <div className="setup-block">
            <div className="setup-block-head">
              <h3>On the map</h3>
            </div>
            <Roster combatants={combatants} isDM={isDM} onSetTeam={onSetTeam} onRemove={onRemove} />
          </div>
        </aside>

        {isDM && (
          <section className="setup-stage" aria-label="Map">
            <div className="setup-toolbar">
              <div className="setup-tools" role="radiogroup" aria-label="Map tool">
                {TOOLS.map(({ id, label, key, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={tool === id}
                    className={tool === id ? "is-on" : ""}
                    onClick={() => onToolChange(id)}
                  >
                    <Icon weight={tool === id ? "fill" : "bold"} />
                    {label}
                    <kbd>{key}</kbd>
                  </button>
                ))}
              </div>
              {water && (
                <div className="setup-brushes" role="radiogroup" aria-label="Brush size">
                  {BRUSHES.map((b, i) => (
                    <button
                      key={b.size}
                      type="button"
                      role="radio"
                      aria-checked={brush === b.size}
                      aria-label={b.label}
                      title={b.label}
                      className={brush === b.size ? "is-on" : ""}
                      onClick={() => onBrushChange(b.size)}
                    >
                      <i style={{ width: 5 + i * 4, height: 5 + i * 4 }} />
                    </button>
                  ))}
                </div>
              )}
              <p className="setup-hint">{tool_.hint}</p>
            </div>
            <div className={`setup-map setup-map--${tool}`}>{children}</div>
          </section>
        )}
      </div>
    </div>
  );
}
