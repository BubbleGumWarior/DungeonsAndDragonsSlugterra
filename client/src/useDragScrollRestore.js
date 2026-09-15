import { useEffect } from "react";

// Several loadout screens jump the page to the top on `dragstart` so the drop
// targets (weapon slots, mecha-beasts, blasters) are in view no matter where
// the dragged card was picked up. When the drag ends the player should land
// back where they started.
//
// Doing that restore from the dragged element's own `onDragEnd` is unreliable:
// a successful drop updates state (the card becomes "equipped"), React
// re-renders and removes that element's `draggable`/`onDragEnd` before the
// native `dragend` event gets to fire, so the handler never runs. Listening on
// `document` instead is immune to that re-render.
//
// Call this once from a page that has drag-and-drop. It records the scroll
// position on any `dragstart` within the document and restores it on `dragend`.
export function useDragScrollRestore() {
  useEffect(() => {
    let startY = null;

    function onDragStart() {
      startY = window.scrollY;
    }

    function onDragEnd() {
      if (startY == null) return;
      const y = startY;
      startY = null;
      // Wait two frames: the drop's state update needs to re-render and the
      // list needs to re-lay-out before the target scroll offset is valid.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
      });
    }

    // Capture phase so the position is recorded before any element-level
    // `onDragStart` handler scrolls the page to the top.
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("dragend", onDragEnd, true);
    return () => {
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("dragend", onDragEnd, true);
    };
  }, []);
}
