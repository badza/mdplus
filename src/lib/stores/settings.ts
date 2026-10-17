import { writable } from "svelte/store";
import { normalizeLocale } from "../i18n/messages";
import { getSettings, saveSettings, type AppSettings, type ViewMode } from "../ipc/settings";
import { normalizeTheme } from "../themes";

export const RECENT_FILES_MIN = 1;
export const RECENT_FILES_MAX = 50;
export const RECENT_FILES_DEFAULT = 15;

const DEFAULT_SETTINGS: AppSettings = {
  theme: "auto",
  fontSize: 14,
  fontFamily: "system-ui",
  wordWrap: true,
  focusMode: false,
  fullMarkdown: false,
  autoSave: false,
  restoreSession: true,
  defaultEncoding: "utf-8",
  recentFilesLimit: RECENT_FILES_DEFAULT,
  viewMode: "source",
  locale: "system",
};

// A stored 0 is not a choice the stepper can make. Treat it as the default.
export function normalizeRecentFilesLimit(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < RECENT_FILES_MIN) return RECENT_FILES_DEFAULT;
  return Math.min(RECENT_FILES_MAX, Math.round(n));
}

export function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeViewMode(value: unknown): ViewMode {
  return value === "split" || value === "preview" || value === "source" ? value : "source";
}

export const settings = writable<AppSettings>(DEFAULT_SETTINGS);

export async function loadSettings(): Promise<void> {
  try {
    const loaded = await getSettings();
    const recentFilesLimit = normalizeRecentFilesLimit(loaded.recentFilesLimit);
    const next = {
      ...loaded,
      theme: normalizeTheme(loaded.theme),
      viewMode: normalizeViewMode(loaded.viewMode),
      focusMode: loaded.focusMode === true,
      fullMarkdown: loaded.fullMarkdown === true,
      locale: normalizeLocale(loaded.locale),
      recentFilesLimit,
    };
    settings.set(next);
    if (recentFilesLimit !== loaded.recentFilesLimit) {
      saveSettings(next).catch(() => {
        // best-effort: the in-memory value is already the corrected limit
      });
    }
  } catch {
    // no Tauri context (e.g. running the frontend standalone) -- keep defaults
  }
}

export function updateSettings(patch: Partial<AppSettings>) {
  settings.update((current) => {
    const next = {
      ...current,
      ...patch,
      recentFilesLimit: normalizeRecentFilesLimit(
        patch.recentFilesLimit !== undefined ? patch.recentFilesLimit : current.recentFilesLimit,
      ),
    };
    saveSettings(next).catch(() => {
      // best-effort: a failed settings write shouldn't interrupt the user
    });
    return next;
  });
}
