import { useCallback, useEffect, useRef, useState } from "react";
import {
  CloudLightningIcon,
  CloudRainIcon,
  FlameIcon,
  MinusIcon,
  PlusIcon,
  ShootingStarIcon,
} from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { canEditAsDm } from "./roles.js";
import { useLiveState } from "./AccessSocket.jsx";
import NavBar from "./NavBar.jsx";
import "./PlaceholderPage.css";
import "./Panel.css";
import "./FateLedger.css";

// Two opposed pairs. `tone` drives colour, but every column also carries its
// own icon so boon and bane never rely on colour alone.
const FATE_FIELDS = [
  { key: "wish", label: "Wish", tone: "boon", Icon: ShootingStarIcon },
  { key: "antiWish", label: "Anti-Wish", tone: "bane", Icon: CloudLightningIcon },
  { key: "inspiration", label: "Inspiration", tone: "boon", Icon: FlameIcon, pairStart: true },
  { key: "discouragement", label: "Discouragement", tone: "bane", Icon: CloudRainIcon },
];

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// The number itself. When it changes (the DM's tap here, or a live update from
// another table) it slides in from the direction it moved; the first render
// stays still. Re-keying on the value restarts the animation for repeat taps.
function FateNumber({ value, tone }) {
  const prev = useRef(value);
  const dir = useRef(null);
  if (value !== prev.current) {
    dir.current = value > prev.current ? "up" : "down";
    prev.current = value;
  }
  const classes = ["fate-num", `fate-num--${tone}`];
  if (value === 0) classes.push("fate-num--zero");
  if (dir.current) classes.push(`fate-num--${dir.current}`);
  return (
    <span key={value} className={classes.join(" ")}>
      {value}
    </span>
  );
}

function FateCell({ character, field, canEdit, onAdjust }) {
  const value = character[field.key] ?? 0;
  const { Icon } = field;
  return (
    <td className={`fate-cell${field.pairStart ? " fate-cell--pair" : ""}`}>
      <span className="fate-cell-label">
        <Icon weight="duotone" aria-hidden="true" />
        {field.label}
      </span>
      {canEdit ? (
        <span className="fate-stepper">
          <button
            type="button"
            className="fate-step"
            onClick={() => onAdjust(character.userId, field.key, -1)}
            disabled={value <= 0}
            aria-label={`Lower ${character.name}'s ${field.label}`}
          >
            <MinusIcon weight="bold" />
          </button>
          <FateNumber value={value} tone={field.tone} />
          <button
            type="button"
            className="fate-step"
            onClick={() => onAdjust(character.userId, field.key, 1)}
            aria-label={`Raise ${character.name}'s ${field.label}`}
          >
            <PlusIcon weight="bold" />
          </button>
        </span>
      ) : (
        <FateNumber value={value} tone={field.tone} />
      )}
    </td>
  );
}

export default function FateLedger() {
  const { user, token } = useAuth();
  const { fateChanged, characterCreated } = useLiveState();
  const isDungeonMaster = canEditAsDm(user);
  const [characters, setCharacters] = useState(null);
  const [error, setError] = useState(null);
  // While the DM's own taps are in flight, local numbers are ahead of the
  // server; hold off on refetches until the last one lands so the count
  // doesn't flicker back through each intermediate response.
  const pending = useRef(0);
  const refetchQueued = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/fate", { headers: authHeaders(token) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load the Fate Ledger.");
      if (pending.current > 0) {
        refetchQueued.current = true;
        return;
      }
      setCharacters(data.characters || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    if (pending.current > 0) {
      refetchQueued.current = true;
      return;
    }
    load();
  }, [load, fateChanged, characterCreated]);

  async function adjust(userId, field, delta) {
    setCharacters((list) =>
      list.map((c) => (c.userId === userId ? { ...c, [field]: Math.max(0, (c[field] ?? 0) + delta) } : c))
    );
    pending.current += 1;
    try {
      const res = await fetch(`/api/fate/${userId}`, {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify({ field, delta }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That change didn't save.");
      setError(null);
    } catch (err) {
      setError(`${err.message} Showing the last saved values.`);
      refetchQueued.current = true;
    } finally {
      pending.current -= 1;
      if (pending.current === 0 && refetchQueued.current) {
        refetchQueued.current = false;
        load();
      }
    }
  }

  return (
    <div className="dashboard-page">
      <NavBar />
      <div className="placeholder-page placeholder-page--wide">
        <h1 className="slugs-page-title fate-title">Fate Ledger</h1>
        <p className="fate-intro">
          {isDungeonMaster
            ? "Raise or lower any count. Every open screen updates as you go."
            : "Kept by the Dungeon Master. Counts update here as they change."}
        </p>

        <section className="panel fate-panel" aria-label="Fate Ledger">
          {error ? (
            <p className="fate-error" role="alert">
              {error}
            </p>
          ) : null}

          {characters === null ? (
            <div className="fate-skeleton" aria-busy="true" aria-label="Loading the Fate Ledger">
              {[0, 1, 2].map((i) => (
                <span key={i} className="fate-skeleton-row" />
              ))}
            </div>
          ) : characters.length === 0 ? (
            <p className="fate-empty">
              No characters yet. Each one joins the ledger, starting at zero, as soon as it is created.
            </p>
          ) : (
            <table className={`fate-table${isDungeonMaster ? " fate-table--dm" : ""}`}>
              <thead>
                <tr>
                  <th scope="col" className="fate-col-name">
                    Character
                  </th>
                  {FATE_FIELDS.map(({ key, label, tone, Icon, pairStart }) => (
                    <th
                      scope="col"
                      key={key}
                      className={`fate-col fate-col--${tone}${pairStart ? " fate-cell--pair" : ""}`}
                    >
                      <span className="fate-col-head">
                        <Icon weight="duotone" aria-hidden="true" />
                        {label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {characters.map((c) => {
                  const isMe = c.userId === user?.id;
                  return (
                    <tr key={c.userId} className={isMe ? "fate-row--me" : undefined}>
                      <th scope="row" className="fate-name-cell">
                        <span className="fate-name-wrap">
                          <span className="fate-avatar" aria-hidden="true">
                            {c.portrait ? <img src={c.portrait} alt="" /> : c.name?.[0] ?? "?"}
                          </span>
                          <span className="fate-name">{c.name}</span>
                          {isMe ? <span className="fate-you">You</span> : null}
                        </span>
                      </th>
                      {FATE_FIELDS.map((f) => (
                        <FateCell
                          key={f.key}
                          character={c}
                          field={f}
                          canEdit={isDungeonMaster}
                          onAdjust={adjust}
                        />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
