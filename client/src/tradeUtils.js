// Human summary of one side of a trade: "Twin Slinger, Reflex Optic, 40 credits, 2 pods".
export function describeSide(items, credits, pods) {
  const parts = items.map((it) => it.name);
  if (credits > 0) parts.push(`${credits} credits`);
  if (pods > 0) parts.push(`${pods} pod${pods === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(", ") : "nothing";
}

export const ITEM_KIND_LABELS = {
  blaster: "Blaster",
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
