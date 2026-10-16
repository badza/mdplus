// Single import surface over the app's in-memory state, aggregating the split
// documents/session/settings stores. The split itself is deliberate (see documents.ts
// and session.ts) -- this file exists so callers can import one module instead of three.
export { tabs, activeTabId, type TabMeta } from "./documents";
export { recentFiles } from "./session";
export { settings, loadSettings, updateSettings } from "./settings";
