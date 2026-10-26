// Loyalty growth: a slug earns trust each time it is fired. Wild -> Indifferent
// takes LOYALTY_BASE_SHOTS shots and every later tier asks LOYALTY_SHOT_GROWTH
// times more than the last. Slug Handling trims the shots needed by a
// percentage, so a good handler climbs the higher tiers far faster.
//
// Progress is stored on the slug as a fraction (0 to 1) of the tier it is
// working through, never as a count: each shot adds 1 / (shots needed for the
// owner's handling right now). Players only ever see that fraction. Mirrored by
// client/src/loyaltyData.js (display only -- the server is the referee).
import { LOYALTY_TIER_MAX } from "./slugRules.js";

// Mirrors LOYALTY_TIER_LABELS in client/src/slugData.js (used for log lines).
export const LOYALTY_TIER_LABELS = ["Wild", "Indifferent", "Friendly", "Loyal", "Bonded"];

export const LOYALTY_BASE_SHOTS = 20;
export const LOYALTY_SHOT_GROWTH = 1.5;
export const LOYALTY_HANDLING_CUT = 0.08; // fewer shots needed, per point of Slug Handling
export const LOYALTY_MAX_CUT = 0.5;

// Shots to climb out of `tier` at this Slug Handling modifier, or null once Bonded.
export function shotsForNextTier(tier, handlingMod = 0) {
  if (!Number.isInteger(tier) || tier >= LOYALTY_TIER_MAX) return null;
  const cut = Math.min(LOYALTY_MAX_CUT, LOYALTY_HANDLING_CUT * Math.max(0, handlingMod || 0));
  return Math.max(1, Math.ceil(LOYALTY_BASE_SHOTS * LOYALTY_SHOT_GROWTH ** Math.max(0, tier) * (1 - cut)));
}

// The share of a tier one shot is worth.
export function loyaltyPerShot(tier, handlingMod = 0) {
  const needed = shotsForNextTier(tier, handlingMod);
  return needed ? 1 / needed : 0;
}

// What the DM reads: shots done and needed at the owner's handling right now.
export function loyaltyShotsReadout(tier, progress, handlingMod = 0) {
  const needed = shotsForNextTier(tier, handlingMod);
  if (needed == null) return null;
  return { done: Math.min(needed, Math.round((progress || 0) * needed)), needed };
}

// Close enough to full that float drift from summing 1/n shouldn't strand a slug.
export const LOYALTY_FULL_EPSILON = 1e-6;
