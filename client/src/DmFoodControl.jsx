import { useEffect, useRef, useState } from "react";
import { BowlFoodIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { FOOD_MAX, foodState } from "./careData.js";

const STEP = 5;

// The DM's hand on one slug's food meter: -/+ nudge it by STEP (sent as a
// delta, so quick clicks all land), or type an exact percent. Shows the
// meter's state word so a starving slug stands out on the desk. `readOnly`
// (a DM Assistant) shows the same readout with nothing to press.
export default function DmFoodControl({ slug, onChange, readOnly = false }) {
  const { token } = useAuth();
  const food = slug.food ?? FOOD_MAX;
  const [draft, setDraft] = useState(String(food));
  const [error, setError] = useState(null);
  const editing = useRef(false);
  // Responses to quick clicks can arrive out of order; only the newest
  // request's answer is shown (the server applied every delta regardless).
  const latest = useRef(0);

  useEffect(() => {
    if (!editing.current) setDraft(String(food));
  }, [food]);

  async function send(body, optimistic) {
    const seq = ++latest.current;
    setError(null);
    onChange?.({ ...slug, food: optimistic });
    try {
      const res = await fetch(`/api/slugs/${slug.id}/food`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not change food.");
      if (seq === latest.current) onChange?.(data.slug);
    } catch (err) {
      setError(err.message);
      if (seq === latest.current) onChange?.({ ...slug, food });
    }
  }

  const nudge = (delta) => send({ delta }, Math.min(FOOD_MAX, Math.max(0, food + delta)));

  function commit() {
    editing.current = false;
    const value = Math.round(Number(draft));
    if (!Number.isFinite(value) || draft.trim() === "") return setDraft(String(food));
    const clamped = Math.min(FOOD_MAX, Math.max(0, value));
    setDraft(String(clamped));
    if (clamped !== food) send({ food: clamped }, clamped);
  }

  const state = foodState(food);

  return (
    <div className={`dm-food dm-food--${state.tone}`} title={error ?? `${slug.name}'s food: ${food}% (${state.label})`}>
      <BowlFoodIcon weight="bold" className="dm-food-icon" aria-hidden="true" />
      <button type="button" className="dm-food-step" aria-label={`Lower ${slug.name}'s food by ${STEP}%`} disabled={readOnly || food <= 0} onClick={() => nudge(-STEP)}>
        <MinusIcon weight="bold" />
      </button>
      <label className="dm-food-value">
        <input
          type="text"
          inputMode="numeric"
          className="num-tabular"
          aria-label={`${slug.name}'s food percent`}
          value={draft}
          readOnly={readOnly}
          onFocus={(e) => {
            editing.current = true;
            e.target.select();
          }}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              editing.current = false;
              setDraft(String(food));
              e.currentTarget.blur();
            }
          }}
        />
        %
      </label>
      <button type="button" className="dm-food-step" aria-label={`Raise ${slug.name}'s food by ${STEP}%`} disabled={readOnly || food >= FOOD_MAX} onClick={() => nudge(STEP)}>
        <PlusIcon weight="bold" />
      </button>
      <span className="dm-food-label">{error ? "Not saved" : state.label}</span>
    </div>
  );
}
