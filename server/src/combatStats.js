import { pool } from "./db.js";
import { notifyUser } from "./ws.js";

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

// Appends one raw stat event. `actor`/`target` are combatant rows (or anything
// with { id, name }); everything else lands in the JSON `data` bag. Never
// throws -- a stats hiccup must not interrupt combat resolution.
export async function recordCombatEvent(encounterId, type, { actor = null, target = null, ...data } = {}) {
  if (!encounterId) return;
  try {
    await pool.query(
      `INSERT INTO combat_events (encounter_id, type, actor_id, actor_name, target_id, target_name, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [encounterId, type, actor?.id ?? null, actor?.name ?? null, target?.id ?? null, target?.name ?? null, JSON.stringify(data)]
    );
  } catch (err) {
    console.error("Could not record combat event:", err);
  }
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

const LANDED = new Set(["hit", "clash_won"]);
const STOPPED = new Set(["clash_lost", "clash_bounce", "clash_double"]);
const WASTED = new Set(["jam", "too_close", "out_of_range", "wild", "crosswind"]);

const round1 = (n) => Math.round(n * 10) / 10;
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null);

function blankSlug(name, type) {
  return { name, type: type ?? null, shots: 0, landed: 0, missed: 0, evaded: 0, stopped: 0, wasted: 0, damage: 0, biggest: 0, takedowns: 0, counters: 0, countersWon: 0 };
}

function blankStats(c) {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    userId: c.userId ?? null,
    portrait: c.portrait ?? null,
    isPlayer: c.kind === "character",
    offense: { shots: 0, landed: 0, missed: 0, evaded: 0, stopped: 0, wasted: 0, jams: 0, tooClose: 0, outOfRange: 0, wild: 0, styleShots: 0, selfBuffs: 0, utilityShots: 0, rolls: 0, rollSum: 0, nat20: 0, nat1: 0, marginSum: 0 },
    damage: { total: 0, grit: 0, structure: 0, hits: 0, biggest: null, overkill: 0, takedowns: 0, byVia: {}, byTarget: {} },
    healing: { given: 0, received: 0, hunker: 0 },
    defense: { taken: 0, takenGrit: 0, takenStructure: 0, biggest: 0, hitsTaken: 0, shotsFaced: 0, missedAgainst: 0, evadedAgainst: 0, dodgesTried: 0, dodgesWon: 0, counters: { tried: 0, won: 0, lost: 0, bounce: 0 }, downed: 0, koMade: 0, koFailed: 0, dot: 0, environment: 0 },
    utility: { turns: 0, apLeft: 0, apMax: 0, moves: 0, distance: 0, actions: {}, statuses: {} },
    slugs: {},
    fame: 0,
  };
}

function slugRow(s, name, type) {
  if (!name) return null;
  if (!s.slugs[name]) s.slugs[name] = blankSlug(name, type);
  else if (type && !s.slugs[name].type) s.slugs[name].type = type;
  return s.slugs[name];
}

function aggregate(events, combatantRows, fameStart) {
  const stats = new Map();
  const ensure = (id, name) => {
    if (id == null) return null;
    if (!stats.has(id)) {
      const row = combatantRows.find((c) => c.id === id);
      stats.set(
        id,
        blankStats({
          id,
          name: row?.name ?? name ?? `Combatant ${id}`,
          kind: row?.kind ?? "npc",
          userId: row?.ref_user_id ?? null,
          portrait: row?.portrait ?? null,
        })
      );
    }
    return stats.get(id);
  };
  for (const c of combatantRows) if (c.kind !== "decoy") ensure(c.id, c.name);

  for (const e of events) {
    const d = e.data || {};
    const a = ensure(e.actor_id, e.actor_name);
    const t = ensure(e.target_id, e.target_name);
    const as = a && a.kind !== "decoy" ? a : null;
    const ts = t && t.kind !== "decoy" ? t : null;

    switch (e.type) {
      case "shot": {
        if (!as) break;
        if (d.action && d.action !== "attack") {
          as.offense.utilityShots += 1;
          break;
        }
        if (e.target_id != null && e.target_id === e.actor_id) {
          as.offense.selfBuffs += 1;
          break;
        }
        as.offense.shots += 1;
        const sr = slugRow(as, d.slug, d.slugType);
        if (sr) sr.shots += 1;
        break;
      }
      case "shot_result": {
        const self = e.target_id != null && e.target_id === e.actor_id;
        if (self) break;
        const o = d.outcome;
        if (as) {
          const sr = slugRow(as, d.slug, d.slugType);
          // A ricochet leg is a bonus shot with no "shot" event of its own.
          if (d.bonus) { as.offense.shots += 1; if (sr) sr.shots += 1; }
          if (LANDED.has(o)) { as.offense.landed += 1; if (sr) sr.landed += 1; }
          else if (o === "miss") { as.offense.missed += 1; if (sr) sr.missed += 1; }
          else if (o === "dodged") { as.offense.evaded += 1; if (sr) sr.evaded += 1; }
          else if (STOPPED.has(o)) { as.offense.stopped += 1; if (sr) sr.stopped += 1; }
          else if (WASTED.has(o)) {
            as.offense.wasted += 1;
            if (sr) sr.wasted += 1;
            if (o === "jam") as.offense.jams += 1;
            else if (o === "too_close") as.offense.tooClose += 1;
            else if (o === "out_of_range") as.offense.outOfRange += 1;
            else as.offense.wild += 1;
          }
          if (d.style) as.offense.styleShots += 1;
          if (Number.isFinite(d.roll)) {
            as.offense.rolls += 1;
            as.offense.rollSum += d.roll;
            if (d.roll === 20) as.offense.nat20 += 1;
            if (d.roll === 1) as.offense.nat1 += 1;
            if (Number.isFinite(d.attackTotal) && Number.isFinite(d.dc)) as.offense.marginSum += d.attackTotal - d.dc;
          }
        }
        if (ts && !WASTED.has(o)) {
          ts.defense.shotsFaced += 1;
          if (o === "miss") ts.defense.missedAgainst += 1;
          else if (o === "dodged") ts.defense.evadedAgainst += 1;
          else if (LANDED.has(o)) ts.defense.hitsTaken += 1;
        }
        break;
      }
      case "damage": {
        const amount = d.amount || 0;
        const isStructure = Boolean(d.structure);
        const via = d.via || "direct";
        if (as) {
          as.damage.total += amount;
          if (isStructure) as.damage.structure += amount; else as.damage.grit += amount;
          as.damage.overkill += d.overkill || 0;
          as.damage.byVia[via] = (as.damage.byVia[via] || 0) + amount;
          if (t) as.damage.byTarget[t.name] = (as.damage.byTarget[t.name] || 0) + amount;
          if (amount > 0) as.damage.hits += 1;
          if (!as.damage.biggest || amount > as.damage.biggest.amount) {
            as.damage.biggest = { amount, slug: d.slug ?? null, target: t?.name ?? e.target_name ?? null, via };
          }
          if (d.kill) as.damage.takedowns += 1;
          const sr = slugRow(as, d.slug, d.slugType);
          if (sr) {
            sr.damage += amount;
            sr.biggest = Math.max(sr.biggest, amount);
            if (d.kill) sr.takedowns += 1;
          }
        }
        if (ts) {
          ts.defense.taken += amount;
          if (isStructure) ts.defense.takenStructure += amount; else ts.defense.takenGrit += amount;
          ts.defense.biggest = Math.max(ts.defense.biggest, amount);
          if (via === "dot") ts.defense.dot += amount;
          if (via === "hazard" || via === "pod" || via === "star") ts.defense.environment += amount;
        }
        break;
      }
      case "heal": {
        const amount = d.amount || 0;
        if (as && e.target_id !== e.actor_id) as.healing.given += amount;
        if (as && d.source === "hunker") as.healing.hunker += amount;
        if (ts) ts.healing.received += amount;
        break;
      }
      case "status": {
        if (as && d.status) as.utility.statuses[d.status] = (as.utility.statuses[d.status] || 0) + 1;
        break;
      }
      case "dodge": {
        if (!as) break;
        as.defense.dodgesTried += 1;
        if (d.success) as.defense.dodgesWon += 1;
        break;
      }
      case "counter": {
        if (!as) break;
        const c = as.defense.counters;
        c.tried += 1;
        if (d.outcome === "won") c.won += 1;
        else if (d.outcome === "lost") c.lost += 1;
        else c.bounce += 1;
        const sr = slugRow(as, d.slug, d.slugType);
        if (sr) { sr.counters += 1; if (d.outcome === "won") sr.countersWon += 1; }
        break;
      }
      case "ko_save": {
        if (!as) break;
        if (d.success) as.defense.koMade += 1; else as.defense.koFailed += 1;
        break;
      }
      case "down": {
        if (as) as.defense.downed += 1;
        break;
      }
      case "ram": {
        if (!as) break;
        as.utility.actions.ram = (as.utility.actions.ram || 0) + 1;
        break;
      }
      case "turn_end": {
        if (!as || d.skipped) break;
        as.utility.turns += 1;
        as.utility.apLeft += d.apLeft || 0;
        as.utility.apMax += d.apMax || 0;
        break;
      }
      case "move": {
        if (!as) break;
        as.utility.moves += 1;
        as.utility.distance += d.distance || 0;
        break;
      }
      case "action": {
        if (!as || !d.action) break;
        as.utility.actions[d.action] = (as.utility.actions[d.action] || 0) + 1;
        break;
      }
      default:
        break;
    }
  }

  for (const c of combatantRows) {
    const s = stats.get(c.id);
    if (s && c.ref_user_id && fameStart && fameStart[c.ref_user_id] != null && c.fameNow != null) {
      s.fame = Math.max(0, c.fameNow - fameStart[c.ref_user_id]);
    }
  }
  return [...stats.values()].filter((s) => s.kind !== "decoy");
}

// Turns the raw counters into the serialized shape (derived percentages, sorted
// lists) the client renders.
function finalize(s) {
  const o = s.offense;
  const resolved = o.landed + o.missed + o.evaded;
  const slugs = Object.values(s.slugs)
    .filter((x) => x.shots + x.counters + x.damage > 0)
    .sort((x, y) => y.damage - x.damage || y.shots - x.shots);
  const d = s.damage;
  return {
    id: s.id,
    name: s.name,
    kind: s.kind,
    userId: s.userId,
    portrait: s.portrait,
    isPlayer: s.isPlayer,
    offense: {
      shots: o.shots,
      landed: o.landed,
      missed: o.missed,
      evaded: o.evaded,
      stopped: o.stopped,
      wasted: o.wasted,
      jams: o.jams,
      tooClose: o.tooClose,
      outOfRange: o.outOfRange,
      wild: o.wild,
      styleShots: o.styleShots,
      selfBuffs: o.selfBuffs,
      utilityShots: o.utilityShots,
      accuracy: pct(o.landed, resolved),
      efficiency: pct(o.landed, o.shots),
      avgRoll: o.rolls ? round1(o.rollSum / o.rolls) : null,
      nat20: o.nat20,
      nat1: o.nat1,
      avgMargin: o.rolls ? round1(o.marginSum / o.rolls) : null,
    },
    damage: {
      total: d.total,
      grit: d.grit,
      structure: d.structure,
      hits: d.hits,
      avgPerHit: d.hits ? round1(d.total / d.hits) : 0,
      biggest: d.biggest,
      overkill: d.overkill,
      takedowns: d.takedowns,
      byVia: d.byVia,
      byTarget: Object.entries(d.byTarget)
        .map(([name, amount]) => ({ name, amount }))
        .sort((x, y) => y.amount - x.amount),
    },
    healing: s.healing,
    defense: s.defense,
    utility: {
      turns: s.utility.turns,
      avgApLeft: s.utility.turns ? round1(s.utility.apLeft / s.utility.turns) : null,
      apLeft: s.utility.apLeft,
      apMax: s.utility.apMax,
      moves: s.utility.moves,
      distance: Math.round(s.utility.distance),
      actions: s.utility.actions,
      statuses: s.utility.statuses,
    },
    slugs,
    fame: s.fame,
  };
}

function buildAwards(list) {
  const players = list.filter((c) => c.isPlayer);
  const pool = players.length >= 2 ? players : list.filter((c) => c.kind !== "mecha");
  const awards = [];
  const best = (id, title, blurb, score, fmt, { min = 0 } = {}) => {
    let top = null;
    for (const c of pool) {
      const v = score(c);
      if (v == null || v <= min) continue;
      if (!top || v > top.v) top = { c, v };
    }
    if (top) awards.push({ id, title, blurb, combatantId: top.c.id, value: fmt(top.v, top.c) });
  };
  best("heavy", "Heavy Hitter", "Most total damage dealt", (c) => c.damage.total, (v) => `${v} damage`);
  best(
    "sharp",
    "Sharpshooter",
    "Best accuracy (3+ shots)",
    (c) => (c.offense.landed + c.offense.missed + c.offense.evaded >= 3 ? c.offense.accuracy : null),
    (v) => `${v}% accuracy`
  );
  best("big", "Biggest Blow", "Hardest single hit", (c) => c.damage.biggest?.amount ?? 0, (v, c) => `${v}${c.damage.biggest?.slug ? ` · ${c.damage.biggest.slug}` : ""}`);
  best("finisher", "Finisher", "Most takedowns", (c) => c.damage.takedowns, (v) => `${v} down${v === 1 ? "" : "s"}`);
  best("wall", "Iron Wall", "Soaked the most damage", (c) => c.defense.taken, (v) => `${v} absorbed`);
  best(
    "slippery",
    "Hard to Hit",
    "Highest share of shots dodged or missed (3+ faced)",
    (c) => (c.defense.shotsFaced >= 3 ? (c.defense.missedAgainst + c.defense.evadedAgainst) / c.defense.shotsFaced : null),
    (v) => `${Math.round(v * 100)}% evaded`
  );
  best("medic", "Field Medic", "Most healing given to others", (c) => c.healing.given, (v) => `${v} Grit healed`);
  best("clash", "Clash King", "Most clashes won", (c) => c.defense.counters.won, (v) => `${v} clash${v === 1 ? "" : "es"} won`);
  best("style", "Showboat", "Most style shots", (c) => c.offense.styleShots, (v) => `${v} style shot${v === 1 ? "" : "s"}`);
  return awards;
}

function buildInsights(c, pool) {
  const out = [];
  const good = (text) => out.push({ tone: "good", text });
  const bad = (text) => out.push({ tone: "bad", text });
  const o = c.offense;
  const resolved = o.landed + o.missed + o.evaded;
  const peers = pool.filter((p) => p.id !== c.id);
  const avg = (fn, filter = () => true) => {
    const vals = peers.filter(filter).map(fn).filter((v) => v != null);
    return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
  };
  const enough = (p) => p.offense.landed + p.offense.missed + p.offense.evaded >= 3;

  if (resolved >= 3 && o.accuracy != null) {
    const peerAcc = avg((p) => p.offense.accuracy, enough);
    if (peerAcc != null && o.accuracy >= peerAcc + 10) good(`Deadly aim — ${o.accuracy}% of shots connected (others averaged ${Math.round(peerAcc)}%).`);
    else if (peerAcc != null && o.accuracy <= peerAcc - 10) bad(`Aim needs work — only ${o.landed} of ${resolved} shots connected (${o.accuracy}%, others averaged ${Math.round(peerAcc)}%).`);
    else if (peerAcc == null && o.accuracy >= 70) good(`Steady aim — ${o.landed} of ${resolved} shots connected.`);
    else if (peerAcc == null && o.accuracy <= 35) bad(`Shaky aim — only ${o.landed} of ${resolved} shots connected.`);
  }
  const totalPool = pool.reduce((n, p) => n + p.damage.total, 0);
  if (totalPool > 0 && c.damage.total > 0) {
    const share = Math.round((c.damage.total / totalPool) * 100);
    const top = Math.max(...pool.map((p) => p.damage.total));
    if (c.damage.total === top && pool.length > 1) good(`Led the damage race with ${share}% of everything dealt.`);
    else if (pool.length > 1 && share <= Math.floor(50 / pool.length)) bad(`Only ${share}% of the damage dealt came from ${c.name}.`);
  } else if (c.isPlayer && o.shots >= 2 && c.damage.total === 0) {
    bad("Fired shots but never did any damage.");
  }
  if (c.damage.takedowns > 0) good(`Landed the finishing blow ${c.damage.takedowns} time${c.damage.takedowns === 1 ? "" : "s"}.`);
  const withDmg = c.slugs.filter((s) => s.damage > 0);
  if (withDmg.length >= 2) good(`Best slug: ${withDmg[0].name} — ${withDmg[0].damage} damage across ${withDmg[0].shots} shot${withDmg[0].shots === 1 ? "" : "s"}.`);
  const poorSlug = c.slugs.find((s) => s.shots >= 3 && s.landed / s.shots <= 0.34);
  if (poorSlug) bad(`${poorSlug.name} landed just ${poorSlug.landed} of ${poorSlug.shots} shots — consider using something else.`);
  if (o.wasted > 0) {
    const bits = [];
    if (o.jams) bits.push(`${o.jams} misfire${o.jams === 1 ? "" : "s"}`);
    if (o.tooClose) bits.push(`${o.tooClose} too close`);
    if (o.outOfRange) bits.push(`${o.outOfRange} out of range`);
    if (o.wild) bits.push(`${o.wild} thrown off course`);
    bad(`${o.wasted} shot${o.wasted === 1 ? "" : "s"} wasted (${bits.join(", ")}).`);
  }
  if (c.damage.total >= 8 && c.damage.overkill / (c.damage.total + c.damage.overkill) >= 0.3) {
    bad(`${c.damage.overkill} damage was overkill on already-beaten targets.`);
  }
  if (c.utility.turns >= 2 && c.utility.avgApLeft != null && c.utility.avgApLeft >= 1.5) {
    bad(`Left ${c.utility.avgApLeft} AP unspent on an average turn.`);
  } else if (c.utility.turns >= 2 && c.utility.avgApLeft != null && c.utility.avgApLeft <= 0.3) {
    good("Spent nearly every AP on every turn.");
  }
  const df = c.defense;
  if (df.dodgesTried >= 2) {
    if (df.dodgesWon / df.dodgesTried >= 0.5) good(`Dodged ${df.dodgesWon} of ${df.dodgesTried} attempts.`);
    else bad(`Dodge attempts mostly failed (${df.dodgesWon} of ${df.dodgesTried}) — each one cost AP.`);
  }
  const cs = df.counters;
  if (cs.tried >= 2 && cs.won > cs.lost) good(`Won ${cs.won} of ${cs.tried} counter-clashes.`);
  else if (cs.tried >= 2 && cs.lost > cs.won) bad(`Lost ${cs.lost} of ${cs.tried} counter-clashes.`);
  if (df.shotsFaced >= 3) {
    const evadedPct = (df.missedAgainst + df.evadedAgainst) / df.shotsFaced;
    if (evadedPct >= 0.6) good(`Enemies missed ${Math.round(evadedPct * 100)}% of the shots aimed at ${c.name}.`);
    else if (evadedPct <= 0.2) bad(`Almost every shot aimed at ${c.name} landed (${df.hitsTaken} of ${df.shotsFaced}).`);
  }
  const peerTaken = avg((p) => p.defense.taken);
  if (df.taken > 0 && peerTaken != null && peerTaken > 0 && df.taken >= peerTaken * 1.75) bad(`Took ${df.taken} damage — well above the rest (avg ${Math.round(peerTaken)}).`);
  if (df.downed > 0) bad(`Was knocked down ${df.downed} time${df.downed === 1 ? "" : "s"}.`);
  if (df.koMade > 0 && df.koFailed === 0) good(`Shook off ${df.koMade} knockout roll${df.koMade === 1 ? "" : "s"}.`);
  if (c.healing.given >= 3) good(`Healed allies for ${c.healing.given} Grit.`);
  if (c.offense.nat20 > 0) good(`Rolled ${c.offense.nat20} natural 20${c.offense.nat20 === 1 ? "" : "s"} on attack.`);
  if (c.offense.nat1 > 0) bad(`Rolled ${c.offense.nat1} natural 1${c.offense.nat1 === 1 ? "" : "s"} on attack.`);
  return out.slice(0, 8);
}

export async function buildCombatReport(encounterId) {
  const { rows: encRows } = await pool.query("SELECT * FROM encounters WHERE id = $1", [encounterId]);
  const encounter = encRows[0];
  if (!encounter) return null;
  const { rows: events } = await pool.query("SELECT * FROM combat_events WHERE encounter_id = $1 ORDER BY id ASC", [encounterId]);
  const { rows: combatants } = await pool.query(
    `SELECT c.*, ch.fame AS "fameNow" FROM combatants c LEFT JOIN characters ch ON ch.user_id = c.ref_user_id
     WHERE c.encounter_id = $1`,
    [encounterId]
  );
  const startEvent = events.find((e) => e.type === "start");
  const fameStart = startEvent?.data?.fame || null;
  const list = aggregate(events, combatants, fameStart).map(finalize);

  const insightPool = list.filter((c) => c.isPlayer).length >= 2 ? list.filter((c) => c.isPlayer) : list.filter((c) => c.kind !== "mecha");
  for (const c of list) {
    c.insights = c.kind === "mecha" ? [] : buildInsights(c, insightPool.some((p) => p.id === c.id) ? insightPool : [...insightPool, c]);
  }
  // Players first, then everyone else by damage dealt.
  list.sort((a, b) => Number(b.isPlayer) - Number(a.isPlayer) || b.damage.total - a.damage.total);

  const first = events[0]?.created_at ?? encounter.created_at;
  const last = events[events.length - 1]?.created_at ?? new Date();
  return {
    encounter: {
      id: encounter.id,
      name: encounter.name,
      rounds: encounter.round,
      durationMs: Math.max(0, new Date(last).getTime() - new Date(first).getTime()),
      totalDamage: list.reduce((n, c) => n + c.damage.total, 0),
      totalShots: list.reduce((n, c) => n + c.offense.shots, 0),
    },
    combatants: list,
    awards: buildAwards(list),
  };
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

// Freezes the report, then nudges every recipient (the participating players
// and every DM). One notify per recipient -- the client just refetches its
// list on it (see single-slot-live-signals: no per-row bursts).
export async function publishCombatReport(encounterId) {
  try {
    const { rows: started } = await pool.query("SELECT 1 FROM combat_events WHERE encounter_id = $1 AND type = 'start' LIMIT 1", [encounterId]);
    if (started.length === 0) return null; // ended from setup -- nothing happened
    const report = await buildCombatReport(encounterId);
    if (!report) return null;
    const { rows: combatants } = await pool.query("SELECT ref_user_id, kind, data FROM combatants WHERE encounter_id = $1", [encounterId]);
    const ids = new Set();
    for (const c of combatants) {
      if (c.kind === "character" && c.ref_user_id) ids.add(c.ref_user_id);
      if (c.kind === "mecha" && c.data?.ownerUserId) ids.add(c.data.ownerUserId);
    }
    const { rows: dms } = await pool.query("SELECT id FROM users WHERE role = 'Dungeon Master'");
    for (const dm of dms) ids.add(dm.id);
    const recipients = [...ids];

    const { rows } = await pool.query(
      `INSERT INTO combat_reports (encounter_id, encounter_name, recipients, report)
       VALUES ($1, $2, $3, $4) ON CONFLICT (encounter_id) DO NOTHING RETURNING id`,
      [encounterId, report.encounter.name, JSON.stringify(recipients), JSON.stringify(report)]
    );
    if (!rows[0]) return null;
    for (const userId of recipients) {
      notifyUser(userId, { type: "combat-report-ready", reportId: rows[0].id, encounterName: report.encounter.name, at: Date.now() });
    }
    return rows[0].id;
  } catch (err) {
    console.error("Could not publish combat report:", err);
    return null;
  }
}
