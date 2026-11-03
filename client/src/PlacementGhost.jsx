import { useEffect, useRef, useState } from "react";
import { placementGeometry } from "./buildPlacement.js";
import "./PlacementGhost.css";

// The mock-up of a Make Wall / Build Bridge shot: a ghost of the structure at
// the cursor, in the shape, size and facing it would be built with, plus a dotted
// line from the shooter and an arrow showing which way it faces / runs.
// It tracks the pointer itself (a native listener on the map's <svg>) so only
// this small piece re-renders as the cursor moves, not the whole map.
export default function PlacementGhost({ svgRef, getPoint, placement, markerS = 1 }) {
  const [aim, setAim] = useState(null);
  const getPointRef = useRef(getPoint);
  getPointRef.current = getPoint;

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const move = (e) => setAim(getPointRef.current(e));
    const leave = () => setAim(null);
    el.addEventListener("mousemove", move);
    el.addEventListener("mouseleave", leave);
    return () => {
      el.removeEventListener("mousemove", move);
      el.removeEventListener("mouseleave", leave);
    };
  }, [svgRef]);

  if (!placement || !aim) return null;
  const geo = placementGeometry({ ...placement, aim });
  const turned = Math.round(placement.rotation);
  const label = turned === 0 ? "Q / E to turn" : `Turned ${turned > 0 ? "+" : ""}${turned}°`;
  const arrowLen = (geo.kind === "wall" ? 46 : 30) * markerS;
  const head = 9 * markerS;
  const planks = geo.kind === "bridge" ? Math.max(2, Math.floor(geo.length / 38)) : 0;

  return (
    <g className="placement-ghost" style={{ "--ghost-color": placement.color }} pointerEvents="none">
      <line className="placement-ghost-aim" x1={placement.shooter.x} y1={placement.shooter.y} x2={geo.point.x} y2={geo.point.y} />

      {geo.kind === "wall" ? (
        <>
          <line className="placement-ghost-halo" x1={geo.x1} y1={geo.y1} x2={geo.x2} y2={geo.y2} />
          <line className="placement-ghost-wall" x1={geo.x1} y1={geo.y1} x2={geo.x2} y2={geo.y2} />
          <circle className="placement-ghost-cap" cx={geo.x1} cy={geo.y1} r={4 * markerS} />
          <circle className="placement-ghost-cap" cx={geo.x2} cy={geo.y2} r={4 * markerS} />
          <g transform={`translate(${geo.point.x} ${geo.point.y}) rotate(${geo.facing})`}>
            <line className="placement-ghost-arrow" x1={0} y1={0} x2={arrowLen} y2={0} />
            <polygon className="placement-ghost-arrowhead" points={`${arrowLen + head},0 ${arrowLen},${-head * 0.6} ${arrowLen},${head * 0.6}`} />
          </g>
        </>
      ) : (
        <g transform={`translate(${geo.point.x} ${geo.point.y}) rotate(${geo.facing})`}>
          <rect className="placement-ghost-deck" x={0} y={-geo.width / 2} width={geo.length} height={geo.width} rx={18} ry={18} />
          {Array.from({ length: planks }, (_, i) => {
            const x = ((i + 0.5) * geo.length) / planks;
            return <line key={i} className="placement-ghost-plank" x1={x} x2={x} y1={-geo.width / 2 + 7} y2={geo.width / 2 - 7} />;
          })}
          <line className="placement-ghost-arrow" x1={geo.length * 0.18} y1={0} x2={geo.length * 0.82} y2={0} />
          <polygon
            className="placement-ghost-arrowhead"
            points={`${geo.length * 0.82 + head},0 ${geo.length * 0.82},${-head * 0.6} ${geo.length * 0.82},${head * 0.6}`}
          />
        </g>
      )}

      <circle className="placement-ghost-anchor" cx={geo.point.x} cy={geo.point.y} r={3.5 * markerS} />
      <text className="placement-ghost-label" x={geo.point.x} y={geo.point.y - (geo.kind === "wall" ? 18 : geo.width / 2 + 12) * markerS} style={{ fontSize: 13 * markerS }}>
        {label}
      </text>
    </g>
  );
}
