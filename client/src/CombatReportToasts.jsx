import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ScrollIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { useToast } from "./Toast.jsx";

// Announces a finished fight's Battle Report. The socket only carries a
// "something is ready" nudge; the list is refetched and any report this user
// hasn't opened yet is announced once -- so a player who was offline when the
// fight ended still hears about it when they next sign in.
export default function CombatReportToasts() {
  const { token } = useAuth();
  const { combatReportReady } = useLiveState();
  const { push } = useToast();
  const navigate = useNavigate();
  const announced = useRef(new Set());

  const sync = useCallback(async () => {
    if (!token) return;
    let reports;
    try {
      const res = await fetch("/api/combat/reports", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      ({ reports } = await res.json());
    } catch {
      return;
    }
    for (const r of reports) {
      if (r.seen || announced.current.has(r.id)) continue;
      announced.current.add(r.id);
      push({
        title: "Battle report ready",
        body: `${r.name} — see who hit hardest, who missed most, and where to improve.`,
        icon: <ScrollIcon weight="bold" />,
        duration: 0,
        actions: [{ label: "Read report", primary: true, onClick: () => navigate(`/combat/reports?id=${r.id}`) }],
      });
    }
  }, [token, push, navigate]);

  useEffect(() => {
    sync();
  }, [sync, combatReportReady]);

  return null;
}
