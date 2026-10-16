// Opens http(s) and mailto links in the system handler. The Tauri shell
// plugin is preferred; a plain browser tab is the fallback when the frontend
// is running outside the desktop shell.
export async function openExternal(url: string): Promise<void> {
  try {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
    return;
  } catch {
    // No Tauri shell plugin here.
  }
  window.open(url, "_blank", "noopener");
}
