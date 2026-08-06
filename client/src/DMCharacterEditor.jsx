import { useEffect, useState } from "react";
import { UserCircleIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import ImageCropper from "./ImageCropper.jsx";
import StatPointBuy from "./StatPointBuy.jsx";
import ProficiencyPicker from "./ProficiencyPicker.jsx";
import CharacterVitals from "./CharacterVitals.jsx";
import SkillList from "./SkillList.jsx";
import KnockoutPips from "./KnockoutPips.jsx";
import GritRing from "./GritRing.jsx";
import { maxGrit } from "./characterData.js";
import "./DMCharacterEditor.css";

export default function DMCharacterEditor({ userId, onSaved }) {
  const { token } = useAuth();
  const [character, setCharacter] = useState(undefined);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [portrait, setPortrait] = useState(null);
  const [stats, setStats] = useState(null);
  const [proficiencies, setProficiencies] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCharacter(undefined);
    setError("");
    fetch(`/api/characters/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.character) return;
        setCharacter(data.character);
        setName(data.character.name);
        setAge(data.character.age ?? "");
        setPortrait(data.character.portrait);
        setStats(data.character.stats);
        setProficiencies(data.character.proficiencies);
      });
  }, [userId, token]);

  function togglePip(index) {
    const nextPips = character.knockoutPips.map((v, i) => (i === index ? !v : v));
    setCharacter((prev) => ({ ...prev, knockoutPips: nextPips }));
    fetch(`/api/characters/${userId}/knockout`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ knockoutPips: nextPips }),
    }).catch(() => {});
  }

  function changeCurrentGrit(nextGrit) {
    setCharacter((prev) => ({ ...prev, currentGrit: nextGrit }));
    fetch(`/api/characters/${userId}/grit`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ currentGrit: nextGrit }),
    }).catch(() => {});
  }

  const canSave = name.trim().length > 0 && stats;

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/characters/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          age: age === "" ? null : Number(age),
          portrait,
          stats,
          proficiencies,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not save character.");
      }
      onSaved?.(data.character);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!character) {
    return null;
  }

  return (
    <div className="dm-editor-card">
      <div className="dm-editor-header">
        <div className="dm-editor-portrait">
          <GritRing current={character.currentGrit} max={maxGrit(stats)} />
          {portrait ? <img src={portrait} alt={name} /> : <UserCircleIcon weight="duotone" />}
          <KnockoutPips size="lg" pips={character.knockoutPips} editable onToggle={togglePip} />
        </div>
      </div>

      <div className="dm-editor-section">
        <h2>Photo</h2>
        <ImageCropper value={portrait} onChange={setPortrait} />
      </div>

      <div className="dm-editor-field">
        <label htmlFor="dm-editor-name">Character Name</label>
        <input id="dm-editor-name" type="text" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="dm-editor-field">
        <label htmlFor="dm-editor-age">Age</label>
        <input
          id="dm-editor-age"
          type="number"
          min={1}
          max={999}
          value={age}
          onChange={(e) => setAge(e.target.value)}
        />
      </div>

      <CharacterVitals
        stats={stats}
        currentGrit={character.currentGrit}
        editable
        onChangeCurrentGrit={changeCurrentGrit}
      />

      <div className="dm-editor-section">
        <h2>Stats</h2>
        <StatPointBuy stats={stats} onChange={setStats} unrestricted />
      </div>

      <div className="dm-editor-section">
        <h2>Proficiencies</h2>
        <ProficiencyPicker selected={proficiencies} onChange={setProficiencies} unlimited />
      </div>

      <div className="dm-editor-section">
        <h2>Skills</h2>
        <SkillList stats={stats} proficiencies={proficiencies} />
      </div>

      {error && <div className="dm-editor-error">{error}</div>}

      <div className="dm-editor-actions">
        <button type="button" className="dm-editor-save" onClick={handleSave} disabled={!canSave || saving}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
