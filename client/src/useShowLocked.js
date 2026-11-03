import { useCallback, useState } from "react";

// Whether a picker (the fire modal, the combat hotbar) also lists the actions
// that are locked right now. Off by default -- the player's choice is only a
// per-device convenience, so storage failures just fall back to hidden.
export function useShowLocked(storageKey) {
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setShow((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // private window / blocked storage: the toggle still works for this visit
      }
      return next;
    });
  }, [storageKey]);
  return [show, toggle];
}
