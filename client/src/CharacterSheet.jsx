import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { DiceSixIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import NavBar from "./NavBar.jsx";
import CharacterSheetView from "./CharacterSheetView.jsx";
import { useToast } from "./Toast.jsx";
import { formatModifier } from "./characterData.js";
import "./CharacterSheet.css";

export default function CharacterSheet() {
  const { token, user } = useAuth();
  const { characterUpdate, partyHealed } = useLiveState();
  const navigate = useNavigate();
  const [character, setCharacter] = useState(undefined);
  const { push } = useToast();
  const rollingRef = useRef(false);

  // A plain d20 + the clicked stat or skill, rolled and logged to the Events
  // feed by the server. The toast is the roller's own confirmation, since the
  // Events panel lives on the dashboard, not on this page.
  const handleRoll = useCallback(
    async (kind, key) => {
      if (rollingRef.current) return;
      rollingRef.current = true;
      try {
        const res = await fetch("/api/dice-roll/self", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ kind, key }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not roll.");
        const { skillLabel, modifier, results } = data.roll;
        const { kept, total } = results[0];
        const note = kept === 20 ? " Natural 20!" : kept === 1 ? " Natural 1." : "";
        push({
          title: `${skillLabel} ${formatModifier(modifier)}`,
          body: `d20 ${kept} ${formatModifier(modifier)} = ${total}.${note} Logged to Events.`,
          tone: kept === 20 ? "success" : kept === 1 ? "warn" : "info",
          icon: <DiceSixIcon weight="duotone" />,
          duration: 4500,
        });
      } catch (err) {
        push({ title: "Roll failed", body: err.message, tone: "warn", duration: 4500 });
      } finally {
        rollingRef.current = false;
      }
    },
    [token, push]
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/characters/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.character) {
          navigate("/character/create", { replace: true });
        } else {
          setCharacter(data.character);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  useEffect(() => {
    if (characterUpdate && characterUpdate.userId === user?.id) {
      setCharacter(characterUpdate.character);
    }
  }, [characterUpdate, user]);

  // The Heal All broadcast burst can drop this character's update
  // (see AccessSocket's single-slot note); re-sync from the server.
  useEffect(() => {
    if (!partyHealed) return;
    let cancelled = false;
    fetch("/api/characters/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.character) setCharacter(data.character);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [partyHealed, token]);

  if (!character) {
    return null;
  }

  return (
    <Fragment>
      <NavBar />
      <div className="sheet-page">
        <CharacterSheetView character={character} onRoll={handleRoll} />
      </div>
    </Fragment>
  );
}
