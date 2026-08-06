// Which index is the one that actually counts. Value-matching breaks on
// ties (both dice showing the same number); comparing by position doesn't.
export function keptIndex(values, rollType) {
  if (values.length === 1) return 0;
  return rollType === "advantage" ? (values[0] >= values[1] ? 0 : 1) : values[0] <= values[1] ? 0 : 1;
}

export default function Die({ value, rolling = false, state = null, size = "md" }) {
  const classes = ["die", `die--${size}`];
  if (rolling) classes.push("die--rolling");
  if (state === "kept") classes.push("die--kept");
  if (state === "discarded") classes.push("die--discarded");
  if (!rolling && value === 20) classes.push("die--crit");
  if (!rolling && value === 1) classes.push("die--fail");
  return (
    <div className={classes.join(" ")}>
      <div className="die-face" />
      <span className="die-value num-tabular">{value}</span>
    </div>
  );
}
