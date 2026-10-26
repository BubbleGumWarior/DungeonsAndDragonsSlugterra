import { CaretDownIcon } from "@phosphor-icons/react";
import { PROFICIENCIES, entryLabel, statByKey } from "./characterData.js";
import { STAT_GUIDE } from "./statGuide.js";
import "./StatGuide.css";

// "What your stats do": one plain-language line per stat, and per skill what it
// buys you in this world. Before the Slugterra reveal it shows the stat lines
// only, worded for an ordinary job (see statGuide.js).
export default function StatGuide({ proficiencies = [], revealed = true }) {
  return (
    <details className="stat-guide" open>
      <summary className="stat-guide-summary">
        <h2>What your stats do</h2>
        <CaretDownIcon className="stat-guide-caret" weight="bold" aria-hidden="true" />
      </summary>

      <dl className="stat-guide-list">
        {STAT_GUIDE.map((entry) => {
          const stat = statByKey(entry.key);
          const skills = revealed ? PROFICIENCIES.filter((p) => p.stat === entry.key) : [];
          return (
            <div className="stat-guide-row" key={entry.key}>
              <dt className="stat-guide-stat">
                <span className="stat-guide-abbr">{stat.abbr}</span>
                <span className="stat-guide-name">{stat.label}</span>
              </dt>
              <dd className="stat-guide-body">
                <p className="stat-guide-lede">{revealed ? entry.summary : entry.hiddenSummary}</p>
                {skills.length > 0 && (
                  <ul className="stat-guide-skills">
                    {skills.map((p) => {
                      const benefit = entry.skills[p.key];
                      return (
                        <li key={p.key} className={benefit ? "" : "stat-guide-skill--idle"}>
                          <span className="stat-guide-skill-name">
                            {entryLabel(p, revealed)}
                            {proficiencies.includes(p.key) && <span className="stat-guide-trained">Proficient</span>}
                          </span>
                          <span className="stat-guide-skill-note">{benefit || "Rolled when the DM calls for it."}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}
