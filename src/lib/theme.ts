import { writable } from "svelte/store";
import { settings } from "./stores/settings";
import { appearanceTone, isAppearanceId, type AppearanceId, type Theme, type Tone } from "./themes";

export const resolvedTheme = writable<Tone>(initialTone());

const STORAGE_KEY = "mdplus-theme";

function initialTone(): Tone {
  if (typeof document === "undefined") return "light";
  const tone = document.documentElement.getAttribute("data-tone");
  if (tone === "dark" || tone === "light") return tone;
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme && isAppearanceId(theme)) return appearanceTone(theme);
  return "light";
}

function resolveAppearance(theme: Theme): AppearanceId {
  if (theme === "auto") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return isAppearanceId(theme) ? theme : "light";
}

function applyTheme(theme: Theme) {
  const appearance = resolveAppearance(theme);
  const tone = appearanceTone(appearance);
  resolvedTheme.set(tone);
  const root = document.documentElement;
  root.setAttribute("data-theme", appearance);
  root.setAttribute("data-tone", tone);
  // The cached value is the appearance that should paint, never "auto".
  localStorage.setItem(STORAGE_KEY, appearance);
}

// Sets data-theme and data-tone on <html> whenever the theme setting changes.
// The appearance id is cached so app.html can paint it before Rust settings load.
export function initTheme(): () => void {
  let media: MediaQueryList | null = null;
  let mediaListener: (() => void) | null = null;

  function clearMediaListener() {
    if (media && mediaListener) media.removeEventListener("change", mediaListener);
    media = null;
    mediaListener = null;
  }

  const unsubscribe = settings.subscribe(($settings) => {
    applyTheme($settings.theme);
    clearMediaListener();
    if ($settings.theme === "auto") {
      media = window.matchMedia("(prefers-color-scheme: dark)");
      mediaListener = () => applyTheme("auto");
      media.addEventListener("change", mediaListener);
    }
  });

  return () => {
    clearMediaListener();
    unsubscribe();
  };
}
