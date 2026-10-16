import { invoke } from "@tauri-apps/api/core";
import { fill } from "../i18n";
import type { Messages } from "../i18n/messages";

export interface FetchedNote {
  content: string;
  title: string;
  url: string;
}

export async function fetchMarkdownUrl(url: string): Promise<FetchedNote> {
  return invoke<FetchedNote>("fetch_markdown_url", { url });
}

// Rust returns a short code (`page`, `status:404`, …) so the wording can
// follow the active language.
export function remoteErrorText(err: unknown, copy: Messages): string {
  const code = errorCode(err);
  const open = copy.openUrl;
  if (code === "empty") return open.empty;
  if (code === "scheme") return open.scheme;
  if (code === "page") return open.page;
  if (code === "large") return open.large;
  if (code === "missing") return open.missing;
  if (code.startsWith("status:")) return fill(open.status, { status: code.slice("status:".length) });
  return open.network;
}

function errorCode(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  return "network";
}
