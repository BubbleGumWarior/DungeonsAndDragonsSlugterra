import { useEffect, useMemo, useState } from "react";
import { CheckIcon, CircleDashedIcon, GiftIcon, HandPointingIcon, MinusIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { canEditAsDm } from "./roles.js";
import { typeColor } from "./slugData.js";
import "./SlugBundle.css";

const HIDDEN_KEY = "slugBundleHidden";

// The open Give Slug Bundle, on everyone's screen at once (see
// server/src/routes/slugBundle.js). The DM calls players up from the list;
// a called-up player picks exactly one slug, which lands in their Slugs tab.
// Players and DM Assistants can tuck it away into a pill; it springs back open
// when the player is called up.
export default function SlugBundleModal() {
  const { token, user } = useAuth();
  const { slugBundle, wsConnectedAt } = useLiveState();
  const isDm = canEditAsDm(user);
  const [bundle, setBundle] = useState(null);
  const [chosenKey, setChosenKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Hiding is remembered per bundle for this browser tab, so a reload doesn't
  // throw the modal back over the screen.
  const [hiddenId, setHiddenId] = useState(() => sessionStorage.getItem(HIDDEN_KEY));
  const hidden = Boolean(bundle && hiddenId === bundle.id);
  function setHidden(on) {
    const next = on && bundle ? bundle.id : null;
    if (next) sessionStorage.setItem(HIDDEN_KEY, next);
    else sessionStorage.removeItem(HIDDEN_KEY);
    setHiddenId(next);
  }

  // Catch up on (re)connect -- a bundle may have opened while this tab was away.
  useEffect(() => {
    if (!token) return;
    fetch("/api/slug-bundle", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setBundle(data.bundle ?? null))
      .catch(() => {});
  }, [token, wsConnectedAt]);

  useEffect(() => {
    if (slugBundle) setBundle(slugBundle.bundle ?? null);
  }, [slugBundle]);

  const me = bundle?.players.find((p) => p.userId === user?.id) ?? null;
  const myTurn = Boolean(me && !me.claimedKey && bundle?.activeUserIds.includes(me.userId));
  const active = useMemo(() => (bundle ? bundle.players.filter((p) => bundle.activeUserIds.includes(p.userId)) : []), [bundle]);
  // The DM can pick for a called-up player, but only when exactly one is up.
  const pickingFor = myTurn ? me : isDm && active.length === 1 ? active[0] : null;

  // A new bundle starts fresh; being called up always brings the modal back.
  useEffect(() => {
    setChosenKey(null);
    setError(null);
  }, [bundle?.id]);
  useEffect(() => {
    if (myTurn) setHidden(false);
  }, [myTurn]); // eslint-disable-line react-hooks/exhaustive-deps
  // A chosen slug someone else just took can't be claimed any more.
  useEffect(() => {
    if (chosenKey && bundle?.slugs.find((s) => s.key === chosenKey)?.claimedBy) setChosenKey(null);
  }, [bundle, chosenKey]);
  useEffect(() => {
    if (!pickingFor) setChosenKey(null);
  }, [pickingFor]);

  if (!token || !bundle) return null;

  const slugByKey = new Map(bundle.slugs.map((s) => [s.key, s]));
  const nameOf = (userId) => bundle.players.find((p) => p.userId === userId)?.name ?? "someone";
  const remaining = bundle.slugs.filter((s) => !s.claimedBy).length;
  const waitingPlayers = bundle.players.filter((p) => !p.claimedKey).length;
  const done = remaining === 0 || waitingPlayers === 0;

  async function post(path, body) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/slug-bundle/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      if (data.bundle !== undefined) setBundle(data.bundle);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function togglePlayer(player) {
    if (!isDm || busy || player.claimedKey) return;
    post("turn", { userId: player.userId, active: !bundle.activeUserIds.includes(player.userId) });
  }

  async function claim() {
    if (!pickingFor || !chosenKey) return;
    const ok = await post("claim", { key: chosenKey, ...(myTurn ? {} : { userId: pickingFor.userId }) });
    if (ok) setChosenKey(null);
  }

  async function close() {
    if (busy) return;
    if (!done && !window.confirm(`Close the bundle? The ${remaining} unclaimed slug${remaining === 1 ? "" : "s"} won't be given to anyone.`)) return;
    post("close");
  }

  if (hidden && !isDm) {
    return (
      <button type="button" className="slug-bundle-pill" onClick={() => setHidden(false)}>
        <GiftIcon weight="duotone" />
        Slug bundle open · {remaining} left
      </button>
    );
  }

  let prompt;
  if (myTurn) prompt = "You've been called up. Choose one slug to take. It arrives hungry, so feed it soon.";
  else if (me?.claimedKey)
    prompt = `You took ${slugByKey.get(me.claimedKey)?.name ?? "a slug"}. It's in your Slugs tab now, hungry at 25% food.`;
  else if (done) prompt = remaining === 0 ? "Every slug has been claimed." : "Everyone has picked a slug.";
  else if (active.length > 0) prompt = `Waiting for ${active.map((p) => p.name).join(" and ")} to choose…`;
  else if (isDm) prompt = "Click a player to call them up. They choose one slug each.";
  else prompt = "Waiting for the Dungeon Master to call someone up…";

  const chosen = chosenKey ? slugByKey.get(chosenKey) : null;

  return (
    <div className="slug-bundle-backdrop">
      <div className="slug-bundle" role="dialog" aria-modal="true" aria-labelledby="slug-bundle-title">
        <header className="slug-bundle-head">
          <span className="slug-bundle-icon">
            <GiftIcon weight="duotone" />
          </span>
          <div className="slug-bundle-titles">
            <span className="slug-bundle-kicker">
              {remaining} of {bundle.slugs.length} left
            </span>
            <h2 id="slug-bundle-title">Slug Bundle</h2>
          </div>
          {!isDm && (
            <button type="button" className="slug-bundle-hide" onClick={() => setHidden(true)} title="Tuck the bundle away">
              <MinusIcon weight="bold" />
              <span>Hide</span>
            </button>
          )}
        </header>

        <p className={`slug-bundle-prompt ${myTurn ? "slug-bundle-prompt--turn" : ""}`} role="status" aria-live="polite">
          {prompt}
        </p>

        <div className="slug-bundle-body">
          <ul className="slug-bundle-slugs" aria-label="Slugs in the bundle">
            {bundle.slugs.map((s) => {
              const taken = Boolean(s.claimedBy);
              const pickable = Boolean(pickingFor) && !taken && !busy;
              const selected = chosenKey === s.key;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    className={`slug-bundle-slug ${taken ? "slug-bundle-slug--taken" : ""} ${selected ? "slug-bundle-slug--chosen" : ""} ${pickable ? "slug-bundle-slug--pickable" : ""}`}
                    style={{ "--type-color": typeColor(s.type) }}
                    disabled={!pickable}
                    aria-pressed={selected}
                    onClick={() => setChosenKey(selected ? null : s.key)}
                  >
                    <span className="slug-bundle-art">
                      {s.protoformImage ? <img src={s.protoformImage} alt="" loading="lazy" decoding="async" /> : <CircleDashedIcon weight="duotone" />}
                      {selected && (
                        <span className="slug-bundle-check" aria-hidden="true">
                          <CheckIcon weight="bold" />
                        </span>
                      )}
                    </span>
                    <span className="slug-bundle-name">{s.name}</span>
                    {taken && <span className="slug-bundle-taker">{nameOf(s.claimedBy)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>

          <aside className="slug-bundle-players" aria-label="Players">
            <h3>Players</h3>
            <ul>
              {bundle.players.map((p) => {
                const isActive = bundle.activeUserIds.includes(p.userId);
                const took = p.claimedKey ? slugByKey.get(p.claimedKey) : null;
                const state = took ? "took" : isActive ? "active" : "waiting";
                const clickable = isDm && !took && (isActive || remaining > 0);
                return (
                  <li key={p.userId}>
                    <button
                      type="button"
                      className={`slug-bundle-player slug-bundle-player--${state} ${p.userId === user?.id ? "slug-bundle-player--me" : ""}`}
                      disabled={!clickable || busy}
                      aria-pressed={isDm ? isActive : undefined}
                      onClick={() => togglePlayer(p)}
                      title={isDm && !took ? (isActive ? "Send back: they can't pick yet" : "Call up to choose a slug") : undefined}
                    >
                      <span className="slug-bundle-player-name">
                        {p.name}
                        {p.userId === user?.id && <span className="slug-bundle-you"> (you)</span>}
                      </span>
                      <span className="slug-bundle-player-state">
                        {took ? (
                          <>
                            <CheckIcon weight="bold" /> {took.name}
                          </>
                        ) : isActive ? (
                          <>
                            <HandPointingIcon weight="bold" /> Choosing
                          </>
                        ) : (
                          "Waiting"
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>

        {error && <p className="panel-error slug-bundle-error">{error}</p>}

        {(pickingFor || isDm) && (
          <footer className="slug-bundle-foot">
            {pickingFor && (
              <button type="button" className="panel-btn slug-bundle-claim" onClick={claim} disabled={!chosen || busy}>
                <CheckIcon weight="bold" />
                {!chosen ? "Pick a slug" : myTurn ? `Take ${chosen.name}` : `Give ${chosen.name} to ${pickingFor.name}`}
              </button>
            )}
            {isDm && (
              <button type="button" className="panel-btn panel-btn--ghost slug-bundle-close" onClick={close} disabled={busy}>
                <XIcon weight="bold" />
                {done ? "Close bundle" : "End bundle"}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}
