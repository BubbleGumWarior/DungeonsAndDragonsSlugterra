import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ScrollIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { useToast } from "./Toast.jsx";

// More unread reports than this arrive at once -> one summary toast, not a pile.
const MAX_INDIVIDUAL = 2;
const STORE_CAP = 200;

// Reports are only marked "seen" server-side when opened, so remembering what
// was already announced in memory alone re-toasts every unread report on each
// page load. Persist the announced ids per user so each report toasts once.
function loadAnnounced(userId) {
  try {
    const raw = localStorage.getItem(`cr-announced:${userId}`);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveAnnounced(userId, set) {
  try {
    localStorage.setItem(`cr-announced:${userId}`, JSON.stringify([...set].slice(-STORE_CAP)));
  } catch {
    // storage unavailable -- worst case a report toasts again next load
  }
}

// Announces a finished fight's Battle Report. The socket only carries a
// "something is ready" nudge; the list is refetched and any report this user
// hasn't opened or been told about yet is announced once -- so a player who was
// offline when the fight ended still hears about it when they next sign in.
export default function CombatReportToasts() {
  const { token, user } = useAuth();
  const { combatReportReady } = useLiveState();
  const { push } = useToast();
  const navigate = useNavigate();
  const announced = useRef(null);
  const announcedFor = useRef(null);

  const sync = useCallback(async () => {
    if (!token || !user?.id) return;
    let reports;
    try {
      const res = await fetch("/api/combat/reports", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      ({ reports } = await res.json());
    } catch {
      return;
    }
    if (announcedFor.current !== user.id) {
      announced.current = loadAnnounced(user.id);
      announcedFor.current = user.id;
    }
    const fresh = reports.filter((r) => !r.seen && !announced.current.has(r.id));
    if (!fresh.length) return;
    for (const r of fresh) announced.current.add(r.id);
    saveAnnounced(user.id, announced.current);

    if (fresh.length > MAX_INDIVIDUAL) {
      push({
        title: `${fresh.length} battle reports ready`,
        body: "Fights finished while you were away — see who hit hardest and where to improve.",
        icon: <ScrollIcon weight="bold" />,
        duration: 0,
        actions: [{ label: "Read reports", primary: true, onClick: () => navigate(`/combat/reports?id=${fresh[0].id}`) }],
      });
      return;
    }
    for (const r of fresh) {
      push({
        title: "Battle report ready",
        body: `${r.name} — see who hit hardest, who missed most, and where to improve.`,
        icon: <ScrollIcon weight="bold" />,
        duration: 0,
        actions: [{ label: "Read report", primary: true, onClick: () => navigate(`/combat/reports?id=${r.id}`) }],
      });
    }
  }, [token, user?.id, push, navigate]);

  useEffect(() => {
    sync();
  }, [sync, combatReportReady]);

  return null;
}
