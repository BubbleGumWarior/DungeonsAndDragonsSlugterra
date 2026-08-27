// Shared source of truth for the app's accent themes -- black and gold never
// move, only the --maroon-* ramp rotates hue (see index.css's [data-theme]
// blocks, which hold the CSS-side copy of these exact values). Settings.jsx
// renders THEMES as live-preview swatches; applyTheme() flips the attribute
// those CSS blocks key off of.
//
// Every ramp below shares burgundy's exact OKLCH lightness at each step, and
// its chroma at each step is the same *fraction of that hue's own sRGB gamut
// ceiling* that burgundy uses of its own ceiling. Plain HSL hue-rotation
// (an earlier pass here) does neither: same numeric saturation/lightness
// reads as neon for green and muddy/clipped for others, because each hue's
// gamut and perceived richness at a given lightness are wildly different.
// Matching the *fraction of headroom* instead is what actually reproduces
// burgundy's "wine" quality -- deep, dense, never washed out or neon -- in
// every other hue. Generated once via ../scripts/generate-theme-ramps.mjs;
// re-run that script if the target hues or burgundy's own ramp ever change.
export const THEMES = [
  {
    id: "burgundy",
    label: "Burgundy",
    description: "The original deep wine red.",
    ramp: {
      950: "#1a0509",
      900: "#2b070d",
      800: "#3d0c14",
      700: "#5c121d",
      600: "#7a1826",
      500: "#9c2033",
      400: "#b8324a",
    },
  },
  {
    id: "navy",
    label: "Navy",
    description: "The same wine depth, in midnight blue.",
    ramp: {
      950: "#040c1c",
      900: "#05152e",
      800: "#081f41",
      700: "#0d3062",
      600: "#114182",
      500: "#1854a7",
      400: "#2868c4",
    },
  },
  {
    id: "green",
    label: "Verdant",
    description: "The same wine depth, in bottle green.",
    ramp: {
      950: "#041007",
      900: "#061b0c",
      800: "#0a2714",
      700: "#103c20",
      600: "#15502b",
      500: "#1c6739",
      400: "#2e7d4a",
    },
  },
  {
    id: "purple",
    label: "Royal Purple",
    description: "The same wine depth, in royal purple.",
    ramp: {
      950: "#13061c",
      900: "#20082e",
      800: "#2e0d41",
      700: "#461363",
      600: "#5e1a83",
      500: "#7922a8",
      400: "#9035c5",
    },
  },
  {
    id: "orange",
    label: "Dark Orange",
    description: "The same wine depth, in burnt orange.",
    ramp: {
      950: "#150a04",
      900: "#221105",
      800: "#311a08",
      700: "#4b280d",
      600: "#643611",
      500: "#804618",
      400: "#995928",
    },
  },
  {
    id: "pink",
    label: "Dark Pink",
    description: "The same wine depth, in deep rose pink.",
    ramp: {
      950: "#19050d",
      900: "#290717",
      800: "#3b0c22",
      700: "#591135",
      600: "#751747",
      500: "#961f5c",
      400: "#b23170",
    },
  },
  {
    id: "teal",
    label: "Deep Teal",
    description: "The same wine depth, in cold oceanic teal.",
    ramp: {
      950: "#040f0f",
      900: "#06191a",
      800: "#0a2526",
      700: "#10393b",
      600: "#154c4f",
      500: "#1c6266",
      400: "#2e787b",
    },
  },
  {
    id: "indigo",
    label: "Indigo",
    description: "The same wine depth, in electric blue-violet.",
    ramp: {
      950: "#090725",
      900: "#110b3c",
      800: "#1a1154",
      700: "#2a187f",
      600: "#3920a8",
      500: "#4b29d6",
      400: "#5b4de3",
    },
  },
];

const THEME_IDS = new Set(THEMES.map((t) => t.id));
export const DEFAULT_THEME = "burgundy";

export function applyTheme(themeId) {
  const next = THEME_IDS.has(themeId) ? themeId : DEFAULT_THEME;
  document.documentElement.setAttribute("data-theme", next);
}

// Read the last-known theme straight out of localStorage, synchronously,
// before React ever mounts -- so a page refresh repaints in the user's
// chosen color immediately instead of flashing burgundy for a frame.
export function applyStoredTheme() {
  try {
    const stored = localStorage.getItem("user");
    const user = stored ? JSON.parse(stored) : null;
    applyTheme(user?.theme);
  } catch {
    applyTheme(DEFAULT_THEME);
  }
}
