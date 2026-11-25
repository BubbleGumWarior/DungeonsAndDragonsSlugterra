import { CheckIcon, StarIcon } from "@phosphor-icons/react";
import {
  EXPERTISE_BONUS,
  PROFICIENCIES,
  PROFICIENCY_BONUS,
  REQUIRED_PROFICIENCIES,
  STATS,
  describeEntry,
  entryLabel,
} from "./characterData.js";
import "./ProficiencyPicker.css";

// Pass `expertise` + `onExpertiseChange` (the DM editor does) to let a click
// cycle a skill through none -> Proficient -> Expertise -> none.
export default function ProficiencyPicker({
  selected,
  onChange,
  expertise,
  onExpertiseChange,
  unlimited = false,
  revealed = true,
}) {
  const remaining = REQUIRED_PROFICIENCIES - selected.length;
  const allowExpertise = Array.isArray(expertise) && typeof onExpertiseChange === "function";

  function toggle(key) {
    const isSelected = selected.includes(key);
    if (allowExpertise && isSelected && !expertise.includes(key)) {
      onExpertiseChange([...expertise, key]);
    } else if (isSelected) {
      onChange(selected.filter((k) => k !== key));
      if (allowExpertise && expertise.includes(key)) onExpertiseChange(expertise.filter((k) => k !== key));
    } else if (unlimited || selected.length < REQUIRED_PROFICIENCIES) {
      onChange([...selected, key]);
    }
  }

  return (
    <div className="proficiency-picker">
      <div className={`proficiency-remaining ${!unlimited && remaining === 0 ? "proficiency-remaining--done" : ""}`}>
        <span className="proficiency-remaining-value">
          {unlimited ? selected.length : `${selected.length} / ${REQUIRED_PROFICIENCIES}`}
        </span>
        <span className="proficiency-remaining-label">
          proficiencies chosen{allowExpertise && ` · ${expertise.length} with expertise`}
        </span>
      </div>

      {allowExpertise && (
        <p className="proficiency-hint">
          Click once for Proficient (+{PROFICIENCY_BONUS}), again for Expertise (+{EXPERTISE_BONUS}), a third time to clear.
        </p>
      )}

      <div className="proficiency-groups">
        {STATS.filter(({ key: statKey }) => PROFICIENCIES.some((p) => p.stat === statKey)).map(({ key: statKey, label, abbr }) => (
          <div className="proficiency-group" key={statKey}>
            <div className="proficiency-group-title">
              <span className="proficiency-group-abbr">{abbr}</span>
              {label}
            </div>
            <div className="proficiency-group-items">
              {PROFICIENCIES.filter((p) => p.stat === statKey).map((p) => {
                const isSelected = selected.includes(p.key);
                const isExpert = allowExpertise && isSelected && expertise.includes(p.key);
                const isDisabled = !unlimited && !isSelected && remaining === 0;
                return (
                  <button
                    type="button"
                    key={p.key}
                    className={`proficiency-item${isSelected ? " proficiency-item--selected" : ""}${isExpert ? " proficiency-item--expert" : ""}`}
                    onClick={() => toggle(p.key)}
                    disabled={isDisabled}
                  >
                    <span className="proficiency-checkbox">
                      {isExpert ? <StarIcon weight="fill" /> : isSelected && <CheckIcon weight="bold" />}
                    </span>
                    <span className="proficiency-item-text">
                      <span className="proficiency-item-label">
                        {entryLabel(p, revealed)}
                        {isExpert && <span className="proficiency-item-tag">Expertise</span>}
                      </span>
                      <span className="proficiency-item-description">{describeEntry(p, revealed)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
