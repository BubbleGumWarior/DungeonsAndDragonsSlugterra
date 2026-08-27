import { useCallback, useEffect, useState } from "react";
import { ArrowLeftIcon, PencilSimpleIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import CharacterSheetView from "./CharacterSheetView.jsx";
import DMCharacterEditor from "./DMCharacterEditor.jsx";
import "./DMCharacterViewer.css";

export default function DMCharacterViewer({ userId, onDeselect }) {
  const { token } = useAuth();
  const { characterUpdate, partyHealed } = useLiveState();
  const [character, setCharacter] = useState(undefined);
  const [mode, setMode] = useState("view");

  useEffect(() => {
    setMode("view");
  }, [userId]);

  const fetchCharacter = useCallback(
    ({ clear = false } = {}) => {
      if (clear) setCharacter(undefined);
      fetch(`/api/characters/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => setCharacter(data.character ?? null))
        .catch(() => setCharacter(null));
    },
    [userId, token]
  );

  useEffect(() => {
    if (mode !== "view") return;
    fetchCharacter({ clear: true });
  }, [fetchCharacter, mode]);

  useEffect(() => {
    if (mode === "view" && characterUpdate && characterUpdate.userId === userId) {
      setCharacter(characterUpdate.character);
    }
  }, [characterUpdate, mode, userId]);

  // A per-character heal broadcast can be coalesced away in the Heal All
  // burst (see AccessSocket's single-slot note); re-sync from the server.
  useEffect(() => {
    if (mode === "view" && partyHealed) fetchCharacter();
  }, [partyHealed, mode, fetchCharacter]);

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
