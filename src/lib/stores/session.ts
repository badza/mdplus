import { writable, get } from "svelte/store";
import { tabs, activeTabId, addTab, editorStates, openSettingsTab, setFileMeta } from "./documents";
import { createDocState } from "../editor/cmSetup";
import { readFile } from "../ipc/fs";
import { loadSession, saveSession, type SessionState, type TabState } from "../ipc/session";
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

  const restoredIds: string[] = [];
  for (const tab of session.openTabs) {
    try {
      if (tab.kind === "settings") {
        restoredIds.push(openSettingsTab());
        continue;
      }
      if (tab.localPath !== null) {
        // File-backed tab: re-read content from disk. Capture mtime+size as the
        // stale-write baseline so a later save can detect external changes.
        const { content, meta } = await readFile(tab.localPath);
        const title = tab.localPath.split("/").pop() ?? tab.localPath;
        const id = addTab(
          { path: tab.localPath, title },
          createDocState(content, tab.cursor),
        );
        // Stash the baseline on the tab so handleSave can compare before writing.
        // We import editorStates is already there; we set the meta via a side-channel
        // export on documents.ts (fileMetaByTab) to avoid plumbing a new prop through addTab.
        setFileMeta(id, meta);
        restoredIds.push(id);
      } else {
        // Untitled/scratch tab: content was persisted inline in the session.
        const content = tab.content ?? "";
        const id = addTab(
          { path: null, title: tab.title, scratchId: tab.scratchId, sourceUrl: tab.sourceUrl ?? null },
          createDocState(content, tab.cursor),
        );
        restoredIds.push(id);
      }
    } catch {
      // file may have moved or been deleted since the last session -- skip it
    }
  }
  if (restoredIds.length === 0) return false;

  const activeIdx = session.activeIndex ?? 0;
  activeTabId.set(restoredIds[activeIdx] ?? restoredIds[0]);
  return true;
}
