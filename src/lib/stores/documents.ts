import { writable, get } from "svelte/store";
import type { EditorState, Text } from "@codemirror/state";
import { createDocState } from "../editor/cmSetup";
import { messages } from "../i18n";
import type { FileMeta } from "../ipc/fs";

export type { FileMeta };

export interface TabMeta {
  id: string;
  path: string | null;
  scratchId: string | null;
  // Set when the note was opened from a URL. The text lives in the scratch
  // buffer; this is the link we show and use for relative images.
  sourceUrl: string | null;
  title: string;
  isDirty: boolean;
  isDeleted?: boolean;
  // Settings is one editor tab, like VS Code. It has no document and no dirty state.
  kind?: "document" | "settings";
}

export const tabs = writable<TabMeta[]>([]);
export const activeTabId = writable<string | null>(null);

// Document content/selection/undo-history lives in CodeMirror's own EditorState,
// not in a Svelte store — no need for it to be reactive, and duplicating it
// into a store would double memory and require syncing on every keystroke.
export const editorStates = new Map<string, EditorState>();
const savedDocs = new Map<string, Text>();

// Stale-write baseline: the mtime+size of each file-backed tab's on-disk file as of
// the last open/save. Compared against a fresh stat before every save so a save can't
// silently clobber external changes (git pull, Dropbox, another editor). Untitled
// tabs have no entry (no file to stat).
const fileMetaByTab = new Map<string, FileMeta>();

export function setFileMeta(id: string, meta: FileMeta): void {
  fileMetaByTab.set(id, meta);
}

export function getFileMeta(id: string): FileMeta | null {
  return fileMetaByTab.get(id) ?? null;
}

export function clearFileMeta(id: string): void {
  fileMetaByTab.delete(id);
}

let nextId = 1;

export function addTab(
  meta: { path: string | null; title: string; scratchId?: string | null; sourceUrl?: string | null },
  state: EditorState,
): string {
  const id = `tab-${nextId++}`;
  editorStates.set(id, state);
  savedDocs.set(id, state.doc);
  tabs.update((list) => [
    ...list,
    {
      path: meta.path,
      scratchId: meta.scratchId ?? null,
      sourceUrl: meta.sourceUrl ?? null,
      title: meta.title,
      id,
      isDirty: false,
      isDeleted: false,
    },
  ]);
  activeTabId.set(id);
  return id;
}

// One Settings tab. Opening it again focuses the tab that is already there.
export function openSettingsTab(): string {
  const existing = get(tabs).find((tab) => tab.kind === "settings");
  if (existing) {
    activeTabId.set(existing.id);
    return existing.id;
  }
  const id = `tab-${nextId++}`;
  tabs.update((list) => [
    ...list,
    {
      id,
      path: null,
      scratchId: null,
      sourceUrl: null,
      title: get(messages).tabs.settings,
      isDirty: false,
      kind: "settings",
    },
  ]);
  activeTabId.set(id);
  return id;
}

export function reorderTabs(fromId: string, toId: string, side: "before" | "after" = "before") {
  if (fromId === toId) return;
  tabs.update((list) => {
    const fromIdx = list.findIndex((t) => t.id === fromId);
    if (fromIdx === -1) return list;
    // Compute the target index against the list *with the dragged tab removed* --
    // otherwise a leftward move shifts the target by one and lands the tab on
    // the wrong side of the cursor.
    const withoutMoved = [...list];
    withoutMoved.splice(fromIdx, 1);
    const toIdx = withoutMoved.findIndex((t) => t.id === toId);
    if (toIdx === -1) return list;
    const insertAt = side === "after" ? toIdx + 1 : toIdx;
    const [moved] = list.splice(fromIdx, 1);
    withoutMoved.splice(insertAt, 0, moved);
    return withoutMoved;
  });
}

export function reorderTabToEnd(fromId: string) {
  tabs.update((list) => {
    const fromIdx = list.findIndex((t) => t.id === fromId);
    if (fromIdx === -1 || fromIdx === list.length - 1) return list;
    const next = [...list];
    const [moved] = next.splice(fromIdx, 1);
    next.push(moved);
    return next;
  });
}

export function closeTab(id: string) {
  const list = get(tabs);
  const idx = list.findIndex((t) => t.id === id);
  if (idx === -1) return;

  // Capture the tab's live state for Reopen Closed Tab (⌘⇧T) *before* we drop the
  // EditorState. This is a no-op for the stack cap if the user never reopens, but
  // it's the only way to undo the four "Close Others/Left/Right/All" destructive
  // menu actions the reviewer flagged as having no undo.
  const tabMeta = list[idx];
  if (tabMeta.kind !== "settings") pushClosedTab(id, tabMeta);

  editorStates.delete(id);
  savedDocs.delete(id);
  fileMetaByTab.delete(id);
  const next = list.filter((t) => t.id !== id);
  tabs.set(next);

  activeTabId.update((current) => {
    if (current !== id) return current;
    if (next.length === 0) return null;
    return next[Math.min(idx, next.length - 1)].id;
  });
}

export function markSaved(id: string, path: string, doc: Text) {
  savedDocs.set(id, doc);
  const title = path.split("/").pop() ?? path;
  // Once a tab has a path, it's file-backed -- its scratch buffer (if any) is now
  // redundant. Caller is responsible for deleteScratch() before this call; we just
  // clear the id so future session saves don't try to write a scratch file for it.
  tabs.update((list) =>
    list.map((t) =>
      t.id === id ? { ...t, path, title, isDirty: false, scratchId: null, sourceUrl: null } : t,
    ),
  );
}

export function updateDirty(id: string, doc: Text) {
  const saved = savedDocs.get(id);
  // Undo and hand-edited reverts build a new Text with the same characters.
  // Reference equality would leave the tab dirty after the text is back.
  const isDirty = saved ? !saved.eq(doc) : false;
  tabs.update((list) =>
    list.map((t) => (t.id === id && t.isDirty !== isDirty ? { ...t, isDirty } : t)),
  );
}

// --- Reopen Closed Tab (⌘⇧T) ---------------------------------------------
// A bounded stack of recently-closed tabs, each carrying enough state to recreate
// the tab at close time: path (or scratchId for untitled), title, content, cursor,
// dirty flag, and the file-backed stale-write baseline. Cap is generous (20) since
// each entry is just a content string + a few scalars; the EditorState itself is
// rebuilt from `content` on reopen so we don't pin a live CM state per closed tab.
export interface ClosedTab {
  path: string | null;
  scratchId: string | null;
  sourceUrl: string | null;
  title: string;
  content: string;
  cursor: number;
  isDirty: boolean;
  fileMeta: FileMeta | null;
}

const CLOSED_TAB_CAP = 20;
export const closedTabs = writable<ClosedTab[]>([]);

// Captures the live state of a tab right before it's destroyed so reopenClosedTab
// can bring it back. Called from closeTab below.
function pushClosedTab(id: string, meta: TabMeta): void {
  const state = editorStates.get(id);
  const content = state?.doc.toString() ?? "";
  const cursor = state?.selection.main.head ?? 0;
  const fileMeta = fileMetaByTab.get(id) ?? null;
  closedTabs.update((list) => {
    const next = [
      {
        path: meta.path,
        scratchId: meta.scratchId,
        sourceUrl: meta.sourceUrl,
        title: meta.title,
        content,
        cursor,
        isDirty: meta.isDirty,
        fileMeta,
      },
      ...list,
    ];
    return next.slice(0, CLOSED_TAB_CAP);
  });
}

// Pops the most-recently-closed tab and recreates it. Returns the new tab id, or
// null if the stack is empty. The reopened tab becomes active. Untitled tabs get
// their scratchId back (their scratch file is still on disk from close time);
// file-backed dirty tabs are restored with the in-memory content captured at close
// so unsaved edits survive the reopen. File-backed *clean* tabs are also restored
// from the captured content (it equals what was on disk at close time).
export function reopenClosedTab(): string | null {
  const stack = get(closedTabs);
  if (stack.length === 0) return null;
  const [closed, ...rest] = stack;
  closedTabs.set(rest);
  const state = createDocState(closed.content, closed.cursor);
  const id = addTab(
    { path: closed.path, title: closed.title, scratchId: closed.scratchId, sourceUrl: closed.sourceUrl },
    state,
  );
  // Restore the dirty flag (addTab sets it to false) and the stale-write baseline.
  if (closed.isDirty) {
    tabs.update((list) => list.map((t) => (t.id === id ? { ...t, isDirty: true } : t)));
  }
  if (closed.fileMeta) setFileMeta(id, closed.fileMeta);
  return id;
}
