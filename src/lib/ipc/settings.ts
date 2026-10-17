import { invoke } from "@tauri-apps/api/core";
import type { Theme } from "../themes";

export type { Theme };

export type ViewMode = "source" | "split" | "preview";

export interface AppSettings {
  theme: Theme;
  fontSize: number;
  fontFamily: string;
  wordWrap: boolean;
  // Write uses the same centered column as Read.
  focusMode: boolean;
  // Write and Split keep marks and blocks as typed text.
  fullMarkdown: boolean;
  autoSave: boolean;
  restoreSession: boolean;
  recentFilesLimit: number;
  viewMode: ViewMode;
  // "system" follows the OS language. Any other value is a catalog id
  // from src/lib/i18n, such as "en".
  locale: string;
}

export async function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_settings");
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke("save_settings", { settings });
}
