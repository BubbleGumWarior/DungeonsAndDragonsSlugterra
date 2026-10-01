import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { HandshakeIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { useToast } from "./Toast.jsx";
import { describeSide, tradeAction } from "./tradeUtils.js";

// Turns trade events into toasts. Each event just prompts a refetch of the
// trade list (the socket only carries a "something changed" nudge), and any
// trade not seen before is announced -- so a burst of events can't swallow an
// offer. Existing outcomes are seeded silently on first load; open incoming
// offers are announced so a player logging in sees what's waiting.
export default function TradeToasts() {
  const { token, user } = useAuth();
  const { tradeChanged } = useLiveState();
  const { push } = useToast();
  const navigate = useNavigate();
  const seenPending = useRef(new Set());
  const seenResolved = useRef(new Set());
  const initialised = useRef(false);
  const isPlayer = Boolean(token) && user?.role !== "Dungeon Master";

  const sync = useCallback(async () => {
    if (!isPlayer) return;
    let trades;
    try {
      const res = await fetch("/api/trades", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      ({ trades } = await res.json());
    } catch {
      return;
    }
    const me = user.id;

    for (const t of trades) {
      if (t.status === "pending" && t.toUserId === me && !seenPending.current.has(t.id)) {
        seenPending.current.add(t.id);
        const answer = async (action) => {
          try {
            await tradeAction(token, t.id, action);
            push({
              tone: "success",
              title: action === "accept" ? "Trade accepted" : "Trade declined",
              body: action === "accept" ? `Items from ${t.fromName} are now in your inventory.` : undefined,
            });
          } catch (err) {
            push({ tone: "warn", title: "Trade failed", body: err.message });
          }
        };
        push({
          title: t.counterOf ? `${t.fromName} counter-offers` : `${t.fromName} wants to trade`,
          body: `Offers: ${describeSide(t.give, t.giveCredits, t.givePods)}. Wants: ${describeSide(t.ask, t.askCredits, t.askPods)}.`,
          icon: <HandshakeIcon weight="bold" />,
          duration: 0,
          actions: [
            { label: "Accept", primary: true, onClick: () => answer("accept") },
            { label: "Decline", onClick: () => answer("decline") },
            { label: "View", onClick: () => navigate("/market?tab=trading") },
          ],
        });
      }

      if (t.fromUserId === me && t.status !== "pending" && !seenResolved.current.has(t.id)) {
        seenResolved.current.add(t.id);
        if (!initialised.current || t.status === "cancelled") continue;
        if (t.status === "accepted") {
          push({ tone: "success", title: "Trade accepted", body: `${t.toName} accepted your offer.`, icon: <HandshakeIcon weight="bold" /> });
        } else if (t.status === "declined") {
          push({ tone: "warn", title: "Trade declined", body: `${t.toName} declined your offer.` });
        }
      }
    }
    initialised.current = true;
  }, [isPlayer, token, user, push, navigate]);

  useEffect(() => {
    sync();
  }, [sync, tradeChanged]);

  return null;
}
