import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";

// The party's voyage as the server sees it (GET /api/travel): the day count,
// the ship's speed, any open destination vote and the route list from where
// the party is docked. Re-reads on every `travel-updated` nudge and whenever
// the party's location changes, so everyone's view follows the vote live.
export default function useTravel() {
  const { token } = useAuth();
  const { travelUpdate, shipUpdate, slugHuntArea } = useLiveState();
  const [travel, setTravel] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/travel", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load travel.");
      setTravel(data);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load, travelUpdate, shipUpdate, slugHuntArea]);

  // POST one of the travel actions (propose, vote, withdraw, depart, abort).
  // The follow-up `travel-updated` broadcast refreshes everyone, this client
  // included; the explicit load just keeps it snappy.
  const act = useCallback(
    async (action, body) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/travel/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body ?? {}),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "That didn't work.");
        await load();
        return data;
      } catch (err) {
        setError(err.message);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [token, load]
  );

  return { travel, error, busy, act };
}
