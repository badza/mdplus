import { invoke } from "@tauri-apps/api/core";

// Mirrors src-tauri/src/models/tab.rs::TabState. `localPath` is null for untitled
// tabs (whose content is persisted to a scratch file keyed by `scratchId`); `content`
// is only populated for untitled tabs so a crashed session restores their text.
export interface TabState {
  id: string;
  title: string;
  localPath: string | null;
  scratchId: string | null;
  // Present when the note was opened from a URL. Older sessions omit it.
  sourceUrl?: string | null;
  content: string | null;
  dirty: boolean;
  isDeleted: boolean;
  cursor: number;
  scrollPosition: number | null;
  kind?: "document" | "settings";
}

export interface SessionState {
  openTabs: TabState[];
  activeIndex: number | null;
  recentFiles: string[];
}

export async function loadSession(): Promise<SessionState> {
  return invoke<SessionState>("load_session");
}

export async function saveSession(session: SessionState): Promise<void> {
  return invoke("save_session", { session });
}
