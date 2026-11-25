import { PROFICIENCIES, STATS, describeEntry, entryLabel, formatModifier, skillModifier, skillTraining } from "./characterData.js";
import { rollableProps } from "./rollableProps.js";
import "./SkillList.css";

export default function SkillList({ stats, proficiencies, expertise = [], revealed = true, onRoll }) {
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
              const training = skillTraining(p.key, proficiencies, expertise);
              const modifier = skillModifier(stats[statKey], Boolean(training), training === "expert");
              return (
                <div
                  className={`skill-row${training ? ` skill-row--${training === "expert" ? "expert" : "proficient"}` : ""}${onRoll ? " skill-row--rollable" : ""}`}
                  key={p.key}
                  data-tooltip={describeEntry(p, revealed)}
                  {...rollableProps(onRoll, "skill", p.key, entryLabel(p, revealed), modifier)}
                >
                  <span className="skill-row-label">{entryLabel(p, revealed)}</span>
                  <span className="skill-row-badge-slot">
                    {training === "expert" && <span className="skill-row-badge skill-row-badge--expert">Expertise</span>}
                    {training === "proficient" && <span className="skill-row-badge">Proficient</span>}
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
