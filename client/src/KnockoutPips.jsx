import "./KnockoutPips.css";

export default function KnockoutPips({ pips, editable = false, onToggle, size = "md", inline = false }) {
  const values = pips && pips.length === 3 ? pips : [false, false, false];

  return (
    <div className={`knockout-pips knockout-pips--${size} ${inline ? "knockout-pips--inline" : ""}`}>
      {values.map((knocked, i) =>
        editable ? (
          <button
            type="button"
            key={i}
            className={`knockout-pip ${knocked ? "knockout-pip--knocked" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle?.(i);
            }}
            aria-label={`Toggle knockout pip ${i + 1}`}
          />
        ) : (
          <span key={i} className={`knockout-pip ${knocked ? "knockout-pip--knocked" : ""}`} />
        )
      )}
    </div>
  );
}
