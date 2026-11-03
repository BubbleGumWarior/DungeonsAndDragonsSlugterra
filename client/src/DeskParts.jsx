import { useEffect, useState } from "react";
import { CaretDownIcon, CheckIcon, GiftIcon, PencilSimpleIcon, SlidersHorizontalIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import "./InventoryDesk.css";

// Pieces shared by the DM's handout desks (Inventory and Slugs): who you are
// giving to, the catalog row with its Give button, the phone view switch.

const RECIPIENT_KEY = "dm-desk-recipient";

function readSavedRecipient() {
  try {
    return Number(localStorage.getItem(RECIPIENT_KEY)) || null;
  } catch {
    return null;
  }
}

// The chosen player, remembered across both desks. Falls back to the first
// player until the roster arrives or if the saved one is gone.
export function useRecipient(roster) {
  const [recipientId, setRecipientId] = useState(readSavedRecipient);
  const recipient = roster.find((p) => p.id === recipientId) ?? roster[0] ?? null;

  function choose(id) {
    setRecipientId(id);
    try {
      localStorage.setItem(RECIPIENT_KEY, String(id));
    } catch {
      // Remembering the pick is a convenience; the page works without it.
    }
  }

  return [recipient, choose];
}

// A line of feedback under the catalog that clears itself.
export function useStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (!status) return undefined;
    const timer = setTimeout(() => setStatus(null), 4500);
    return () => clearTimeout(timer);
  }, [status]);
  return [status, setStatus];
}

export function RecipientRail({ roster, recipient, countFor, onChoose }) {
  return (
    <section className="desk-rail" aria-label="Giving to">
      <span className="desk-rail-label">Giving to</span>
      {roster.length === 0 ? (
        <span className="desk-rail-none">No players yet.</span>
      ) : (
        <div className="desk-rail-list" role="group" aria-label="Choose who receives items">
          {roster.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`desk-person ${recipient?.id === p.id ? "desk-person--on" : ""}`}
              aria-pressed={recipient?.id === p.id}
              onClick={() => onChoose(p.id)}
            >
              <span className="desk-person-name">{p.name}</span>
              <span className="desk-person-count" aria-label={`${countFor(p.id)} held`}>
                {countFor(p.id)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// On phones the two panes take turns.
export function NarrowSwitch({ view, onView, recipient, count, noun = "gear" }) {
  return (
    <div className="desk-switch" role="group" aria-label="Show">
      <button type="button" className={view === "catalog" ? "desk-switch--on" : ""} aria-pressed={view === "catalog"} onClick={() => onView("catalog")}>
        Catalog
      </button>
      <button type="button" className={view === "gear" ? "desk-switch--on" : ""} aria-pressed={view === "gear"} onClick={() => onView("gear")}>
        {recipient ? `${recipient.name.split(" ")[0]}'s ${noun}` : "Held"}
        {recipient && <span className="desk-tab-count">{count}</span>}
      </button>
    </div>
  );
}

// One catalog line: art, name and stats, quiet tools, and the Give button.
// `blockedLabel` greys Give out with a reason (for things a player can only
// have once). Tools are optional so a read-only catalog can leave them off.
export function DeskRow({ lead, name, sub, blurb, details, recipient, blockedLabel, onGive, onCustomize, onEdit, onDelete, kind = "template" }) {
  const [phase, setPhase] = useState("idle"); // idle | busy | done
  const [confirming, setConfirming] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (phase !== "done") return undefined;
    const timer = setTimeout(() => setPhase("idle"), 1700);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (!confirming) return undefined;
    const timer = setTimeout(() => setConfirming(false), 3200);
    return () => clearTimeout(timer);
  }, [confirming]);

  async function give() {
    setPhase("busy");
    const ok = await onGive();
    setPhase(ok ? "done" : "idle");
  }

  const blocked = !recipient || Boolean(blockedLabel);
  const label = phase === "done" ? "Given" : phase === "busy" ? "Giving" : blockedLabel || "Give";
  const hasTools = Boolean(onCustomize || onEdit || onDelete);

  return (
    <li className={`desk-row ${confirming ? "desk-row--confirming" : ""}`}>
      {lead}
      {details ? (
        <button type="button" className="desk-row-text desk-row-text--btn" aria-expanded={open} onClick={() => setOpen((v) => !v)} title={open ? "Hide details" : "Show full details"}>
          <span className="desk-row-name">
            {name}
            <CaretDownIcon weight="bold" className={`desk-row-caret ${open ? "desk-row-caret--open" : ""}`} aria-hidden="true" />
          </span>
          <span className="desk-row-sub">{sub}</span>
          {blurb && !open && <span className="desk-row-blurb">{blurb}</span>}
        </button>
      ) : (
        <div className="desk-row-text">
          <span className="desk-row-name">{name}</span>
          <span className="desk-row-sub">{sub}</span>
          {blurb && <span className="desk-row-blurb">{blurb}</span>}
        </div>
      )}

      <div className="desk-row-tools">
        {hasTools && !confirming && (
          <>
            {onCustomize && (
              <button type="button" className="desk-tool" onClick={onCustomize} title="Tweak, then give" aria-label={`Tweak ${name} before giving`}>
                <SlidersHorizontalIcon weight="bold" />
              </button>
            )}
            {onEdit && (
              <button type="button" className="desk-tool" onClick={onEdit} title={`Edit ${kind}`} aria-label={`Edit ${name}`}>
                <PencilSimpleIcon weight="bold" />
              </button>
            )}
          </>
        )}
        {onDelete &&
          (confirming ? (
            <>
              <button
                type="button"
                className="desk-tool desk-tool--danger-solid"
                onClick={() => {
                  setConfirming(false);
                  onDelete();
                }}
              >
                <TrashIcon weight="bold" />
                Delete
              </button>
              <button type="button" className="desk-tool" onClick={() => setConfirming(false)} aria-label="Keep it">
                <XIcon weight="bold" />
              </button>
            </>
          ) : (
            <button type="button" className="desk-tool desk-tool--danger" onClick={() => setConfirming(true)} title={`Delete ${kind}`} aria-label={`Delete ${name}`}>
              <TrashIcon weight="bold" />
            </button>
          ))}
      </div>

      <button
        type="button"
        className={`desk-give ${phase === "done" ? "desk-give--done" : ""}`}
        disabled={blocked || phase === "busy"}
        onClick={give}
        title={!recipient ? "Pick who you are giving to first" : blockedLabel ? `${recipient.name} already has this` : `Give to ${recipient.name}`}
      >
        {phase === "done" ? <CheckIcon weight="bold" /> : <GiftIcon weight="bold" />}
        {label}
      </button>

      {details && open && <div className="desk-row-details">{details}</div>}
    </li>
  );
}

// Two clicks to take something back, right on its card: the first arms it, the
// second removes it, and it disarms itself if you walk away.
export function QuickRemove({ name, onRemove }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return undefined;
    const timer = setTimeout(() => setArmed(false), 3200);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      className={`desk-card-remove ${armed ? "desk-card-remove--armed" : ""}`}
      onClick={() => (armed ? onRemove() : setArmed(true))}
      title={armed ? `Click again to take ${name} from this player` : "Remove from player"}
      aria-label={armed ? `Confirm: remove ${name} from this player` : `Remove ${name} from this player`}
    >
      <TrashIcon weight="bold" />
      {armed ? "Confirm" : "Remove"}
    </button>
  );
}

// The dot-less stat read-out under a row's name; a bit is text or {text, color}.
export function Bits({ items }) {
  return items.filter(Boolean).map((bit, i) => (
    <span key={i} className="desk-bit" style={bit.color ? { color: bit.color } : undefined}>
      {bit.text ?? bit}
    </span>
  ));
}
