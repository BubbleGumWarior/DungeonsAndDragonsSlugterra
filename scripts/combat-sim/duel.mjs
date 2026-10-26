// One 1v1 fight, start to finish: initiative, alternating turns (everyone starts
// with full AP so the second mover can react in round 1), first to be knocked
// unconscious loses. Hitting the round cap is a draw.
import * as E from "./engine.mjs";
import { takeTurn, DEFAULT_POLICY } from "./policy.mjs";

export const DEFAULT_CFG = { loadout: "standard", startDist: 450, maxRounds: 30, polA: DEFAULT_POLICY, polB: DEFAULT_POLICY };

export function runDuel(buildA, buildB, cfg, seed) {
  const rng = E.mulberry32(seed);
  const A = E.makeCombatant(buildA, cfg.loadoutA ?? cfg.loadout, 0, cfg.ablate);
  const B = E.makeCombatant(buildB, cfg.loadoutB ?? cfg.loadout, 1, cfg.ablate);
  const sd = typeof cfg.startDist === "function" ? cfg.startDist(rng) : cfg.startDist;
  A.pos = 0;
  B.pos = sd;
  const ctx = { rng, fighters: [A, B], pol: [cfg.polA ?? DEFAULT_POLICY, cfg.polB ?? DEFAULT_POLICY], log: cfg.log };

  // Initiative: d20 + DEX mod, ties broken by DEX mod then a coin flip.
  const ia = E.d20(rng) + A.initMod;
  const ib = E.d20(rng) + B.initMod;
  const aFirst = ia !== ib ? ia > ib : A.initMod !== B.initMod ? A.initMod > B.initMod : rng() < 0.5;
  const order = aFirst ? [A, B] : [B, A];

  let round = 1;
  let turnNo = 0;
  let winner = -1;
  outer: for (; round <= cfg.maxRounds; round++) {
    for (let i = 0; i < 2; i++) {
      const actor = order[i];
      const foe = order[1 - i];
      if (turnNo > 0) E.startTurn(ctx, actor); // the opening turn starts with a full AP bar already
      turnNo++;
      if (actor.unconscious || foe.unconscious) { winner = actor.unconscious ? foe.idx : actor.idx; break outer; }
      actor.stats.turns++;
      takeTurn(ctx, actor, foe, ctx.pol[actor.idx]);
      actor.stats.apUnspent += actor.current_ap;
      if (A.unconscious || B.unconscious) { winner = A.unconscious ? 1 : 0; break outer; }
    }
  }
  return {
    winner, rounds: Math.min(round, cfg.maxRounds), aFirst,
    a: summary(A), b: summary(B),
  };
}

function summary(c) {
  return { ...c.stats, gritLeft: c.current_grit, maxGrit: c.max_grit, ko: c.unconscious ? 1 : 0, pipsUsed: c.knockout_pips.filter(Boolean).length, maxAp: c.max_ap };
}
