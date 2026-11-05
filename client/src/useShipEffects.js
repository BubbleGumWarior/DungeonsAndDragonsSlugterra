import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";

// What the ship's online compartments give the crew right now (GET
// /api/ships/effects), re-read whenever the ship changes. `null` until loaded.
export default function useShipEffects() {
  const { token } = useAuth();
  const { shipUpdate } = useLiveState();
  const [effects, setEffects] = useState(null);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    fetch("/api/ships/effects", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.effects) setEffects(data.effects);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, shipUpdate]);

  return effects;
}
