import {
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
  TriangleIcon,
  DropIcon,
  CopyIcon,
  StarIcon,
  ShieldIcon,
  FireExtinguisherIcon,
  CloudIcon,
  ProhibitIcon,
  MagnetIcon,
  BrainIcon,
  SwapIcon,
  FootprintsIcon,
  TornadoIcon,
  FastForwardIcon,
  HeartbeatIcon,
  ShieldSlashIcon,
  AsteriskIcon,
  BroadcastIcon,
} from "@phosphor-icons/react";
import { SLUG_TRAITS } from "./slugData.js";

// Presentation layer for the boolean ability flags. slugData.js owns the
// canonical key + label + description; this module adds the icon and the
// authoring group so the trait picker (SlugForm) and the filter rail
// (SlugToolbar) render from one list instead of each keeping their own copy
// of all ~37 flags.

const TRAIT_ICONS = {
  breaksWalls: HammerIcon,
  causesKnockback: WindIcon,
  wallMaker: WallIcon,
  bridgeMaker: BridgeIcon,
  aoeBlast: RadioactiveIcon,
  hazardMaker: WarningIcon,
  causesBlind: EyeSlashIcon,
  causesSnare: AnchorIcon,
  causesShock: LightningIcon,
  causesJam: PlugsIcon,
  piercesWalls: SwordIcon,
  causesChain: LinkSimpleIcon,
  ricochets: ArrowsSplitIcon,
  ultraFast: TimerIcon,
  causesInvisible: GhostIcon,
  causesFear: PersonSimpleRunIcon,
  causesConfusion: ShuffleIcon,
  trailWall: FireIcon,
  clashTripled: TrendUpIcon,
  coneBlast: TriangleIcon,
  spawnsPods: DropIcon,
  mirageDecoy: CopyIcon,
  starWall: StarIcon,
  anchorZone: ShieldIcon,
  voidsFireClash: FireExtinguisherIcon,
  clearsFireTerrain: CloudIcon,
  causesDisarm: ProhibitIcon,
  disarmZone: MagnetIcon,
  mindScramble: BrainIcon,
  swapsPosition: SwapIcon,
  frictionShift: FootprintsIcon,
  crosswindZone: TornadoIcon,
  skipsReload: FastForwardIcon,
  emotionSurge: HeartbeatIcon,
  uncounterable: ShieldSlashIcon,
  damageTripled: AsteriskIcon,
  staticMark: BroadcastIcon,
};

// Ordered authoring buckets. Every trait key appears in exactly one group;
// GROUP_ASSIGNMENTS is checked against SLUG_TRAITS at module load so a new
// flag can't silently fall out of the picker.
const GROUP_DEFS = [
  {
    key: "terrain",
    label: "Terrain & Zones",
    blurb: "Adds or clears features on the battlefield.",
    keys: [
      "wallMaker",
      "bridgeMaker",
      "hazardMaker",
      "trailWall",
      "starWall",
      "anchorZone",
      "disarmZone",
      "crosswindZone",
      "spawnsPods",
      "clearsFireTerrain",
    ],
  },
  {
    key: "spread",
    label: "Blast & Spread",
    blurb: "Reaches past the single target it hit.",
    keys: ["aoeBlast", "coneBlast", "causesChain", "ricochets", "staticMark"],
  },
  {
    key: "impair",
    label: "Impairments",
    blurb: "Debuffs the target on a hit.",
    keys: [
      "causesBlind",
      "causesSnare",
      "causesShock",
      "causesJam",
      "causesFear",
      "causesConfusion",
      "causesDisarm",
      "mindScramble",
      "frictionShift",
    ],
  },
  {
    key: "flight",
    label: "Shot Behavior",
    blurb: "Changes how the bolt travels and connects.",
    keys: ["breaksWalls", "causesKnockback", "piercesWalls", "ultraFast", "uncounterable"],
  },
  {
    key: "multiplier",
    label: "Power Multipliers",
    blurb: "Scales this slug's own damage or clash.",
    keys: ["clashTripled", "damageTripled"],
  },
  {
    key: "support",
    label: "Evasion & Support",
    blurb: "Self- and ally-facing utility.",
    keys: ["causesInvisible", "mirageDecoy", "swapsPosition", "skipsReload", "emotionSurge", "voidsFireClash"],
  },
];

const TRAIT_BY_KEY = Object.fromEntries(SLUG_TRAITS.map((t) => [t.key, t]));

function enrich(key, groupKey) {
  const base = TRAIT_BY_KEY[key];
  if (!base) throw new Error(`slugTraits: unknown trait key "${key}"`);
  return { ...base, icon: TRAIT_ICONS[key] ?? AsteriskIcon, group: groupKey };
}

export const SLUG_TRAIT_GROUPS = GROUP_DEFS.map((g) => ({
  key: g.key,
  label: g.label,
  blurb: g.blurb,
  traits: g.keys.map((k) => enrich(k, g.key)),
}));

// Flat, group-ordered list -- used by SlugToolbar's filter rail.
export const SLUG_TRAIT_LIST = SLUG_TRAIT_GROUPS.flatMap((g) => g.traits);

if (import.meta.env?.DEV) {
  const covered = new Set(SLUG_TRAIT_LIST.map((t) => t.key));
  const missing = SLUG_TRAITS.filter((t) => !covered.has(t.key)).map((t) => t.key);
  if (missing.length) {
    console.warn(`slugTraits: ${missing.length} trait(s) not assigned to a group:`, missing);
  }
}
