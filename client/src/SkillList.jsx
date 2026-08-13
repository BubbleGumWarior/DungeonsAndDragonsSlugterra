import { PROFICIENCIES, STATS, describeEntry, formatModifier, skillModifier } from "./characterData.js";
import "./SkillList.css";

export default function SkillList({ stats, proficiencies, revealed = true }) {
  return (
    <div className="skill-list">
      {STATS.filter(({ key: statKey }) => PROFICIENCIES.some((p) => p.stat === statKey)).map(({ key: statKey, label, abbr }) => (
        <div className="skill-group" key={statKey}>
          <div className="skill-group-title">
            <span className="skill-group-abbr">{abbr}</span>
            {label}
          </div>
          <div className="skill-group-items">
            {PROFICIENCIES.filter((p) => p.stat === statKey).map((p) => {
              const isProficient = proficiencies.includes(p.key);
              const modifier = skillModifier(stats[statKey], isProficient);
              return (
                <div
                  className={`skill-row ${isProficient ? "skill-row--proficient" : ""}`}
                  key={p.key}
                  data-tooltip={describeEntry(p, revealed)}
                >
                  <span className="skill-row-label">{p.label}</span>
                  <span className="skill-row-badge-slot">
                    {isProficient && <span className="skill-row-badge">Proficient</span>}
                  </span>
                  <span className="skill-row-modifier">{formatModifier(modifier)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
