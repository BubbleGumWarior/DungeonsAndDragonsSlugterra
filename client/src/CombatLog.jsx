import { useEffect, useRef, useState } from "react";
import { ScrollIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import "./Panel.css";
import "./CombatLog.css";

const NEAR_BOTTOM_THRESHOLD = 80;

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

// The blow-by-blow battle log -- entirely separate from Party Chat, scoped
// to whichever encounter is currently active. Sits below the Turn Order
// roster so the DM and players can scroll back through exactly what
// happened: hits, fizzles, knockouts, wall breaks, all of it.
export default function CombatLog({ encounterId }) {
  const { token } = useAuth();
  const { combatLogEntry } = useLiveState();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);
  const wasNearBottomRef = useRef(true);

  useEffect(() => {
    if (!token || !encounterId) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/combat/encounters/${encounterId}/log`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setEntries(data.entries || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, encounterId]);

  useEffect(() => {
    if (!combatLogEntry || combatLogEntry.encounterId !== encounterId) return;
    setEntries((prev) => {
      if (prev.some((e) => e.id === combatLogEntry.entry.id)) return prev;
      return [...prev, combatLogEntry.entry];
    });
  }, [combatLogEntry, encounterId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (wasNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries]);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    wasNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD;
  }

  return (
    <div className="panel panel--quiet combat-log">
      <div className="panel-header">
        <span className="panel-header-icon">
          <ScrollIcon weight="duotone" />
        </span>
        <div className="panel-header-text">
          <h2>Combat Log</h2>
          <p>What actually happened, blow by blow</p>
        </div>
      </div>
      <div className="panel-body combat-log-body">
        <div className="combat-log-entries" ref={listRef} onScroll={handleScroll}>
          {loading ? (
            <div className="combat-log-empty">Loading log...</div>
          ) : entries.length === 0 ? (
            <div className="combat-log-empty">Nothing has happened yet.</div>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="combat-log-entry">
                <span className="combat-log-entry-time">{formatTime(e.createdAt)}</span>
                <span className="combat-log-entry-body">{e.body}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
