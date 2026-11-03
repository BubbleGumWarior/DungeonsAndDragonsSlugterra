import { WindIcon } from "@phosphor-icons/react";
import { atmosphereSummary } from "./atmosphereData.js";
import "./AtmosphereNote.css";

// What the air does in a fight here: the survey line, then each effect. The
// server's `atmosphere.effects` is the list, so this never goes out of step
// with the rules.
export default function AtmosphereNote({ atmosphere, title = "In a fight here" }) {
  if (!atmosphere) return null;
  const effects = atmosphere.effects ?? [];
  return (
    <div className="atmo-note">
      <p className="atmo-note-head">
        <WindIcon weight="duotone" aria-hidden="true" />
        <span className="atmo-note-title">{title}</span>
        <span className="atmo-note-sum num-tabular">{atmosphereSummary(atmosphere)}</span>
      </p>
      {effects.length > 0 ? (
        <ul className="atmo-note-list">
          {effects.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : (
        <p className="atmo-note-none">No effect on a fight.</p>
      )}
    </div>
  );
}
