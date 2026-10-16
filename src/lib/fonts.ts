import "@fontsource/atkinson-hyperlegible/latin.css";
import "@fontsource/atkinson-hyperlegible/latin-italic.css";
import "@fontsource/atkinson-hyperlegible/latin-ext.css";
import "@fontsource/atkinson-hyperlegible/latin-ext-italic.css";
import "@fontsource-variable/literata/wght.css";
import "@fontsource-variable/literata/wght-italic.css";
import "@fontsource-variable/source-serif-4/wght.css";
import "@fontsource-variable/source-serif-4/wght-italic.css";
import "@fontsource-variable/source-sans-3/wght.css";
import "@fontsource-variable/source-sans-3/wght-italic.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-400-italic.css";
import "@fontsource/ibm-plex-mono/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-700-italic.css";
import "@fontsource/ibm-plex-mono/latin-ext-400.css";
import "@fontsource/ibm-plex-mono/latin-ext-400-italic.css";
import "@fontsource/ibm-plex-mono/latin-ext-700.css";
import "@fontsource/ibm-plex-mono/latin-ext-700-italic.css";
import { isMac, isWindows } from "./platform";

export type FontOs = "mac" | "windows" | "linux";

export type FontGroup = "included" | "system" | FontOs;

export interface FontChoice {
  id: string;
  label: string;
  stack: string;
  group: FontGroup;
}

// Included faces are shipped with the app (SIL Open Font License). The OS
// groups are faces that ship with that system; they are not embedded.
export const FONTS: readonly FontChoice[] = [
  { id: "atkinson", label: "Atkinson Hyperlegible", stack: "'Atkinson Hyperlegible', system-ui, sans-serif", group: "included" },
  { id: "literata", label: "Literata", stack: "'Literata Variable', Georgia, serif", group: "included" },
  { id: "source-serif", label: "Source Serif", stack: "'Source Serif 4 Variable', Georgia, serif", group: "included" },
  { id: "source-sans", label: "Source Sans", stack: "'Source Sans 3 Variable', system-ui, sans-serif", group: "included" },
  { id: "plex-mono", label: "IBM Plex Mono", stack: "'IBM Plex Mono', ui-monospace, monospace", group: "included" },

  { id: "system", label: "System", stack: "system-ui", group: "system" },
  { id: "serif", label: "Serif", stack: "ui-serif, Georgia, serif", group: "system" },
  { id: "mono", label: "Mono", stack: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace", group: "system" },

  { id: "new-york", label: "New York", stack: "'New York', 'Iowan Old Style', Georgia, serif", group: "mac" },
  { id: "iowan", label: "Iowan Old Style", stack: "'Iowan Old Style', Georgia, serif", group: "mac" },
  { id: "charter", label: "Charter", stack: "Charter, Georgia, serif", group: "mac" },
  { id: "baskerville", label: "Baskerville", stack: "Baskerville, Georgia, serif", group: "mac" },
  { id: "palatino", label: "Palatino", stack: "Palatino, Georgia, serif", group: "mac" },
  { id: "georgia-mac", label: "Georgia", stack: "Georgia, serif", group: "mac" },
  { id: "avenir", label: "Avenir Next", stack: "'Avenir Next', Avenir, system-ui, sans-serif", group: "mac" },
  { id: "helvetica", label: "Helvetica Neue", stack: "'Helvetica Neue', Helvetica, Arial, sans-serif", group: "mac" },
  { id: "menlo", label: "Menlo", stack: "Menlo, Monaco, monospace", group: "mac" },

  { id: "sitka", label: "Sitka Text", stack: "'Sitka Text', Cambria, Georgia, serif", group: "windows" },
  { id: "cambria", label: "Cambria", stack: "Cambria, Georgia, serif", group: "windows" },
  { id: "constantia", label: "Constantia", stack: "Constantia, Georgia, serif", group: "windows" },
  { id: "georgia-win", label: "Georgia", stack: "Georgia, serif", group: "windows" },
  { id: "calibri", label: "Calibri", stack: "Calibri, 'Segoe UI', sans-serif", group: "windows" },
  { id: "candara", label: "Candara", stack: "Candara, 'Segoe UI', sans-serif", group: "windows" },
  { id: "segoe", label: "Segoe UI", stack: "'Segoe UI', system-ui, sans-serif", group: "windows" },
  { id: "consolas", label: "Consolas", stack: "Consolas, monospace", group: "windows" },
  { id: "cascadia", label: "Cascadia Mono", stack: "'Cascadia Mono', Consolas, monospace", group: "windows" },

  { id: "noto-serif", label: "Noto Serif", stack: "'Noto Serif', 'Liberation Serif', serif", group: "linux" },
  { id: "noto-sans", label: "Noto Sans", stack: "'Noto Sans', 'Liberation Sans', sans-serif", group: "linux" },
  { id: "liberation-serif", label: "Liberation Serif", stack: "'Liberation Serif', serif", group: "linux" },
  { id: "liberation-sans", label: "Liberation Sans", stack: "'Liberation Sans', sans-serif", group: "linux" },
  { id: "dejavu-serif", label: "DejaVu Serif", stack: "'DejaVu Serif', serif", group: "linux" },
  { id: "dejavu-sans", label: "DejaVu Sans", stack: "'DejaVu Sans', sans-serif", group: "linux" },
  { id: "liberation-mono", label: "Liberation Mono", stack: "'Liberation Mono', 'DejaVu Sans Mono', monospace", group: "linux" },
];

export function currentFontOs(): FontOs {
  if (isMac()) return "mac";
  if (isWindows()) return "windows";
  return "linux";
}

export function fontsForOs(os: FontOs): FontChoice[] {
  return FONTS.filter((font) => font.group === "included" || font.group === "system" || font.group === os);
}
