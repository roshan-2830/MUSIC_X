/**
 * One palette for the whole app.
 *
 * Why this file exists
 * --------------------
 * Measured 2026-09-09: 918 colour literals across 52 screens and components, and FORTY-SIX
 * of those files declared their own private copy of the palette — `const ACCENT = "#e8ff47"`,
 * again and again. Changing the accent meant editing 46 files, and nothing could switch
 * theme at runtime because every StyleSheet was built from literals at module load.
 *
 * The dark values below are the EXACT values those files already used, so routing everything
 * through here changes nothing on screen. That was the point of doing it as its own step:
 * if a screen looks wrong afterwards, it is this extraction and not a new palette.
 *
 * Why `accent` and `accentFill` are two tokens
 * --------------------------------------------
 * In dark mode they are the same yellow. On a light ground they cannot be: #e8ff47 measures
 * 1.12:1 against white, which is invisible. So the yellow survives as a FILL with dark ink
 * on top (16.96:1, unchanged), and text, icons and scores take a deep olive of the same hue
 * family (#5f6f00, 5.38:1). One identity, two grounds.
 *
 * Every light value below was contrast-checked against its own ground, not assumed:
 *   text #14140f 17.81:1 · text2 #3c3d34 10.60:1 · text3 #5b5d51 6.47:1 · muted #6e7164 4.81:1
 */

export type Theme = {
  mode: "dark" | "light";

  // grounds, back to front
  bg: string;
  panel: string;
  panel2: string;
  panel3: string;

  // hairlines and dividers, lightest to strongest
  line: string;
  line2: string;
  line3: string;
  outline: string;
  outline2: string;

  // type, strongest to weakest
  text: string;
  text2: string;
  text3: string;
  muted: string;
  faint: string;
  faint2: string;

  // the brand
  accent: string;        // text, icons, scores — the readable one
  accentFill: string;    // buttons, selected pills, chips — the yellow
  accentInk: string;     // type ON accentFill
  accentTint12: string;  // barely-there wash behind a highlighted row
  accentTint14: string;
  accentTint35: string;
  accentTint60: string;

  // meaning, not decoration
  danger: string;        // cancelled, destructive
  danger2: string;
  success: string;
  warn: string;
  festival: string;      // festivals are amber everywhere in this app

  shadow: string;        // what a raised surface casts
  dangerSoft: string;    // danger as body text, where full strength shouts

  // over-content veils
  scrim: string;
  scrim2: string;
};

export const dark: Theme = {
  mode: "dark",

  bg: "#0b0b0f",
  panel: "#14141b",
  panel2: "#1b1b24",
  panel3: "#23232c",

  line: "#26262f",
  line2: "#1c1c24",
  line3: "#2b2b36",
  outline: "#3a3a46",
  outline2: "#4a4a55",

  text: "#f4f4f6",
  text2: "#d6d6de",
  text3: "#c8c8d0",
  muted: "#9a9aa6",
  faint: "#5a5a66",
  faint2: "#6c6c78",

  accent: "#e8ff47",
  accentFill: "#e8ff47",
  accentInk: "#101204",
  accentTint12: "rgba(232,255,71,0.12)",
  accentTint14: "rgba(232,255,71,0.14)",
  accentTint35: "rgba(232,255,71,0.35)",
  accentTint60: "rgba(232,255,71,0.6)",

  danger: "#ff6b6b",
  danger2: "#ff7a6b",
  success: "#7ef0b2",
  warn: "#f0d47e",
  festival: "#ffb200",

  shadow: "#000000",
  dangerSoft: "#ff9b9b",

  scrim: "rgba(0,0,0,0.6)",
  scrim2: "rgba(0,0,0,0.5)",
};

export const light: Theme = {
  mode: "light",

  // An off-white biased a few degrees toward the accent's hue rather than a flat #fff, so
  // the yellow sits on it as though they belong to the same world.
  bg: "#fbfbf7",
  panel: "#ffffff",
  panel2: "#f4f4ee",
  panel3: "#ebebe3",

  line: "#e0e0d6",
  line2: "#eeeee6",
  line3: "#d6d6ca",
  outline: "#c9cabd",
  outline2: "#b6b7a8",

  text: "#14140f",
  text2: "#3c3d34",
  text3: "#5b5d51",
  muted: "#6e7164",
  faint: "#9a9c90",
  faint2: "#868876",

  accent: "#5f6f00",
  accentFill: "#e8ff47",
  accentInk: "#101204",
  // Tints have to be stronger on a light ground: the same 12% yellow that reads as a glow
  // on near-black is invisible on off-white.
  accentTint12: "rgba(95,111,0,0.10)",
  accentTint14: "rgba(95,111,0,0.13)",
  accentTint35: "rgba(95,111,0,0.28)",
  accentTint60: "rgba(95,111,0,0.5)",

  // Darkened so they carry on white. #ff6b6b measures 2.5:1 on this ground and would fail
  // as text; a cancellation is the last thing that should be hard to read.
  danger: "#c02a2a",
  danger2: "#c53a2c",
  success: "#137a4d",
  warn: "#8a6a00",
  festival: "#a55f00",

  // A pure-black shadow on an off-white ground reads as dirt; this is the ground's own
  // hue taken darker, which is how paper actually shades.
  shadow: "#5b5d51",
  dangerSoft: "#a8332c",

  scrim: "rgba(0,0,0,0.35)",
  scrim2: "rgba(0,0,0,0.25)",
};

export const THEMES = { dark, light } as const;
export type ThemeName = "system" | "dark" | "light";

/**
 * A token at partial strength.
 *
 * The app is full of accent washes and hairlines — a 50% ring on today's date, an 8% glow
 * behind the next show, a 5% white lift on a day that has something on it. Hardcoding those
 * as rgba() literals is what made them theme-blind: `rgba(255,255,255,0.05)` is a subtle
 * lift on near-black and an invisible nothing on off-white.
 *
 * Written as a function of a TOKEN rather than of a literal, so the same call gives yellow
 * at 50% in dark and olive at 50% in light without the caller thinking about it.
 */
export function alpha(color: string, a: number): string {
  const h = color.trim();
  if (h.startsWith("rgba(") || h.startsWith("rgb(")) return h;   // already has its own alpha
  const hex = h.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const n = parseInt(full.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
