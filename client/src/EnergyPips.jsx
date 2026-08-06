import "./EnergyPips.css";

export default function EnergyPips({ pips, editable = false, onToggle, size = "md" }) {
  const values = Array.isArray(pips) ? pips : [];

  return (
    <div className={`energy-pips energy-pips--${size}`}>
      {values.map((charged, i) =>
        editable ? (
          <button
            type="button"
            key={i}
            className={`energy-pip ${charged ? "" : "energy-pip--spent"}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle?.(i);
            }}
            aria-label={`Toggle energy pip ${i + 1}`}
          />
        ) : (
          <span key={i} className={`energy-pip ${charged ? "" : "energy-pip--spent"}`} />
        )
      )}
    </div>
  );
}
