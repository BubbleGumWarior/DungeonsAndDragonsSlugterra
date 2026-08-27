import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import NavBar from "./NavBar.jsx";
import CharacterSheetView from "./CharacterSheetView.jsx";
import "./CharacterSheet.css";

export default function CharacterSheet() {
  const { token, user } = useAuth();
  const { characterUpdate, partyHealed } = useLiveState();
  const navigate = useNavigate();
  const [character, setCharacter] = useState(undefined);

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
        <CharacterSheetView character={character} />
      </div>
    </Fragment>
  );
}
