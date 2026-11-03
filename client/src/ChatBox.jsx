import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownIcon,
  ChatCircleDotsIcon,
  DiceSixIcon,
  MagnifyingGlassIcon,
  ScrollIcon,
  SparkleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import Die, { keptIndex } from "./Die.jsx";
import { formatModifier } from "./characterData.js";
import ChatComposer from "./ChatComposer.jsx";
import ChatRichText from "./ChatRichText.jsx";
import "./Panel.css";
import "./ChatBox.css";

const NEAR_BOTTOM_THRESHOLD = 80;
const GROUP_WINDOW_MS = 4 * 60 * 1000;
const TAB_KEY = "chatbox-tab";

const TABS = [
  { id: "chat", label: "Chat", Icon: ChatCircleDotsIcon, subtitle: "Talk with everyone at the table" },
  { id: "events", label: "Events", Icon: ScrollIcon, subtitle: "Rolls and slug hunts, as they happen" },
];

// Slug hunts and dice rolls are written by the server with no sender (or as
// "System"); everything a player or the DM typed has a user behind it.
const isEvent = (msg) => msg.userId == null || msg.role === "System";

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Events can span several sessions, so older ones carry their day.
function formatStamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = formatTime(iso);
  const now = new Date();
  if (sameDay(date, now)) return time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return `Yesterday ${time}`;
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`;
}

function readStoredTab() {
  try {
    const stored = localStorage.getItem(TAB_KEY);
    return TABS.some((t) => t.id === stored) ? stored : "chat";
  } catch {
    return "chat";
  }
}

/* ---------- Image attachments ---------- */

function ImageLightbox({ src, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="chat-lightbox"
      aria-label="Image preview"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current.close();
      }}
    >
      <img src={src} alt="Full size attachment" />
      <button type="button" className="chat-lightbox-close" aria-label="Close preview" onClick={() => ref.current?.close()}>
        <XIcon weight="bold" />
      </button>
    </dialog>
  );
}

function ImageGrid({ images, onOpen }) {
  return (
    <div className={`chat-images chat-images--${Math.min(images.length, 3)}`}>
      {images.map((src, i) => (
        <button key={i} type="button" className="chat-image" aria-label={`Open image ${i + 1} of ${images.length}`} onClick={() => onOpen(src)}>
          <img src={src} alt="" loading="lazy" />
        </button>
      ))}
    </div>
  );
}

/* ---------- Chat view ---------- */

function ChatMessage({ msg, isSelf, isFirst, isFresh, onOpenImage }) {
  const isDm = msg.role === "Dungeon Master";
  const images = msg.images ?? [];
  return (
    <article
      className={`chat-msg${isSelf ? " chat-msg--self" : ""}${isDm ? " chat-msg--dm" : ""}${isFirst ? " chat-msg--first" : ""}${
        isFresh ? " chat-msg--enter" : ""
      }`}
    >
      {isFirst && (
        <header className="chat-msg-meta">
          <span className="chat-msg-author">{msg.author ?? msg.username}</span>
          {isDm && <span className="chat-msg-tag">DM</span>}
          <time className="chat-msg-time" dateTime={msg.createdAt}>
            {formatTime(msg.createdAt)}
          </time>
        </header>
      )}
      <div className="chat-msg-bubble" title={isFirst ? undefined : formatTime(msg.createdAt)}>
        {msg.body && <ChatRichText source={msg.body} />}
        {images.length > 0 && <ImageGrid images={images} onOpen={onOpenImage} />}
      </div>
    </article>
  );
}

/* ---------- Events view ---------- */

function DiceRollEvent({ msg, isFresh }) {
  const { meta } = msg;
  const typeLabel = meta.rollType === "advantage" ? "Advantage" : meta.rollType === "disadvantage" ? "Disadvantage" : null;

  return (
    <li className={`chat-event chat-event--roll${isFresh ? " chat-event--enter" : ""}`}>
      <span className="chat-event-node" aria-hidden="true">
        <DiceSixIcon weight="bold" />
      </span>
      <div className="chat-event-main">
        <div className="chat-event-head">
          <span className="chat-event-title">
            <strong>{meta.targetName}</strong> rolled {meta.skillLabel}{" "}
            <span className="chat-event-dim num-tabular">({formatModifier(meta.modifier)})</span>
            {typeLabel && <span className="chat-event-dim"> · {typeLabel}</span>}
          </span>
          <time className="chat-event-time" dateTime={msg.createdAt}>
            {formatStamp(msg.createdAt)}
          </time>
        </div>

        <div className="chat-roll-results">
          {meta.results.map((r, i) => {
            const idx = keptIndex(r.values, meta.rollType);
            return (
              <div key={i} className="chat-roll-group">
                <div className="chat-roll-dice">
                  {r.values.map((v, vi) => (
                    <Die key={vi} value={v} size="sm" state={r.values.length > 1 ? (vi === idx ? "kept" : "discarded") : null} />
                  ))}
                </div>
                <span className="chat-roll-arrow" aria-hidden="true">
                  →
                </span>
                <span className="chat-roll-total-label">
                  <span className="chat-roll-total num-tabular">{r.total}</span>
                  <span className="chat-roll-caption">result</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </li>
  );
}

// Slug hunt lines are server-written sentences. A DM-role row means the hunt
// found something; anything else is a miss.
function HuntEvent({ msg, isFresh }) {
  const found = msg.role === "Dungeon Master";
  const text = (msg.body ?? "").replace(/ -- /g, " — ");
  return (
    <li className={`chat-event chat-event--hunt${found ? " chat-event--found" : ""}${isFresh ? " chat-event--enter" : ""}`}>
      <span className="chat-event-node" aria-hidden="true">
        {found ? <SparkleIcon weight="fill" /> : <MagnifyingGlassIcon weight="bold" />}
      </span>
      <div className="chat-event-main">
        <div className="chat-event-head">
          <span className="chat-event-label">{found ? "Slug found" : "Nothing found"}</span>
          <time className="chat-event-time" dateTime={msg.createdAt}>
            {formatStamp(msg.createdAt)}
          </time>
        </div>
        <p className="chat-event-text">{text}</p>
      </div>
    </li>
  );
}

function GenericEvent({ msg, isFresh }) {
  return (
    <li className={`chat-event${isFresh ? " chat-event--enter" : ""}`}>
      <span className="chat-event-node" aria-hidden="true">
        <ScrollIcon weight="bold" />
      </span>
      <div className="chat-event-main">
        <div className="chat-event-head">
          <span className="chat-event-label">{msg.author ?? msg.username}</span>
          <time className="chat-event-time" dateTime={msg.createdAt}>
            {formatStamp(msg.createdAt)}
          </time>
        </div>
        <p className="chat-event-text">{msg.body}</p>
      </div>
    </li>
  );
}

function EventEntry({ msg, isFresh }) {
  if (msg.meta?.type === "dice-roll") return <DiceRollEvent msg={msg} isFresh={isFresh} />;
  if (msg.username === "Slug Hunt") return <HuntEvent msg={msg} isFresh={isFresh} />;
  return <GenericEvent msg={msg} isFresh={isFresh} />;
}

/* ---------- Scrolling feed ---------- */

// A scroll area that follows new content only while the reader is already at
// the bottom, so scrolling up to read history isn't yanked away. Content that
// grows after render (images loading) is followed through a ResizeObserver.
function Feed({ active, id, label, empty, loading, count, children, className = "" }) {
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const stuckRef = useRef(true);
  const [away, setAway] = useState(false);

  const toBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    if (active && stuckRef.current) toBottom();
  }, [active, count, toBottom]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stuckRef.current) toBottom();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [toBottom, loading]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el || !active) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD;
    stuckRef.current = near;
    setAway((prev) => (prev === !near ? prev : !near));
  }

  return (
    <div
      className={`chat-feed ${className}`}
      role="tabpanel"
      id={`chatbox-panel-${id}`}
      aria-labelledby={`chatbox-tab-${id}`}
      hidden={!active}
    >
      <div className="chat-scroll" ref={scrollRef} onScroll={handleScroll} aria-label={label} tabIndex={0}>
        <div className="chat-scroll-content" ref={contentRef}>
          {loading ? <div className="chat-empty">Loading...</div> : count === 0 ? empty : children}
        </div>
      </div>
      {away && active && (
        <button
          type="button"
          className="chat-latest"
          onClick={() => {
            stuckRef.current = true;
            setAway(false);
            toBottom();
          }}
        >
          <ArrowDownIcon weight="bold" />
          Latest
        </button>
      )}
    </div>
  );
}

/* ---------- Panel ---------- */

export default function ChatBox() {
  const { token, user } = useAuth();
  const { chatMessage } = useLiveState();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(readStoredTab);
  const [unread, setUnread] = useState({ chat: 0, events: 0 });
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  // Ids that should play the entrance animation: only messages that arrived
  // live after the initial history load, never the whole history at once.
  const freshIdsRef = useRef(new Set());
  const lastIdRef = useRef(0);
  const countedIdRef = useRef(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const mergeMessages = useCallback((incoming, { live }) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const added = incoming.filter((m) => !known.has(m.id));
      if (added.length === 0) return prev;
      if (live) added.forEach((m) => freshIdsRef.current.add(m.id));
      return [...prev, ...added].sort((a, b) => a.id - b.id);
    });
    lastIdRef.current = Math.max(lastIdRef.current, ...incoming.map((m) => m.id));
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch("/api/chat/messages", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const list = data.messages || [];
        lastIdRef.current = list.reduce((max, m) => Math.max(max, m.id), 0);
        countedIdRef.current = lastIdRef.current;
        setMessages(list);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // The socket holds only the latest message, and a slug hunt or a roll can
  // post two lines back to back. Take the pushed one for speed, then ask the
  // server for anything after what we had so none are missed.
  useEffect(() => {
    if (!chatMessage || !token) return;
    const baseline = lastIdRef.current;
    mergeMessages([chatMessage], { live: true });
    let cancelled = false;
    fetch(`/api/chat/messages?after=${baseline}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) mergeMessages(data.messages || [], { live: true });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [chatMessage, token, mergeMessages]);

  const chatItems = useMemo(() => messages.filter((m) => !isEvent(m)), [messages]);
  const eventItems = useMemo(() => messages.filter(isEvent), [messages]);

  // Count arrivals on the tab the reader isn't looking at.
  useEffect(() => {
    if (countedIdRef.current == null) return;
    const fresh = messages.filter((m) => m.id > countedIdRef.current && m.userId !== user?.id);
    if (fresh.length === 0) {
      countedIdRef.current = Math.max(countedIdRef.current, lastIdRef.current);
      return;
    }
    countedIdRef.current = Math.max(...fresh.map((m) => m.id), lastIdRef.current);
    const other = tabRef.current === "chat" ? "events" : "chat";
    const n = fresh.filter((m) => (isEvent(m) ? "events" : "chat") === other).length;
    if (n > 0) setUnread((prev) => ({ ...prev, [other]: prev[other] + n }));
  }, [messages, user?.id]);

  function selectTab(id) {
    setTab(id);
    setUnread((prev) => ({ ...prev, [id]: 0 }));
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      /* storage can be blocked; the tab just won't be remembered */
    }
  }

  function handleTabKeys(e) {
    const index = TABS.findIndex((t) => t.id === tab);
    let next = null;
    if (e.key === "ArrowRight") next = TABS[(index + 1) % TABS.length];
    else if (e.key === "ArrowLeft") next = TABS[(index - 1 + TABS.length) % TABS.length];
    else if (e.key === "Home") next = TABS[0];
    else if (e.key === "End") next = TABS[TABS.length - 1];
    if (!next) return;
    e.preventDefault();
    selectTab(next.id);
    document.getElementById(`chatbox-tab-${next.id}`)?.focus();
  }

  async function handleSend() {
    const body = draft.trim();
    if ((!body && images.length === 0) || sending) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body, images }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Message could not be sent.");
      }
      const data = await res.json().catch(() => ({}));
      if (data.message) mergeMessages([data.message], { live: true });
      setDraft("");
      setImages([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="panel chatbox">
      <div className="panel-header chatbox-header">
        <span className="panel-header-icon">
          <ChatCircleDotsIcon weight="duotone" />
        </span>
        <div className="panel-header-text">
          <h2>Party Chat</h2>
          <p>{activeTab.subtitle}</p>
        </div>

        <div className="chat-tabs" role="tablist" aria-label="Party Chat views" onKeyDown={handleTabKeys} data-active={tab}>
          <span className="chat-tabs-thumb" aria-hidden="true" />
          {TABS.map(({ id, label, Icon }) => {
            const count = unread[id];
            return (
              <button
                key={id}
                id={`chatbox-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls={`chatbox-panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                className="chat-tab"
                onClick={() => selectTab(id)}
              >
                <Icon weight={tab === id ? "fill" : "bold"} />
                <span>{label}</span>
                {count > 0 && (
                  <span className="chat-tab-badge num-tabular">
                    {count > 9 ? "9+" : count}
                    <span className="sr-only"> new</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel-body chatbox-body">
        <Feed
          id="chat"
          active={tab === "chat"}
          label="Messages"
          loading={loading}
          count={chatItems.length}
          empty={<div className="chat-empty">No messages yet. Say something to break the ice.</div>}
        >
          {chatItems.map((msg, i) => {
            const prev = chatItems[i - 1];
            const grouped =
              prev &&
              prev.userId === msg.userId &&
              prev.role === msg.role &&
              new Date(msg.createdAt) - new Date(prev.createdAt) < GROUP_WINDOW_MS;
            return (
              <ChatMessage
                key={msg.id}
                msg={msg}
                isSelf={msg.userId === user?.id}
                isFirst={!grouped}
                isFresh={freshIdsRef.current.has(msg.id)}
                onOpenImage={setLightbox}
              />
            );
          })}
        </Feed>

        <Feed
          id="events"
          active={tab === "events"}
          label="Event log"
          className="chat-feed--events"
          loading={loading}
          count={eventItems.length}
          empty={<div className="chat-empty">Nothing has happened yet. Rolls and slug hunts will be logged here.</div>}
        >
          <ol className="chat-timeline">
            {eventItems.map((msg) => (
              <EventEntry key={msg.id} msg={msg} isFresh={freshIdsRef.current.has(msg.id)} />
            ))}
          </ol>
        </Feed>

        {tab === "chat" ? (
          <ChatComposer
            draft={draft}
            setDraft={setDraft}
            images={images}
            setImages={setImages}
            onSend={handleSend}
            sending={sending}
            error={error}
            setError={setError}
          />
        ) : (
          <p className="chat-events-note">Logged automatically. Switch to Chat to write something.</p>
        )}
      </div>

      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
