import { check } from "@tauri-apps/plugin-updater";
import { message } from "@tauri-apps/plugin-dialog";
import { get } from "svelte/store";
import { fill, messages } from "../i18n";

// Checks for an available update and, if one exists, installs it and relaunches.
// The updater plugin is configured in tauri.conf.json (plugins.updater.endpoints +
// pubkey). Until those are pointed at a real release server + signing key, check()
// will either find no endpoint or fail signature verification -- both are surfaced
// to the user as "no update available / couldn't check", never as a crash.
export async function checkForUpdates(): Promise<void> {
  let update;
  try {
    update = await check();
  } catch {
    // No Tauri context (standalone frontend) or the endpoint isn't reachable /
    // isn't configured yet. Don't crash -- just tell the user nothing's available.
    const copy = get(messages);
    await message(copy.updates.failed, {
      title: copy.updates.title,
      kind: "info",
    });
    return;
  }
  const copy = get(messages);
  if (!update) {
    await message(copy.updates.current, { title: copy.updates.title, kind: "info" });
    return;
  }
  const yes = await message(
    fill(copy.updates.available, { version: update.version }),
    { title: copy.updates.availableTitle, kind: "info" },
  );
  if (!yes) return;
  await update.downloadAndInstall();
  await relaunch();
}

async function relaunch(): Promise<void> {
  // Use the process plugin if available; otherwise the updater's install will
  // take effect on next launch. We try the dynamic import so a missing plugin
  // doesn't break the check path above.
  try {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch {
    // No process plugin -- the user will restart manually. The update is installed.
  }
}