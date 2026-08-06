import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftIcon, ArrowRightIcon, BookOpenIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import ImageCropper from "./ImageCropper.jsx";
import StatPointBuy from "./StatPointBuy.jsx";
import ProficiencyPicker from "./ProficiencyPicker.jsx";
import { REQUIRED_PROFICIENCIES, STATS, TOTAL_STAT_POINTS, defaultStats, totalStatCost } from "./characterData.js";
import "./CharacterCreate.css";

const STEP_TITLES = ["Identity", "Stats", "Proficiencies"];
const FLIP_DURATION = 380;

export default function CharacterCreate() {
  const { token } = useAuth();
  const { slugterraRevealed } = useLiveState();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [portrait, setPortrait] = useState(null);
  const [stats, setStats] = useState(defaultStats());
  const [proficiencies, setProficiencies] = useState([]);

  const [displayedStep, setDisplayedStep] = useState(0);
  const [phase, setPhase] = useState("idle");
  const [direction, setDirection] = useState("forward");
  const [pendingStep, setPendingStep] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/characters/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.character) {
          navigate("/character", { replace: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  const canGoNext =
    (displayedStep === 0 && name.trim().length > 0) ||
    (displayedStep === 1 && totalStatCost(stats) === TOTAL_STAT_POINTS) ||
    (displayedStep === 2 && proficiencies.length === REQUIRED_PROFICIENCIES);

  function goToStep(nextStep, dir) {
    if (phase !== "idle") return;
    setDirection(dir);
    setPendingStep(nextStep);
    setPhase("out");
  }

  function handleOutEnd() {
    setDisplayedStep(pendingStep);
    setPhase("in");
  }

  function handleInEnd() {
    setPhase("idle");
    setPendingStep(null);
  }

  async function handleFinish() {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
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
        throw new Error(data.error || "Could not create character.");
      }
      navigate("/character");
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  function renderStep(step) {
    if (step === 0) {
      return (
        <div className="creation-page-inner">
          <h2>Who are you?</h2>
          <p className="creation-page-subtitle">
            {slugterraRevealed ? "Begin your legend in Slugterra." : "Begin your legend."}
          </p>

          <ImageCropper value={portrait} onChange={setPortrait} />

          <div className="creation-field">
            <label htmlFor="character-name">Character Name</label>
            <input
              id="character-name"
              type="text"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Eli Shane"
            />
          </div>

          <div className="creation-field">
            <label htmlFor="character-age">Age</label>
            <input
              id="character-age"
              type="number"
              min={1}
              max={999}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="16"
            />
          </div>
        </div>
      );
    }

    if (step === 1) {
      return (
        <div className="creation-page-inner">
          <h2>Assign Your Stats</h2>
          <p className="creation-page-subtitle">Distribute {TOTAL_STAT_POINTS} points across your {STATS.length} stats.</p>
          <StatPointBuy stats={stats} onChange={setStats} />
        </div>
      );
    }

    return (
      <div className="creation-page-inner">
        <h2>Choose Proficiencies</h2>
        <p className="creation-page-subtitle">Pick {REQUIRED_PROFICIENCIES} skills. Each grants a +2 bonus to its stat.</p>
        <ProficiencyPicker selected={proficiencies} onChange={setProficiencies} />
      </div>
    );
  }

  const showingStep = phase === "idle" ? displayedStep : phase === "out" ? displayedStep : pendingStep;
  const pageClass =
    phase === "idle" ? "" : phase === "out" ? `page-flip-out page-flip-out--${direction}` : `page-flip-in page-flip-in--${direction}`;

  return (
    <div className="creation-page">
      <div className="creation-header">
        <BookOpenIcon weight="duotone" />
        <span>Character Codex</span>
      </div>

      <div className="creation-steps">
        {STEP_TITLES.map((title, i) => (
          <div key={title} className={`creation-step-dot ${i === displayedStep ? "creation-step-dot--active" : ""} ${i < displayedStep ? "creation-step-dot--done" : ""}`}>
            <span className="creation-step-number">{i + 1}</span>
            <span className="creation-step-label">{title}</span>
          </div>
        ))}
      </div>

      <div className="creation-book">
        <div
          className={`creation-page-page ${pageClass}`}
          onAnimationEnd={phase === "out" ? handleOutEnd : phase === "in" ? handleInEnd : undefined}
        >
          {renderStep(showingStep)}
        </div>
      </div>

      {error && <div className="creation-error">{error}</div>}

      <div className="creation-nav">
        <button
          type="button"
          className="creation-nav-btn"
          onClick={() => goToStep(displayedStep - 1, "backward")}
          disabled={displayedStep === 0 || phase !== "idle"}
        >
          <ArrowLeftIcon weight="bold" />
          Back
        </button>

        {displayedStep < 2 ? (
          <button
            type="button"
            className="creation-nav-btn creation-nav-btn--primary"
            onClick={() => goToStep(displayedStep + 1, "forward")}
            disabled={!canGoNext || phase !== "idle"}
          >
            Next
            <ArrowRightIcon weight="bold" />
          </button>
        ) : (
          <button
            type="button"
            className="creation-nav-btn creation-nav-btn--primary"
            onClick={handleFinish}
            disabled={!canGoNext || submitting}
          >
            {submitting ? "Binding your legend..." : "Finish"}
          </button>
        )}
      </div>
    </div>
  );
}
