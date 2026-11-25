import { FireIcon, UserCircleIcon } from "@phosphor-icons/react";
import { HEAT_MAX, HEAT_TRACK, STATS, fameTierLabel, formatModifier, heatColor, maxGrit, scoreLabel, statModifier } from "./characterData.js";
import { useLiveState } from "./AccessSocket.jsx";
import CharacterVitals from "./CharacterVitals.jsx";
import FameHeatStepper from "./FameHeatStepper.jsx";
import SkillList from "./SkillList.jsx";
import { rollableProps } from "./rollableProps.js";
import StatGuide from "./StatGuide.jsx";
import KnockoutPips from "./KnockoutPips.jsx";
import GritRing from "./GritRing.jsx";
import "./CharacterSheet.css";

// onChangeFame/onChangeHeat are only ever passed by the DM's viewer
// (DMCharacterViewer.jsx's default "view" mode) -- a quick way to nudge or
// directly type a new Fame/Heat value without switching into the full
// character editor. A player's own sheet (CharacterSheet.jsx) never passes
// these, so it stays the plain read-only tiles below.
// onRoll(kind, key) is only passed on a player's own sheet: it makes each stat
// tile and skill row a one-click d20 roll. The DM's read-only view of someone
// else's sheet omits it, so those stay plain.
export default function CharacterSheetView({ character, onChangeFame, onChangeHeat, onRoll }) {
  const { slugterraRevealed } = useLiveState();
  const editableByDm = Boolean(onChangeFame || onChangeHeat);
  return (
    <div className="sheet-card">
      <div className="sheet-columns">
        <div className="sheet-column sheet-column-main">
          <div className="sheet-header">
            <div className="sheet-portrait">
              <GritRing current={character.currentGrit} max={maxGrit(character.stats, character.gritBonus)} />
              {character.portrait ? (
                <img src={character.portrait} alt={character.name} />
              ) : (
                <UserCircleIcon weight="duotone" />
              )}
              <KnockoutPips size="lg" pips={character.knockoutPips} editable={false} />
            </div>
            <div className="sheet-identity">
              <h1>{character.name}</h1>
              {character.ill && (
                <p className="sheet-ill" title="Max Grit, AP and accuracy are halved when a fight begins. Take Meds on three long rests in a row.">
                  Sick: halved Grit, AP and accuracy in a fight
                </p>
              )}
              {character.age && <p className="sheet-age">Age {character.age}</p>}
            </div>
          </div>

          <CharacterVitals stats={character.stats} currentGrit={character.currentGrit} gritBonus={character.gritBonus} />

          {editableByDm ? (
            <div className="sheet-fame sheet-fame--editable">
              <FameHeatStepper
                label={`Fame — ${fameTierLabel(character.fame ?? 0)}`}
                value={character.fame}
                onChange={onChangeFame}
              />
              <FameHeatStepper
                label="Heat"
                value={character.heat}
                onChange={onChangeHeat}
                icon={<FireIcon weight="fill" />}
                valueColor={heatColor}
                sliderMax={HEAT_MAX}
                sliderTrack={HEAT_TRACK}
              />
            </div>
          ) : (
            <div className="sheet-fame">
              <div className="sheet-fame-stat">
                <span className="sheet-fame-value">{character.fame ?? 0}</span>
                <span className="sheet-fame-label">Fame — {fameTierLabel(character.fame ?? 0)}</span>
              </div>
              <div className="sheet-fame-stat">
                <span className="sheet-fame-value sheet-fame-value--heat" style={{ color: heatColor(character.heat) }}>
                  <FireIcon weight="fill" />
                  {character.heat ?? 0}
                </span>
                <span className="sheet-fame-label">Heat</span>
              </div>
            </div>
          )}

          <div className="sheet-section">
            <h2>Stats</h2>
            {onRoll && <p className="sheet-roll-hint">Click a stat or skill to roll a d20 with its modifier.</p>}
            <div className="sheet-stats">
              {STATS.map(({ key, label, abbr }) => {
                const value = character.stats[key];
                const rollProps = rollableProps(onRoll, "stat", key, label, statModifier(value));
                return (
                  <div className={`sheet-stat${onRoll ? " sheet-stat--rollable" : ""}`} key={key} {...rollProps}>
                    <div className="sheet-stat-label">
                      <span className="sheet-stat-abbr">{abbr}</span>
                      {label}
                    </div>
                    <div className="sheet-stat-score">
                      <span className="sheet-stat-score-value">{value}</span>
                      <span className="sheet-stat-modifier">{formatModifier(statModifier(value))}</span>
                    </div>
                    <span className="sheet-stat-scale">{scoreLabel(value)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="sheet-column sheet-column-skills">
          <div className="sheet-section">
            <h2>Skills</h2>
            <SkillList stats={character.stats} proficiencies={character.proficiencies} expertise={character.expertise ?? []} revealed={slugterraRevealed} onRoll={onRoll} />
          </div>
        </div>
      </div>

      <StatGuide proficiencies={character.proficiencies ?? []} expertise={character.expertise ?? []} revealed={slugterraRevealed} />
    </div>
  );
}
