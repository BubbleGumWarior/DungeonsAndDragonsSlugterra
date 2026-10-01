import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowsLeftRightIcon, CheckIcon, HandshakeIcon, PackageIcon, CoinsIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { useToast } from "./Toast.jsx";
import { ITEM_KIND_LABELS, describeSide, tradeAction } from "./tradeUtils.js";
import "./Panel.css";
import "./Trading.css";

const keyOf = (it) => `${it.kind}:${it.id}`;

function emptyComposer() {
  return { toUserId: "", give: new Set(), ask: new Set(), giveCredits: "", askCredits: "", givePods: "", askPods: "", counterOf: null };
}

export default function Trading() {
  const { token, user } = useAuth();
  const { tradeChanged, tradeCompleted, marketChanged } = useLiveState();
  const { push } = useToast();
  const [trades, setTrades] = useState([]);
  const [players, setPlayers] = useState([]);
  const [mine, setMine] = useState({ items: [], credits: 0, pods: 0 });
  const [theirs, setTheirs] = useState({ items: [], credits: 0, pods: 0 });
  const [composer, setComposer] = useState(emptyComposer);
  const [sending, setSending] = useState(false);
  const composerRef = useRef(null);
  const headers = { Authorization: `Bearer ${token}` };

  const loadTrades = useCallback(() => {
    fetch("/api/trades", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((b) => setTrades(b.trades || []))
      .catch(() => {});
  }, [token]);

  const loadMine = useCallback(() => {
    fetch("/api/trades/inventory/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((b) => setMine({ items: b.items || [], credits: b.credits ?? 0, pods: b.pods ?? 0 }))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    fetch("/api/trades/players", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((b) => setPlayers(b.players || []))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    loadTrades();
    loadMine();
  }, [loadTrades, loadMine, tradeChanged, tradeCompleted, marketChanged]);

  useEffect(() => {
    if (!composer.toUserId) {
      setTheirs({ items: [], credits: 0, pods: 0 });
      return;
    }
    fetch(`/api/trades/inventory/${composer.toUserId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((b) => setTheirs({ items: b.items || [], credits: b.credits ?? 0, pods: b.pods ?? 0 }))
      .catch(() => {});
  }, [composer.toUserId, token, tradeCompleted]);

  function toggle(side, item) {
    setComposer((c) => {
      const next = new Set(c[side]);
      const k = keyOf(item);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return { ...c, [side]: next };
    });
  }

  const refsOf = (set) => [...set].map((k) => ({ kind: k.split(":")[0], id: Number(k.split(":")[1]) }));
  const num = (v) => (v === "" ? 0 : Number(v));

  async function send(e) {
    e.preventDefault();
    setSending(true);
    try {
      const path = composer.counterOf ? `/api/trades/${composer.counterOf}/counter` : "/api/trades";
      const res = await fetch(path, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          toUserId: Number(composer.toUserId),
          give: refsOf(composer.give),
          ask: refsOf(composer.ask),
          giveCredits: num(composer.giveCredits),
          askCredits: num(composer.askCredits),
          givePods: num(composer.givePods),
          askPods: num(composer.askPods),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not send that.");
      push({ tone: "success", title: composer.counterOf ? "Counter-offer sent" : "Offer sent", icon: <HandshakeIcon weight="bold" /> });
      setComposer(emptyComposer());
      loadTrades();
    } catch (err) {
      push({ tone: "warn", title: "Trade not sent", body: err.message });
    } finally {
      setSending(false);
    }
  }

  async function act(trade, action) {
    try {
      await tradeAction(token, trade.id, action);
      if (action === "accept") push({ tone: "success", title: "Trade accepted", body: `Swapped with ${trade.fromName}.`, icon: <HandshakeIcon weight="bold" /> });
      loadTrades();
      loadMine();
    } catch (err) {
      push({ tone: "warn", title: "Trade failed", body: err.message });
      loadTrades();
    }
  }

  function startCounter(t) {
    setComposer({
      toUserId: String(t.fromUserId),
      give: new Set(t.ask.map(keyOf)),
      ask: new Set(t.give.map(keyOf)),
      giveCredits: t.askCredits ? String(t.askCredits) : "",
      askCredits: t.giveCredits ? String(t.giveCredits) : "",
      givePods: t.askPods ? String(t.askPods) : "",
      askPods: t.givePods ? String(t.givePods) : "",
      counterOf: t.id,
    });
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const me = user?.id;
  const incoming = trades.filter((t) => t.status === "pending" && t.toUserId === me);
  const outgoing = trades.filter((t) => t.status === "pending" && t.fromUserId === me);
  const history = trades.filter((t) => t.status !== "pending").slice(0, 8);
  const partner = players.find((p) => String(p.userId) === String(composer.toUserId));

  return (
    <div className="trading">
      {(incoming.length > 0 || outgoing.length > 0) && (
        <section className="trade-section">
          <h2 className="trade-heading">Open offers</h2>
          <div className="trade-list">
            {incoming.map((t) => (
              <TradeCard key={t.id} trade={t} perspective="incoming">
                <button type="button" className="panel-btn" onClick={() => act(t, "accept")}>
                  <CheckIcon weight="bold" />
                  Accept
                </button>
                <button type="button" className="panel-btn panel-btn--ghost" onClick={() => startCounter(t)}>
                  <ArrowsLeftRightIcon weight="bold" />
                  Counter
                </button>
                <button type="button" className="panel-btn panel-btn--ghost" onClick={() => act(t, "decline")}>
                  <XIcon weight="bold" />
                  Decline
                </button>
              </TradeCard>
            ))}
            {outgoing.map((t) => (
              <TradeCard key={t.id} trade={t} perspective="outgoing">
                <button type="button" className="panel-btn panel-btn--ghost" onClick={() => act(t, "cancel")}>
                  <XIcon weight="bold" />
                  Cancel
                </button>
              </TradeCard>
            ))}
          </div>
        </section>
      )}

      <section className="trade-section" ref={composerRef}>
        <h2 className="trade-heading">{composer.counterOf ? "Counter-offer" : "Propose a trade"}</h2>
        <form className="trade-composer" onSubmit={send}>
          <div className="trade-partner">
            <label htmlFor="trade-partner-select">Trade with</label>
            <select
              id="trade-partner-select"
              value={composer.toUserId}
              disabled={Boolean(composer.counterOf)}
              onChange={(e) => setComposer({ ...emptyComposer(), toUserId: e.target.value })}
            >
              <option value="">Choose a player…</option>
              {players.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.name}
                </option>
              ))}
            </select>
            {composer.counterOf && (
              <button type="button" className="panel-btn panel-btn--ghost" onClick={() => setComposer(emptyComposer())}>
                Discard counter
              </button>
            )}
          </div>

          {composer.toUserId && (
            <div className="trade-sides">
              <TradeSide
                title="You give"
                inv={mine}
                selected={composer.give}
                onToggle={(it) => toggle("give", it)}
                credits={composer.giveCredits}
                pods={composer.givePods}
                onCredits={(v) => setComposer((c) => ({ ...c, giveCredits: v }))}
                onPods={(v) => setComposer((c) => ({ ...c, givePods: v }))}
                lockInTrade
              />
              <TradeSide
                title={`You ask from ${partner?.name ?? "them"}`}
                inv={theirs}
                selected={composer.ask}
                onToggle={(it) => toggle("ask", it)}
                credits={composer.askCredits}
                pods={composer.askPods}
                onCredits={(v) => setComposer((c) => ({ ...c, askCredits: v }))}
                onPods={(v) => setComposer((c) => ({ ...c, askPods: v }))}
              />
            </div>
          )}

          {composer.toUserId && (
            <div className="trade-send-row">
              <p className="trade-note">
                Anything equipped is automatically unequipped when the trade completes. Mods and slugs on a traded blaster stay
                with you unless you add them to the trade.
              </p>
              <button type="submit" className="panel-btn" disabled={sending}>
                <HandshakeIcon weight="bold" />
                {composer.counterOf ? "Send counter-offer" : "Send offer"}
              </button>
            </div>
          )}
        </form>
      </section>

      {history.length > 0 && (
        <section className="trade-section">
          <h2 className="trade-heading">Recent</h2>
          <div className="trade-list">
            {history.map((t) => (
              <TradeCard key={t.id} trade={t} perspective={t.fromUserId === me ? "outgoing" : "incoming"} compact />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TradeCard({ trade, perspective, compact = false, children }) {
  const incoming = perspective === "incoming";
  const otherName = incoming ? trade.fromName : trade.toName;
  // From the viewer's side: incoming = they give / you give back.
  const theyGive = incoming ? describeSide(trade.give, trade.giveCredits, trade.givePods) : describeSide(trade.ask, trade.askCredits, trade.askPods);
  const youGive = incoming ? describeSide(trade.ask, trade.askCredits, trade.askPods) : describeSide(trade.give, trade.giveCredits, trade.givePods);
  return (
    <article className={`trade-card trade-card--${trade.status}`}>
      <header className="trade-card-head">
        <span className="trade-card-who">
          <HandshakeIcon weight="bold" />
          {incoming ? `${otherName} offers` : `Your offer to ${otherName}`}
          {trade.counterOf && <em> (counter)</em>}
        </span>
        {trade.status !== "pending" && <span className={`trade-status trade-status--${trade.status}`}>{trade.status}</span>}
      </header>
      <div className="trade-card-body">
        <p>
          <span className="trade-card-label">{incoming ? "They give" : "You give"}</span>
          {incoming ? theyGive : youGive}
        </p>
        <p>
          <span className="trade-card-label">{incoming ? "They want" : "You want"}</span>
          {incoming ? youGive : theyGive}
        </p>
      </div>
      {!compact && children && <div className="trade-card-actions">{children}</div>}
    </article>
  );
}

function TradeSide({ title, inv, selected, onToggle, credits, pods, onCredits, onPods, lockInTrade = false }) {
  const groups = {};
  for (const it of inv.items) (groups[it.kind] ??= []).push(it);
  return (
    <div className="trade-side">
      <h3 className="trade-side-title">{title}</h3>
      {Object.keys(ITEM_KIND_LABELS).map((kind) =>
        groups[kind] ? (
          <div key={kind} className="trade-group">
            <p className="trade-group-label">{ITEM_KIND_LABELS[kind]}s</p>
            <div className="trade-items">
              {groups[kind].map((it) => {
                const on = selected.has(keyOf(it));
                const locked = lockInTrade && it.inTrade && !on;
                return (
                  <button
                    key={keyOf(it)}
                    type="button"
                    className={`trade-item${on ? " trade-item--on" : ""}`}
                    disabled={locked}
                    onClick={() => onToggle(it)}
                    title={locked ? "Already offered in another trade" : it.equipped ? "Equipped — will be unequipped" : undefined}
                  >
                    {it.image && <img src={it.image} alt="" />}
                    <span className="trade-item-name">{it.name}</span>
                    {it.equipped && <span className="trade-item-badge">equipped</span>}
                    {locked && <span className="trade-item-badge">in trade</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null
      )}
      {inv.items.length === 0 && <p className="trade-empty">No tradable items.</p>}
      <div className="trade-amounts">
        <label>
          <CoinsIcon weight="fill" />
          <input type="number" min={0} max={inv.credits} placeholder="0" value={credits} onChange={(e) => onCredits(e.target.value)} />
          <span>/ {inv.credits} credits</span>
        </label>
        <label>
          <PackageIcon weight="fill" />
          <input type="number" min={0} max={inv.pods} placeholder="0" value={pods} onChange={(e) => onPods(e.target.value)} />
          <span>/ {inv.pods} pods</span>
        </label>
      </div>
    </div>
  );
}
