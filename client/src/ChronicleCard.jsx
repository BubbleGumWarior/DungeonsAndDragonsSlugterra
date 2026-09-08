import { useState } from "react";
import { EyeIcon, EyeSlashIcon, UserCircleIcon } from "@phosphor-icons/react";
import { typeColor } from "./slugData.js";
import "./ChronicleCard.css";

const REL_COLORS = {
  Ally: "var(--rel-ally)",
  Friend: "var(--rel-friend)",
  Neutral: "var(--rel-neutral)",
  Rival: "var(--rel-rival)",
  Enemy: "var(--rel-enemy)",
  Unknown: "var(--rel-unknown)",
  Party: "var(--rel-party)",
};

function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// A small reveal toggle shown next to each line for the DM. Stops the click
// from flipping the card.
function Eye({ shown, onClick, label }) {
  return (
    <button
      type="button"
      className={`chronicle-eye ${shown ? "" : "chronicle-eye--off"}`}
      title={shown ? `${label} is shown to players` : `${label} is hidden from players`}
      aria-label={shown ? `Hide ${label} from players` : `Show ${label} to players`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {shown ? <EyeIcon weight="bold" /> : <EyeSlashIcon weight="bold" />}
    </button>
  );
}

export default function ChronicleCard({ entry, dm = false, onReveal }) {
  const [flipped, setFlipped] = useState(false);

  const rel = entry.relationship || "Unknown";
  const relColor = REL_COLORS[rel] || REL_COLORS.Unknown;
  const status = entry.status;
  const showStatusTag = status && status !== "Alive";

  const roleLine =
    entry.kind === "pc"
      ? `${(entry.slugs || []).length} slug${(entry.slugs || []).length === 1 ? "" : "s"}`
      : entry.lines.find((l) => l.key === "role")?.value || "";

  // Front lines: the biographical rows other than the one used as the role
  // subtitle. Cap at three so the card never overflows its fixed height.
  const frontLines = entry.lines.filter((l) => l.key !== "role").slice(0, 3);

  function toggleField(key, shown) {
    onReveal?.({ fields: { [key]: { shown } } });
  }
  function toggleListEntry(listKey, index, shown) {
    const list = (entry[listKey] || []).map((item, i) => ({
      text: item.text,
      shown: i === index ? shown : item.shown,
    }));
    onReveal?.({ [listKey]: list });
  }

  const FRONT_SLUG_CAP = 6;
  const slugs = entry.slugs || [];
  const frontSlugs = slugs.slice(0, FRONT_SLUG_CAP);
  const moreSlugs = slugs.length - frontSlugs.length;

  const hasBack =
    (entry.bio && entry.bio.length > 0) ||
    (entry.connections && entry.connections.length > 0) ||
    (entry.kind === "pc" && slugs.length > 0) ||
    (dm && (entry.dmNotes || entry.combat));

  function onKeyDown(e) {
    if (!hasBack) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setFlipped((v) => !v);
    }
  }

  return (
    <div
      className={`chronicle-card ${flipped ? "chronicle-card--flipped" : ""}`}
      style={{ "--rel": relColor }}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={`${entry.name}${rel ? `, ${rel}` : ""}.${hasBack ? " Activate to turn the card over." : ""}`}
      onClick={() => hasBack && setFlipped((v) => !v)}
      onKeyDown={onKeyDown}
    >
      <div className="chronicle-card-inner">
        <div className="chronicle-face chronicle-face--front">
          {showStatusTag && (
            <span className={`chronicle-status-tag chronicle-status-tag--${status.toLowerCase()}`}>
              {status}
              {dm && (
                <Eye
                  shown={entry.statusShown}
                  label="status"
                  onClick={() => toggleField("status", !entry.statusShown)}
                />
              )}
            </span>
          )}

          <span className="chronicle-medallion">
            {entry.image ? <img src={entry.image} alt="" /> : entry.name ? initials(entry.name) : <UserCircleIcon weight="duotone" />}
          </span>

          <h3 className="chronicle-card-name">{entry.name}</h3>
          <div className="chronicle-card-role">{roleLine}</div>

          <div className="chronicle-badges">
            <span className="chronicle-badge">{rel}</span>
            {dm && entry.kind === "npc" && (
              <Eye
                shown={entry.relationshipShown}
                label="relationship"
                onClick={() => toggleField("relationship", !entry.relationshipShown)}
              />
            )}
          </div>

          <div className="chronicle-divider" aria-hidden="true" />

          {entry.kind === "pc" ? (
            slugs.length > 0 ? (
              <div className="chronicle-loadout">
                {frontSlugs.map((s) => (
                  <span key={s.id} className="chronicle-slug" style={{ "--tc": typeColor(s.type) }}>
                    {s.name}
                  </span>
                ))}
                {moreSlugs > 0 && <span className="chronicle-slug chronicle-slug--more">+{moreSlugs} more</span>}
              </div>
            ) : (
              <span className="chronicle-loadout-empty">No slugs assigned yet</span>
            )
          ) : (
            <div className="chronicle-lines">
              {frontLines.length === 0 && !dm && (
                <span className="chronicle-loadout-empty">Nothing revealed yet</span>
              )}
              {frontLines.map((l) => (
                <div key={l.key} className={`chronicle-line ${dm && !l.shown ? "chronicle-line--hidden" : ""}`}>
                  <span className="chronicle-line-key">{l.label}</span>
                  <span className="chronicle-line-value">{l.value}</span>
                  {dm && <Eye shown={l.shown} label={l.label} onClick={() => toggleField(l.key, !l.shown)} />}
                </div>
              ))}
            </div>
          )}

          {hasBack && <div className="chronicle-flip-hint">Tap to turn</div>}
        </div>

        <div className="chronicle-face chronicle-face--back">
          <p className="chronicle-back-name">{entry.name}</p>

          {entry.kind === "pc" && (
            <>
              <div className="chronicle-back-label chronicle-back-label--first">
                Slug loadout ({slugs.length})
              </div>
              <div className="chronicle-loadout chronicle-loadout--back">
                {slugs.map((s) => (
                  <span key={s.id} className="chronicle-slug" style={{ "--tc": typeColor(s.type) }}>
                    {s.name}
                  </span>
                ))}
              </div>
            </>
          )}

          {entry.kind === "npc" && (
            <div className="chronicle-back-label chronicle-back-label--first">Known to the party</div>
          )}

          {entry.kind === "npc" && (entry.bio || []).length === 0 && (
            <p className="chronicle-back-bio chronicle-back-bio--hidden">No notes yet.</p>
          )}
          {(entry.bio || []).map((b, i) => (
            <div key={i} className="chronicle-back-row">
              {dm && <Eye shown={b.shown} label="this note" onClick={() => toggleListEntry("bio", i, !b.shown)} />}
              <p className={`chronicle-back-bio ${dm && !b.shown ? "chronicle-back-bio--hidden" : ""}`}>{b.text}</p>
            </div>
          ))}

          {(entry.connections || []).length > 0 && (
            <>
              <div className="chronicle-back-label">Threads</div>
              <div className="chronicle-conns">
                {entry.connections.map((c, i) => (
                  <span key={i} className={`chronicle-conn ${dm && !c.shown ? "chronicle-conn--hidden" : ""}`}>
                    {dm && (
                      <Eye shown={c.shown} label="this thread" onClick={() => toggleListEntry("connections", i, !c.shown)} />
                    )}
                    {c.text}
                  </span>
                ))}
              </div>
            </>
          )}

          {dm && entry.combat && (
            <>
              <div className="chronicle-back-label">
                Combat profile
                <Eye
                  shown={entry.combatShown}
                  label="the combat profile"
                  onClick={() => onReveal?.({ combatShown: !entry.combatShown })}
                />
              </div>
              <div className="chronicle-combatblock">
                <span>{entry.combat.maxGrit} Grit</span>
                <span>{entry.combat.maxAp} AP</span>
                <span>
                  DEX {entry.combat.dexModifier >= 0 ? "+" : ""}
                  {entry.combat.dexModifier}
                </span>
                <span>
                  CON {entry.combat.conModifier >= 0 ? "+" : ""}
                  {entry.combat.conModifier}
                </span>
              </div>
            </>
          )}
          {!dm && entry.combat && (
            <>
              <div className="chronicle-back-label">Combat profile</div>
              <div className="chronicle-combatblock">
                <span>{entry.combat.maxGrit} Grit</span>
                <span>{entry.combat.maxAp} AP</span>
              </div>
            </>
          )}

          {dm && entry.dmNotes && (
            <>
              <div className="chronicle-back-label">DM notes, never shown to players</div>
              <p className="chronicle-dmnotes">{entry.dmNotes}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
