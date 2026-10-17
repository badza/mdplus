import { writable, get } from "svelte/store";
import { tabs, activeTabId, addTab, editorStates, openSettingsTab, setFileMeta } from "./documents";
import { createDocState } from "../editor/cmSetup";
import { readFile } from "../ipc/fs";
import { loadSession, saveSession, type SessionState, type TabState } from "../ipc/session";
import { fileName } from "../path";
import { restoredActiveId } from "../restoreActive";
import { RECENT_FILES_MAX } from "./settings";

export const recentFiles = writable<string[]>([]);

export function addRecentFile(path: string) {
  recentFiles.update((list) => [path, ...list.filter((p) => p !== path)].slice(0, RECENT_FILES_MAX));
}

function currentSessionState(): SessionState {
  const tabList = get(tabs);
  const activeId = get(activeTabId);
  const openTabs: TabState[] = tabList.map((t) => {
    const cursor = editorStates.get(t.id)?.selection.main.head ?? 0;
    // For untitled tabs, persist the current document text into the session so
    // a crash recovery restore can recreate the buffer without a separate read.
    // File-backed tabs don't need it -- their content is re-read from disk.
    const settingsTab = t.kind === "settings";
    const content = !settingsTab && t.path === null ? editorStates.get(t.id)?.doc.toString() ?? null : null;
    return {
      id: t.id,
      title: t.title,
      localPath: settingsTab ? null : t.path,
      scratchId: settingsTab ? null : t.scratchId,
      sourceUrl: settingsTab ? null : t.sourceUrl,
      content,
      dirty: settingsTab ? false : t.isDirty,
      isDeleted: t.isDeleted ?? false,
      cursor,
      scrollPosition: null,
      kind: settingsTab ? "settings" : "document",
    };
  });
  const activeIndex = tabList.findIndex((t) => t.id === activeId);
  return {
    openTabs,
    activeIndex: activeIndex >= 0 ? activeIndex : null,
    recentFiles: get(recentFiles),
  };
}

export function persistSessionNow() {
  return saveSession(currentSessionState()).catch(() => {
    // best-effort: a failed session write shouldn't interrupt the user
  });
}

export async function restoreSession(): Promise<boolean> {
  let session: SessionState;
  try {
    session = await loadSession();
  } catch {
    return false;
  }

  recentFiles.set((session.recentFiles ?? []).slice(0, RECENT_FILES_MAX));

  const opened: { index: number; id: string }[] = [];
  for (let i = 0; i < session.openTabs.length; i++) {
    const tab = session.openTabs[i];
    try {
      let id: string;
      if (tab.kind === "settings") {
        id = openSettingsTab();
      } else if (tab.localPath !== null) {
        // File-backed tab: re-read content from disk. Capture mtime+size as the
        // stale-write baseline so a later save can detect external changes.
        const { content, meta } = await readFile(tab.localPath);
        id = addTab(
          { path: tab.localPath, title: fileName(tab.localPath) },
          createDocState(content, tab.cursor),
        );
        // Stash the baseline on the tab so handleSave can compare before writing.
        setFileMeta(id, meta);
      } else {
        // Untitled/scratch tab: content was persisted inline in the session.
        const content = tab.content ?? "";
        id = addTab(
          { path: null, title: tab.title, scratchId: tab.scratchId, sourceUrl: tab.sourceUrl ?? null },
          createDocState(content, tab.cursor),
        );
      }
      opened.push({ index: i, id });
    } catch {
      // file may have moved or been deleted since the last session -- skip it
    }
  }
  const activeId = restoredActiveId(opened, session.activeIndex ?? null);
  if (!activeId) return false;
  activeTabId.set(activeId);
  return true;
}
