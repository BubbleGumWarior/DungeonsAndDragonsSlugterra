import { useCallback, useEffect, useState } from "react";
import { BinocularsIcon, CheckIcon, ArrowsClockwiseIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { formatModifier } from "./characterData.js";
import SlugCard from "./SlugCard.jsx";
import "./SlugHuntPrompt.css";

function HuntCard({ hunt, token, queueCount, onResolvedLocally }) {
  const [busy, setBusy] = useState(null); // 'approve' | 'reroll' | 'dismiss'
  const [error, setError] = useState(null);

  // The queued hunt changing under us (previous one resolved) must clear any
  // stale error from the card that was just here.
  useEffect(() => {
    setError(null);
    setBusy(null);
  }, [hunt.id]);

  async function act(action) {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/slug-hunt/${hunt.id}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      // reroll swaps the slug in place (via the slug-hunt-updated broadcast);
      // approve/dismiss end the hunt (the slug-hunt-resolved broadcast clears
      // it, but drop it locally too in case this session raced the socket).
      if (action !== "reroll") onResolvedLocally(hunt.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="slughunt-prompt-card">
      <div className="slughunt-prompt-banner">
        <span className="slughunt-prompt-icon">
          <BinocularsIcon weight="duotone" />
        </span>
        <div className="slughunt-prompt-who">
          <span className="slughunt-prompt-kicker">Slug hunt · {hunt.areaName}</span>
          <h3 className="slughunt-prompt-name">{hunt.initiatingName}</h3>
        </div>
        {queueCount > 0 && (
          <span className="slughunt-prompt-queue" title={`${queueCount} more waiting`}>
            +{queueCount}
          </span>
        )}
      </div>

      <p className="slughunt-prompt-roll">
        Survival check <strong>{hunt.total}</strong>{" "}
        <span className="slughunt-prompt-rollsub">
          (d20 {hunt.roll} {formatModifier(hunt.modifier)})
        </span>
      </p>

      <SlugCard slug={hunt.slug} size="md" />

      <div className="slughunt-prompt-actions">
        <button
          type="button"
          className="panel-btn slughunt-prompt-approve"
          onClick={() => act("approve")}
          disabled={Boolean(busy)}
        >
          <CheckIcon weight="bold" />
          {busy === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          className="panel-btn panel-btn--ghost"
          onClick={() => act("reroll")}
          disabled={Boolean(busy)}
        >
          <ArrowsClockwiseIcon weight="bold" />
          {busy === "reroll" ? "Rerolling…" : "Reroll"}
        </button>
        <button
          type="button"
          className="panel-btn panel-btn--ghost slughunt-prompt-dismiss"
          onClick={() => act("dismiss")}
          disabled={Boolean(busy)}
        >
          <XIcon weight="bold" />
          Dismiss
        </button>
      </div>

      {error && <p className="panel-error">{error}</p>}
    </div>
  );
}

export default function SlugHuntPrompt() {
  const { token, user } = useAuth();
  const isDungeonMaster = user?.role === "Dungeon Master";
  const { slugHuntOffered, slugHuntUpdated, slugHuntResolved } = useLiveState();
  // FIFO queue -- the DM handles one hunt at a time so none get lost in a rush.
  const [hunts, setHunts] = useState([]);

  const dropHunt = useCallback((id) => {
    setHunts((prev) => prev.filter((h) => h.id !== id));
  }, []);

  // Catch up on any hunts that succeeded before this DM session connected.
  useEffect(() => {
    if (!isDungeonMaster || !token) return;
    fetch("/api/slug-hunt/pending", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setHunts(data.hunts || []))
      .catch(() => {});
  }, [isDungeonMaster, token]);

  useEffect(() => {
    if (!slugHuntOffered?.hunt) return;
    setHunts((prev) =>
      prev.some((h) => h.id === slugHuntOffered.hunt.id) ? prev : [...prev, slugHuntOffered.hunt]
    );
  }, [slugHuntOffered]);

  useEffect(() => {
    if (!slugHuntUpdated?.hunt) return;
    setHunts((prev) => prev.map((h) => (h.id === slugHuntUpdated.hunt.id ? slugHuntUpdated.hunt : h)));
  }, [slugHuntUpdated]);

  useEffect(() => {
    if (!slugHuntResolved?.id) return;
    dropHunt(slugHuntResolved.id);
  }, [slugHuntResolved, dropHunt]);

  if (!isDungeonMaster || hunts.length === 0) return null;

  const current = hunts[0];

  return (
    <div className="slughunt-prompt-backdrop">
      <HuntCard
        key={current.id}
        hunt={current}
        token={token}
        queueCount={hunts.length - 1}
        onResolvedLocally={dropHunt}
      />
    </div>
  );
}
