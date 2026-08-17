import {
  MagnifyingGlassIcon,
  HammerIcon,
  WindIcon,
  WallIcon,
  BridgeIcon,
  RadioactiveIcon,
  WarningIcon,
  EyeSlashIcon,
  AnchorIcon,
  LightningIcon,
  PlugsIcon,
  SwordIcon,
  LinkSimpleIcon,
  ArrowsSplitIcon,
  TimerIcon,
  GhostIcon,
  PersonSimpleRunIcon,
  ShuffleIcon,
  FireIcon,
  TrendUpIcon,
  XIcon,
  TriangleIcon,
  DropIcon,
  CopyIcon,
  StarIcon,
  ShieldIcon,
} from "@phosphor-icons/react";
import { SLUG_TYPES } from "./slugData.js";
import "./SlugToolbar.css";

export const SORT_OPTIONS = [
  { key: "name-asc", label: "Name (A–Z)" },
  { key: "name-desc", label: "Name (Z–A)" },
  { key: "power-desc", label: "Clash Power (High–Low)" },
  { key: "power-asc", label: "Clash Power (Low–High)" },
  { key: "defense-desc", label: "Clash Defense (High–Low)" },
  { key: "defense-asc", label: "Clash Defense (Low–High)" },
  { key: "type-asc", label: "Type (A–Z)" },
];

const FLAGS = [
  { key: "breaksWalls", label: "Wall Breaker", icon: HammerIcon },
  { key: "causesKnockback", label: "Knockback", icon: WindIcon },
  { key: "wallMaker", label: "Wall Maker", icon: WallIcon },
  { key: "bridgeMaker", label: "Bridge Maker", icon: BridgeIcon },
  { key: "aoeBlast", label: "AOE Blast", icon: RadioactiveIcon },
  { key: "hazardMaker", label: "Hazard Maker", icon: WarningIcon },
  { key: "causesBlind", label: "Causes Blind", icon: EyeSlashIcon },
  { key: "causesSnare", label: "Causes Snare", icon: AnchorIcon },
  { key: "causesShock", label: "Causes Shock", icon: LightningIcon },
  { key: "causesJam", label: "Causes Jam", icon: PlugsIcon },
  { key: "piercesWalls", label: "Pierces Walls", icon: SwordIcon },
  { key: "causesChain", label: "Causes Chain", icon: LinkSimpleIcon },
  { key: "ricochets", label: "Ricochets", icon: ArrowsSplitIcon },
  { key: "ultraFast", label: "Ultra Fast", icon: TimerIcon },
  { key: "causesInvisible", label: "Causes Invisible", icon: GhostIcon },
  { key: "causesFear", label: "Causes Fear", icon: PersonSimpleRunIcon },
  { key: "causesConfusion", label: "Causes Confusion", icon: ShuffleIcon },
  { key: "trailWall", label: "Trail Wall", icon: FireIcon },
  { key: "clashTripled", label: "Clash Tripled", icon: TrendUpIcon },
  { key: "coneBlast", label: "Cone Blast", icon: TriangleIcon },
  { key: "spawnsPods", label: "Spawns Pods", icon: DropIcon },
  { key: "mirageDecoy", label: "Mirage Decoy", icon: CopyIcon },
  { key: "starWall", label: "Star Wall", icon: StarIcon },
  { key: "anchorZone", label: "Anchor Zone", icon: ShieldIcon },
];

export function sortTemplates(list, sortKey) {
  const sorted = [...list];
  switch (sortKey) {
    case "name-desc":
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case "power-desc":
      return sorted.sort((a, b) => b.clashPower - a.clashPower || a.name.localeCompare(b.name));
    case "power-asc":
      return sorted.sort((a, b) => a.clashPower - b.clashPower || a.name.localeCompare(b.name));
    case "defense-desc":
      return sorted.sort((a, b) => b.clashDefense - a.clashDefense || a.name.localeCompare(b.name));
    case "defense-asc":
      return sorted.sort((a, b) => a.clashDefense - b.clashDefense || a.name.localeCompare(b.name));
    case "type-asc":
      return sorted.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    case "name-asc":
    default:
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
}

export function filterTemplates(list, { query, types, flags }) {
  const q = query.trim().toLowerCase();
  return list.filter((t) => {
    if (q && !t.name.toLowerCase().includes(q) && !t.type.toLowerCase().includes(q)) return false;
    if (types.size > 0 && !types.has(t.type)) return false;
    for (const flag of flags) {
      if (!t[flag]) return false;
    }
    return true;
  });
}

export default function SlugToolbar({
  query,
  onQueryChange,
  selectedTypes,
  onToggleType,
  selectedFlags,
  onToggleFlag,
  sortKey,
  onSortChange,
  resultCount,
  totalCount,
  onClear,
}) {
  const activeCount = selectedTypes.size + selectedFlags.size + (query.trim() ? 1 : 0);

  return (
    <div className="slug-toolbar">
      <div className="slug-toolbar-top">
        <div className="slug-toolbar-search">
          <MagnifyingGlassIcon weight="bold" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by name or type…"
            aria-label="Search slug templates"
          />
          {query && (
            <button type="button" className="slug-toolbar-search-clear" onClick={() => onQueryChange("")} title="Clear search">
              <XIcon weight="bold" />
            </button>
          )}
        </div>

        <label className="slug-toolbar-sort">
          <span>Sort</span>
          <select value={sortKey} onChange={(e) => onSortChange(e.target.value)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="slug-toolbar-filters">
        <div className="slug-toolbar-types" role="group" aria-label="Filter by type">
          {SLUG_TYPES.map((t) => {
            const active = selectedTypes.has(t.key);
            return (
              <button
                type="button"
                key={t.key}
                className={`slug-type-chip ${active ? "slug-type-chip--active" : ""}`}
                style={{ "--chip-color": t.color }}
                onClick={() => onToggleType(t.key)}
                aria-pressed={active}
              >
                {t.key}
              </button>
            );
          })}
        </div>

        <div className="slug-toolbar-divider" />

        <div className="slug-toolbar-flags" role="group" aria-label="Filter by ability">
          {FLAGS.map((f) => {
            const active = selectedFlags.has(f.key);
            const Icon = f.icon;
            return (
              <button
                type="button"
                key={f.key}
                className={`slug-flag-chip ${active ? "slug-flag-chip--active" : ""}`}
                onClick={() => onToggleFlag(f.key)}
                aria-pressed={active}
                title={f.label}
              >
                <Icon weight={active ? "fill" : "bold"} />
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="slug-toolbar-status">
        <span className="slug-toolbar-count">
          {resultCount === totalCount ? `${totalCount} slugs` : `${resultCount} of ${totalCount} slugs`}
        </span>
        {activeCount > 0 && (
          <button type="button" className="slug-toolbar-reset" onClick={onClear}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
