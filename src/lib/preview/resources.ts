import { convertFileSrc } from "@tauri-apps/api/core";

// Turn a markdown image URL into something the webview can load. Remote and
// data URLs pass through. A relative path is resolved against the open file
// and handed to Tauri's asset protocol (enabled in tauri.conf.json).
export function resolveResourceUrl(src: string, documentPath: string | null): string {
  const trimmed = src.trim();
  if (!trimmed || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(trimmed)) return trimmed;
  if (!documentPath) return trimmed;
  // A note opened from a URL resolves ./pic.png against that link.
  if (/^https?:\/\//i.test(documentPath)) {
    try {
      return new URL(trimmed, documentPath).href;
    } catch {
      return trimmed;
    }
  }
  const absolute = joinRelative(documentPath, trimmed);
  try {
    return convertFileSrc(absolute);
  } catch {
    return trimmed;
  }
}

function joinRelative(documentPath: string, rel: string): string {
  const slash = documentPath.includes("\\") ? "\\" : "/";
  if (rel.startsWith("/") || rel.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(rel)) return rel;
  const dirEnd = documentPath.lastIndexOf(slash);
  const dir = dirEnd >= 0 ? documentPath.slice(0, dirEnd) : "";
  const base = dir.split(slash).filter((part) => part.length > 0);
  for (const part of rel.split(/[\\/]/)) {
    if (!part || part === ".") continue;
    if (part === "..") base.pop();
    else base.push(part);
  }
  const prefix = documentPath.startsWith(slash) ? slash : "";
  return prefix + base.join(slash);
}
