import "./GritRing.css";

const RADIUS = 47;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function GritRing({ current, max }) {
  const safeMax = max > 0 ? max : 1;
  const percent = Math.max(0, Math.min(100, (current / safeMax) * 100));
  const offset = CIRCUMFERENCE * (1 - percent / 100);
  const hue = (percent / 100) * 120;
  const color = `hsl(${hue}, 72%, 46%)`;

  return (
    <svg className="grit-ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle className="grit-ring-track" cx="50" cy="50" r={RADIUS} />
      <circle
        className="grit-ring-fill"
        cx="50"
        cy="50"
        r={RADIUS}
        style={{
          stroke: color,
          strokeDasharray: CIRCUMFERENCE,
          strokeDashoffset: offset,
        }}
      />
    </svg>
  );
}
