import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";

// The catalog sorted into climates by the middle of each comfort range, so a
// 60-outfit catalog reads as "what do I hand someone for a hot world".
export const CLIMATE_GROUPS = [
  { key: "any", label: "Any climate", test: (t) => t.comfortMax >= 500 },
  { key: "freezing", label: "Freezing", test: (t) => (t.comfortMin + t.comfortMax) / 2 < -10 },
  { key: "cold", label: "Cold", test: (t) => (t.comfortMin + t.comfortMax) / 2 < 10 },
  { key: "mild", label: "Mild", test: (t) => (t.comfortMin + t.comfortMax) / 2 < 25 },
  { key: "hot", label: "Hot", test: () => true },
];

export function climateOf(template) {
  return CLIMATE_GROUPS.find((g) => g.test(template)).key;
}

// The DM's side of the Wardrobe: the outfit catalog, who owns what and is
// wearing it, plus handing one over or taking one away.
export default function useDmOutfits() {
  const { token } = useAuth();
  const { outfitsChanged } = useLiveState();
  const [characters, setCharacters] = useState([]);
  const [outfits, setOutfits] = useState([]);
  const [templates, setTemplates] = useState([]);

  const load = useCallback(() => {
    fetch("/api/outfits", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setOutfits(data.outfits || []))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    fetch("/api/characters", { headers })
      .then((res) => res.json())
      .then((data) => setCharacters(data.characters || []))
      .catch(() => {});
    fetch("/api/outfits/templates", { headers })
      .then((res) => res.json())
      .then((data) => setTemplates(data.templates || []))
      .catch(() => {});
  }, [token]);

  useEffect(load, [load, outfitsChanged]);

  async function grant(userId, templateId) {
    const res = await fetch("/api/outfits", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId, templateId }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not grant that outfit.");
    load();
  }

  async function remove(outfit) {
    const res = await fetch(`/api/outfits/${outfit.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not remove that outfit.");
    load();
  }

  return { characters, outfits, templates, grant, remove };
}
