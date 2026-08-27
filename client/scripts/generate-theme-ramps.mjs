// Regenerates the non-burgundy accent ramps in ../src/theme.js (and the
// matching [data-theme] blocks in ../src/index.css) from burgundy's own
// ramp, so every theme reads as a genuine "wine" variant of its hue instead
// of a flat, neon-prone hue rotation. Run with `node generate-theme-ramps.mjs`
// from this directory; it only prints the values -- paste them in by hand,
// same as server/scripts/generate-default-slug-templates.js does for its
// JSON output.
//
// Why not a plain HSL hue-rotation: HSL's saturation/lightness numbers mean
// wildly different things per hue. The same S/L that reads as a rich,
// moody burgundy reads as neon for green (green's sRGB gamut is far more
// saturated at a given lightness than red's) and gets silently clipped/
// muddied for others. OKLCH's L is *perceptual* lightness, so holding it
// constant across hues keeps every theme equally "dark" to the eye. Chroma
// still needs per-hue scaling for the same reason S did -- so instead of a
// fixed chroma, each step uses the same *fraction of that hue's own sRGB
// gamut ceiling* that burgundy uses of its own ceiling at that step. That
// fraction is burgundy's actual "how saturated does this look" signature;
// reproducing it (not the raw chroma number) in every hue is what makes
// navy/green/purple actually read as wine-deep instead of washed out.

const BURGUNDY_HEX = {
  950: "#1a0509",
  900: "#2b070d",
  800: "#3d0c14",
  700: "#5c121d",
  600: "#7a1826",
  500: "#9c2033",
  400: "#b8324a",
};

// Target hue (OKLCH degrees) for each theme. Picked by eye against the
// computed ramp, not derived -- nudge and re-run if a theme needs to lean
// warmer/cooler.
const THEME_HUES = { navy: 258, green: 152, purple: 310, orange: 55, pink: 355, teal: 200, indigo: 280 };

function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function hexToOklch(hex) {
  const r = srgbToLinear(parseInt(hex.slice(1, 3), 16));
  const g = srgbToLinear(parseInt(hex.slice(3, 5), 16));
  const b = srgbToLinear(parseInt(hex.slice(5, 7), 16));
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return { L: L * 100, C: Math.hypot(A, B) };
}

function oklchToRgbRaw(L, C, H) {
  L /= 100;
  const hRad = (H * Math.PI) / 180;
  const A = C * Math.cos(hRad), B = C * Math.sin(hRad);
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.291485548 * B;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}
function inGamut(L, C, H) {
  return oklchToRgbRaw(L, C, H).every((v) => v * 255 >= -0.3 && v * 255 <= 255.3);
}
function maxChroma(L, H) {
  let lo = 0, hi = 0.4;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(L, mid, H)) lo = mid;
    else hi = mid;
  }
  return lo;
}
function oklchToHex(L, C, H) {
  const toHex = (v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, "0");
  const [r, g, b] = oklchToRgbRaw(L, C, H);
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

const burgundy = Object.fromEntries(Object.entries(BURGUNDY_HEX).map(([k, hex]) => [k, hexToOklch(hex)]));
const burgundyHue = 16; // burgundy's own OKLCH hue is ~15-18 deg across steps; used only to size its headroom fraction below
const fraction = Object.fromEntries(
  Object.entries(burgundy).map(([k, { L, C }]) => [k, C / maxChroma(L, burgundyHue)])
);

for (const [name, hue] of Object.entries(THEME_HUES)) {
  console.log(`${name} (H=${hue}):`);
  for (const [step, { L }] of Object.entries(burgundy)) {
    const C = fraction[step] * maxChroma(L, hue);
    console.log(`  ${step}: ${oklchToHex(L, C, hue)}`);
  }
}
