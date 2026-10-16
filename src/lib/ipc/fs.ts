import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { get } from "svelte/store";
import { messages } from "../i18n";

function markdownFilter() {
  return [{ name: get(messages).files.markdown, extensions: ["md", "markdown"] }];
}

export interface FileMeta {
  mtimeMs: number;
  size: number;
  // Encoding preservation (see src-tauri/src/services/encoding.rs). The editor
  // works in normalized LF/no-BOM; these fields are echoed back on save so the
  // on-disk file keeps its original line endings, BOM, and trailing-newline state.
  lineEnding: "lf" | "crlf";
  hasBom: boolean;
  hasTrailingNewline: boolean;
}

export interface OpenFileResult {
  content: string;
  meta: FileMeta;
}

export async function pickFileToOpen(): Promise<string | null> {
  const result = await open({ multiple: false, filters: markdownFilter() });
  return typeof result === "string" ? result : null;
}

export async function pickFilesToOpen(): Promise<string[]> {
  const result = await open({ multiple: true, filters: markdownFilter() });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

// Routed through Rust commands (not @tauri-apps/plugin-fs directly) so saves can be
// atomic (temp file + fsync + rename) and open can return mtime+size for stale-write
// protection -- see src-tauri/src/commands/file.rs.
export async function readFile(path: string): Promise<OpenFileResult> {
  return invoke<OpenFileResult>("open_file_path", { path });
}

export async function writeFile(path: string, content: string, meta: FileMeta): Promise<void> {
  return invoke("save_file", {
    path,
    content,
    lineEnding: meta.lineEnding,
    hasBom: meta.hasBom,
    hasTrailingNewline: meta.hasTrailingNewline,
  });
}

// Stale-write protection: returns the file's current mtime+size so the caller can
// compare against the baseline captured at open/save. A mismatch means the file
// changed on disk and a save would clobber external changes.
export async function statFile(path: string): Promise<FileMeta> {
  return invoke<FileMeta>("stat_file", { path });
}

export async function pickSavePath(): Promise<string | null> {
  return save({ filters: markdownFilter(), defaultPath: "untitled.md" });
}

// Scratch buffers (untitled tabs) — persisted to app_config_dir/scratch/<id> so a
// crash or accidental "discard" can't silently destroy what the user typed.
// See src-tauri/src/commands/file.rs.
export async function saveScratch(id: string, content: string): Promise<void> {
  return invoke("save_scratch", { id, content });
}

export async function loadScratch(id: string): Promise<string | null> {
  return invoke<string | null>("load_scratch", { id });
}

export async function deleteScratch(id: string): Promise<void> {
  return invoke("delete_scratch", { id });
}
