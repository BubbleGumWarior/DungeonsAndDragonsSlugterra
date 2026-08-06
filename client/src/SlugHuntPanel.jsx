import { CompassIcon } from "@phosphor-icons/react";
import "./Panel.css";
import "./SlugHuntPanel.css";

// Shell only: static placeholder data, no live wiring yet.
const PLACEHOLDER_ODDS = [
  { name: "Boomer", chance: 62 },
  { name: "Tazerling", chance: 41 },
  { name: "Flaringo", chance: 24 },
  { name: "Aquabeek", chance: 9 },
];

export default function SlugHuntPanel({ isDungeonMaster = false }) {
  return (
    <div className="panel panel--quiet slughunt-panel">
      <div className="panel-header">
        <span className="panel-header-icon">
          <CompassIcon weight="duotone" />
        </span>
        <div className="panel-header-text">
          <h2>Slug Hunt</h2>
          <p>Odds of finding slugs at the party's location</p>
        </div>
      </div>

      <div className="panel-body">
        {isDungeonMaster ? (
          <div className="panel-field">
            <label>Party Location</label>
            <select disabled>
              <option>Ferric Caverns</option>
            </select>
          </div>
        ) : (
          <div className="slughunt-location">
            <span>Current Location</span>
            <strong>Ferric Caverns</strong>
          </div>
        )}

        <div className="slughunt-list">
          {PLACEHOLDER_ODDS.map((slug) => (
            <div key={slug.name} className="slughunt-row">
              <span className="slughunt-name">{slug.name}</span>
              <div className="slughunt-bar-track">
                <div className="slughunt-bar-fill" style={{ "--fill": slug.chance / 100 }} />
              </div>
              <span className="slughunt-chance">{slug.chance}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
