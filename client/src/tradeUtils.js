import { SUPPLIES } from "./careData.js";

// Consumables that can be traded (pods have their own amount fields): the
// character-record field and the name to show.
export const TRADEABLE_SUPPLIES = SUPPLIES.filter((s) => s.key !== "pods").map((s) => ({ field: s.field, name: s.name }));

// Human summary of one side of a trade: "Twin Slinger, 40 credits, 2 pods, 3 Medpacks".
export function describeSide(items, credits, pods, supplies = {}) {
  const parts = items.map((it) => it.name);
  if (credits > 0) parts.push(`${credits} credits`);
  if (pods > 0) parts.push(`${pods} pod${pods === 1 ? "" : "s"}`);
  for (const s of TRADEABLE_SUPPLIES) {
    const n = supplies?.[s.field] ?? 0;
    if (n > 0) parts.push(`${n} ${n === 1 ? s.name.replace(/s$/, "") : s.name}`);
  }
  return parts.length > 0 ? parts.join(", ") : "nothing";
}

export const ITEM_KIND_LABELS = {
  blaster: "Blaster",
  equipment: "Equipment Piece",
  mod: "Blaster Mod",
  slug: "Slug",
  mecha: "Mecha-Beast",
  mecha_mod: "Mecha Mod",
};

export async function tradeAction(token, id, action) {
  const res = await fetch(`/api/trades/${id}/${action}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "That didn't work.");
  return data;
}
