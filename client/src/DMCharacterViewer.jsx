import { useEffect, useState } from "react";
import { ArrowLeftIcon, PencilSimpleIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import CharacterSheetView from "./CharacterSheetView.jsx";
import DMCharacterEditor from "./DMCharacterEditor.jsx";
import "./DMCharacterViewer.css";

export default function DMCharacterViewer({ userId, onDeselect }) {
  const { token } = useAuth();
  const { characterUpdate } = useLiveState();
  const [character, setCharacter] = useState(undefined);
  const [mode, setMode] = useState("view");

  useEffect(() => {
    setMode("view");
  }, [userId]);

  useEffect(() => {
    if (mode !== "view") return;
    setCharacter(undefined);
    fetch(`/api/characters/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setCharacter(data.character ?? null))
      .catch(() => setCharacter(null));
  }, [userId, token, mode]);

  useEffect(() => {
    if (mode === "view" && characterUpdate && characterUpdate.userId === userId) {
      setCharacter(characterUpdate.character);
    }
  }, [characterUpdate, mode, userId]);

  function handleSaved(updated) {
    setCharacter(updated);
    setMode("view");
  }

  return (
    <div className="dm-viewer">
      <div className="dm-viewer-toolbar">
        <button type="button" className="dm-viewer-back" onClick={onDeselect}>
          <ArrowLeftIcon weight="bold" />
          Back to Roster
        </button>

        {mode === "view" && character && (
          <button type="button" className="dm-viewer-edit-toggle" onClick={() => setMode("edit")}>
            <PencilSimpleIcon weight="bold" />
            Edit
          </button>
        )}
        {mode === "edit" && (
          <button type="button" className="dm-viewer-edit-toggle" onClick={() => setMode("view")}>
            <XIcon weight="bold" />
            Cancel
          </button>
        )}
      </div>

      {mode === "edit" ? (
        <DMCharacterEditor userId={userId} onSaved={handleSaved} />
      ) : character === undefined ? null : character ? (
        <CharacterSheetView character={character} />
      ) : (
        <div className="dm-viewer-empty">This player hasn't created a character yet.</div>
      )}
    </div>
  );
}
