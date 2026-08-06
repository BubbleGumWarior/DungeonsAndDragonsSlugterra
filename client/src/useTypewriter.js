import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function useTypewriter(text, { charDelay = 20 } = {}) {
  const [displayText, setDisplayText] = useState(text);
  const [isTyping, setIsTyping] = useState(false);
  const currentRef = useRef(text);
  const timeoutRef = useRef(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      currentRef.current = text;
      setDisplayText(text);
      return;
    }

    if (currentRef.current === text) return;

    clearTimeout(timeoutRef.current);

    if (prefersReducedMotion()) {
      currentRef.current = text;
      setDisplayText(text);
      return;
    }

    setIsTyping(true);

    function tick() {
      const current = currentRef.current;
      if (current === text) {
        setIsTyping(false);
        return;
      }

      const next = text.startsWith(current)
        ? text.slice(0, current.length + 1)
        : current.slice(0, Math.max(0, current.length - 1));

      currentRef.current = next;
      setDisplayText(next);
      timeoutRef.current = setTimeout(tick, charDelay);
    }

    timeoutRef.current = setTimeout(tick, charDelay);
    return () => clearTimeout(timeoutRef.current);
  }, [text, charDelay]);

  return { text: displayText, isTyping };
}
