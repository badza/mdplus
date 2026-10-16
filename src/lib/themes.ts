// Named appearances. `auto` is a setting, not an appearance: it resolves to
// Light or Dark from the system. app.html duplicates this id list so the
// first paint can use the cached theme before Rust settings load.
export type AppearanceId = "light" | "paper" | "fog" | "dark" | "ink" | "moss" | "dusk";

export type Theme = AppearanceId | "auto";

export type Tone = "light" | "dark";

export interface Appearance {
  id: AppearanceId;
  label: string;
  tone: Tone;
  // Swatch colors for the settings picker. They match the theme's paper,
  // ink, and accent so the chip previews the real surface.
  paper: string;
  ink: string;
  accent: string;
}

export const APPEARANCES: readonly Appearance[] = [
  { id: "light", label: "Light", tone: "light", paper: "#ffffff", ink: "#262626", accent: "#e8594f" },
  { id: "paper", label: "Paper", tone: "light", paper: "#fbf7f0", ink: "#3c332b", accent: "#c4553a" },
  { id: "fog", label: "Fog", tone: "light", paper: "#f7f9fb", ink: "#2c343c", accent: "#3e7384" },
  { id: "dark", label: "Dark", tone: "dark", paper: "#1e1e1e", ink: "#e6e6e6", accent: "#ff7a6e" },
  { id: "ink", label: "Ink", tone: "dark", paper: "#1a212a", ink: "#d5dee8", accent: "#8eb8d8" },
  { id: "moss", label: "Moss", tone: "dark", paper: "#1c2520", ink: "#d7e2d8", accent: "#d09268" },
  { id: "dusk", label: "Dusk", tone: "dark", paper: "#261f1b", ink: "#f0e6dc", accent: "#e09278" },
];

const appearanceIds = new Set<string>(APPEARANCES.map((item) => item.id));

export function isAppearanceId(value: string): value is AppearanceId {
  return appearanceIds.has(value);
}

export function appearanceTone(id: AppearanceId): Tone {
  return APPEARANCES.find((item) => item.id === id)?.tone ?? "light";
}

export function normalizeTheme(value: unknown): Theme {
  if (value === "auto") return "auto";
  if (typeof value === "string" && isAppearanceId(value)) return value;
  return "auto";
}
