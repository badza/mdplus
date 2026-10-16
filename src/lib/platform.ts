// Windows keeps its native title bar (see src-tauri/tauri.windows.conf.json, which sets
// decorations: true there) -- our custom TitleBar is only for platforms where we've
// turned native decorations off, so it must not render alongside real native chrome.

// Platform detection: navigator.userAgent is set by the WebView on all platforms.
// On macOS Tauri uses WKWebView (Safari UA), on Windows WebView2 (Edge UA), on
// Linux the WebKitGTK UA. We sniff for "Windows"/"Mac" rather than relying on a
// Tauri-injected global so this also works when the frontend is run standalone
// (npm run dev in a browser).
export function isWindows(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("windows");
}

export function isMac(): boolean {
  return typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
}

// The modifier symbol used in shortcut *labels* shown in the UI (⌘ on macOS, Ctrl
// elsewhere). The native app menu uses Tauri's "CmdOrCtrl+" accelerator which the
// runtime resolves itself; these helpers are for the in-app strings (empty-state
// hint, command palette, tab tooltips) that bypass the native menu and would
// otherwise hardcode ⌘ — see the reviewer's "⌘O on non-Mac chrome" finding.
export const modKey = isMac() ? "⌘" : "Ctrl";

// Format a shortcut label from a list of keys, prefixing the platform modifier
// when `withMod` is true. Example: shortcut(["Shift", "T"], true) -> "⌘⇧T" on
// macOS, "Ctrl+Shift+T" elsewhere. Plain keys (Enter, Esc) pass withMod=false.
export function shortcut(keys: string[], withMod = true): string {
  const sep = isMac() ? "" : "+";
  const parts = withMod ? [modKey, ...keys] : keys;
  return parts.join(sep);
}
