import { useEffect, useRef, useState } from "react";
import { ChatCircleDotsIcon, DiceSixIcon, PaperPlaneRightIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import Die, { keptIndex } from "./Die.jsx";
import { formatModifier } from "./characterData.js";
import "./Panel.css";
import "./ChatBox.css";

const NEAR_BOTTOM_THRESHOLD = 80;

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function DiceRollLogEntry({ msg, isFresh }) {
  const { meta } = msg;
  const typeLabel = meta.rollType === "advantage" ? "Advantage" : meta.rollType === "disadvantage" ? "Disadvantage" : null;

  return (
    <div className={`chatbox-diceroll${isFresh ? " chatbox-message--enter" : ""}`}>
      <div className="chatbox-diceroll-head">
        <DiceSixIcon weight="bold" />
        <span className="chatbox-diceroll-title">
          {meta.targetName} rolled {meta.skillLabel}{" "}
          <span className="chatbox-diceroll-mod num-tabular">({formatModifier(meta.modifier)})</span>
          {typeLabel && <span className="chatbox-diceroll-type"> · {typeLabel}</span>}
        </span>
        <span className="chatbox-diceroll-time">{formatTime(msg.createdAt)}</span>
      </div>

      <div className="chatbox-diceroll-results">
        {meta.results.map((r, i) => {
          const idx = keptIndex(r.values, meta.rollType);
          return (
            <div key={i} className="chatbox-diceroll-group">
              <div className="chatbox-diceroll-dice">
                {r.values.map((v, vi) => (
                  <Die key={vi} value={v} size="sm" state={r.values.length > 1 ? (vi === idx ? "kept" : "discarded") : null} />
                ))}
              </div>
              <span className="chatbox-diceroll-arrow">→</span>
              <span className="chatbox-diceroll-total-label">
                <span className="chatbox-diceroll-total num-tabular">{r.total}</span>
                <span className="chatbox-diceroll-total-caption">result</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ChatBox() {
  const { token, user } = useAuth();
  const { chatMessage } = useLiveState();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const listRef = useRef(null);
  const wasNearBottomRef = useRef(true);
  // Ids that should play the entrance animation: only messages that arrived
  // live after the initial history load, never the whole history at once.
  const freshIdsRef = useRef(new Set());

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch("/api/chat/messages", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!chatMessage) return;
    setMessages((prev) => {
      if (prev.some((m) => m.id === chatMessage.id)) return prev;
      freshIdsRef.current.add(chatMessage.id);
      return [...prev, chatMessage];
    });
  }, [chatMessage]);

  // Only auto-scroll when the reader was already near the bottom, so
  // scrolling up to read history isn't yanked away by new messages.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (wasNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    wasNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Message could not be sent.");
      }
      setDraft("");
      wasNearBottomRef.current = true;
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="panel chatbox">
      <div className="panel-header">
        <span className="panel-header-icon">
          <ChatCircleDotsIcon weight="duotone" />
        </span>
        <div className="panel-header-text">
          <h2>Party Chat</h2>
          <p>Talk with everyone at the table</p>
        </div>
      </div>

      <div className="panel-body chatbox-body">
        <div className="chatbox-messages" ref={listRef} onScroll={handleScroll}>
          {loading ? (
            <div className="chatbox-empty">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="chatbox-empty">No messages yet. Say something to break the ice.</div>
          ) : (
            messages.map((msg) =>
              msg.role === "System" && msg.meta?.type === "dice-roll" ? (
                <DiceRollLogEntry key={msg.id} msg={msg} isFresh={freshIdsRef.current.has(msg.id)} />
              ) : msg.role === "System" ? (
                <div
                  key={msg.id}
                  className={`chatbox-system-line${freshIdsRef.current.has(msg.id) ? " chatbox-message--enter" : ""}`}
                >
                  <DiceSixIcon weight="bold" />
                  <span>{msg.body}</span>
                </div>
              ) : (
              <div
                key={msg.id}
                className={`chatbox-message${msg.role === "Dungeon Master" ? " chatbox-message--dm" : ""}${
                  msg.userId === user?.id ? " chatbox-message--self" : ""
                }${freshIdsRef.current.has(msg.id) ? " chatbox-message--enter" : ""}`}
              >
                <div className="chatbox-message-meta">
                  <span className="chatbox-message-author">{msg.username}</span>
                  <span className="chatbox-message-time">{formatTime(msg.createdAt)}</span>
                </div>
                <p className="chatbox-message-text">{msg.body}</p>
              </div>
              )
            )
          )}
        </div>

        <form className="chatbox-input-row" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Say something..."
            value={draft}
            maxLength={1000}
            onChange={(e) => setDraft(e.target.value)}
            disabled={sending}
          />
          <button type="submit" className="panel-btn panel-btn--icon" disabled={sending || !draft.trim()}>
            <PaperPlaneRightIcon weight="bold" />
          </button>
        </form>
        {error && <p className="panel-error">{error}</p>}
      </div>
    </div>
  );
}
