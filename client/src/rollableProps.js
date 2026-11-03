import { formatModifier } from "./characterData.js";

// Props that turn a div into a keyboard-operable roll button. Empty when no
// onRoll is given, so read-only sheets keep their plain markup.
export function rollableProps(onRoll, kind, key, label, modifier) {
  if (!onRoll) return {};
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": `Roll ${label}, ${formatModifier(modifier)}`,
    onClick: () => onRoll(kind, key),
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onRoll(kind, key);
      }
    },
  };
}
