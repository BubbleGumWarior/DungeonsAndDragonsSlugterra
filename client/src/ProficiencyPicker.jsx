import { CheckIcon } from "@phosphor-icons/react";
import { PROFICIENCIES, REQUIRED_PROFICIENCIES, STATS, describeEntry } from "./characterData.js";
import "./ProficiencyPicker.css";

export default function ProficiencyPicker({ selected, onChange, unlimited = false, revealed = true }) {
  const remaining = REQUIRED_PROFICIENCIES - selected.length;

  function toggle(key) {
    if (selected.includes(key)) {
      onChange(selected.filter((k) => k !== key));
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
        <span className="proficiency-remaining-label">proficiencies chosen</span>
      </div>

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
                const isDisabled = !unlimited && !isSelected && remaining === 0;
                return (
                  <button
                    type="button"
                    key={p.key}
                    className={`proficiency-item ${isSelected ? "proficiency-item--selected" : ""}`}
                    onClick={() => toggle(p.key)}
                    disabled={isDisabled}
                  >
                    <span className="proficiency-checkbox">
                      {isSelected && <CheckIcon weight="bold" />}
                    </span>
                    <span className="proficiency-item-text">
                      <span className="proficiency-item-label">{p.label}</span>
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
