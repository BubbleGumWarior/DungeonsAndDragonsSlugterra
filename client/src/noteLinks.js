import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { equipmentSummary, qualityInfo } from "./itemData.js";

// A note links to something with an ordinary markdown link whose address is
// `ref:<kind>/<id>`: [Rusty Longshot](ref:blaster/12). The label lives in the
// note, so the text still reads right after the target is traded away.
export const REF_KINDS = {
  blaster: { label: "Blaster", group: "items", where: "Inventory", route: "/inventory", tab: "blasters" },
  mod: { label: "Mod", group: "items", where: "Inventory", route: "/inventory", tab: "blasters" },
  gear: { label: "Gear", group: "items", where: "Inventory", route: "/inventory", tab: "gear" },
  slug: { label: "Slug", group: "slugs", where: "Slugs", route: "/slugs" },
  pc: { label: "Party member", group: "people", where: "Chronicle", route: "/chronicle", segment: "party" },
  npc: { label: "Character", group: "people", where: "Chronicle", route: "/chronicle", segment: "met" },
};

export const REF_GROUPS = [
  { key: "items", label: "Items" },
  { key: "slugs", label: "Slugs" },
  { key: "people", label: "People" },
];

const REF_PATTERN = /^ref:(blaster|mod|gear|slug|pc|npc)\/(\d+)$/;
const INVENTORY_TAB_KEY = "inventory-tab";

export function parseRef(href) {
  const match = typeof href === "string" ? REF_PATTERN.exec(href) : null;
  return match ? { kind: match[1], id: Number(match[2]) } : null;
}

export function buildRef(kind, id) {
  return `ref:${kind}/${id}`;
}

// Where "Open" goes. The Inventory remembers its tab in localStorage, so setting
// it first lands the player on the shelf the item actually sits on; the
// Chronicle takes its segment from router state.
export function openRefTarget(entry, navigate) {
  const info = REF_KINDS[entry.kind];
  if (info.tab) {
    try {
      localStorage.setItem(INVENTORY_TAB_KEY, info.tab);
    } catch {
      // Blocked storage: the Inventory just opens on its first tab.
    }
  }
  navigate(info.route, info.segment ? { state: { segment: info.segment } } : undefined);
}

const authed = (token) => ({ headers: { Authorization: `Bearer ${token}` } });
const load = (url, token) =>
  fetch(url, authed(token))
    .then((res) => (res.ok ? res.json() : {}))
    .catch(() => ({}));

// Everything a note can point at: what the caller owns, plus the people in the
// Chronicle. Reloads when ownership shifts (a trade, a purchase, a catch).
export function useNoteLinkables() {
  const { token, user } = useAuth();
  // The DM reads everyone's notes, so their chips must resolve against
  // everyone's things, not just the (usually empty) pack they carry.
  const scope = user?.role === "Dungeon Master" ? "" : "/me";
  const { tradeCompleted, marketChanged, slugUpdate, equipmentChanged, npcTemplatesUpdate, characterUpdate } = useLiveState();
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      load(`/api/blasters${scope}`, token),
      load(`/api/mods${scope}`, token),
      load(`/api/equipment${scope}`, token),
      load(`/api/slugs${scope}`, token),
      load("/api/chronicle/party", token),
      load("/api/npc-templates", token),
    ]).then(([blasters, mods, equipment, slugs, party, npcs]) => {
      if (!cancelled) setData({ blasters, mods, equipment, slugs, party, npcs });
    });
    return () => {
      cancelled = true;
    };
  }, [token, scope, tradeCompleted, marketChanged, slugUpdate, equipmentChanged, npcTemplatesUpdate, characterUpdate]);

  const entries = useMemo(() => {
    if (!data) return [];
    const out = [];
    for (const b of data.blasters.blasters || []) {
      out.push({ kind: "blaster", id: b.id, name: b.name, sub: `${b.baseType} · ${qualityInfo(b.quality).label}` });
    }
    for (const m of data.mods.mods || []) {
      out.push({ kind: "mod", id: m.id, name: m.name, sub: m.effect || `${qualityInfo(m.quality).label} mod` });
    }
    for (const e of data.equipment.equipment || []) {
      out.push({ kind: "gear", id: e.id, name: e.name, sub: equipmentSummary(e) });
    }
    for (const s of data.slugs.slugs || []) {
      out.push({
        kind: "slug",
        id: s.id,
        name: s.name,
        sub: `${s.type} slug`,
        image: s.protoformImage || s.velocityImage || null,
      });
    }
    for (const p of data.party.party || []) {
      out.push({ kind: "pc", id: p.userId, name: p.name, sub: "Party", image: p.portrait });
    }
    for (const n of data.npcs.templates || []) {
      // The DM's payload nests the profile; a player's is already flattened.
      const role = n.profile?.fields?.role?.value || n.fields?.role || n.fields?.faction || "";
      out.push({ kind: "npc", id: n.id, name: n.name, sub: role || "Chronicle", image: n.image });
    }
    return out;
  }, [data]);

  const index = useMemo(() => new Map(entries.map((e) => [`${e.kind}/${e.id}`, e])), [entries]);
  const lookup = useCallback((kind, id) => index.get(`${kind}/${id}`) || null, [index]);

  return { entries, lookup, loaded: data !== null };
}
