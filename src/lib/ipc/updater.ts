import { check } from "@tauri-apps/plugin-updater";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { get } from "svelte/store";
import { fill, messages } from "../i18n";

// The endpoint and signing pubkey live in tauri.conf.json. A missing release,
// a failed download, or no Tauri context (standalone frontend) is a dialog, not a crash.
export async function checkForUpdates(): Promise<void> {
  const copy = get(messages);
  let update;
  try {
    update = await check();
  } catch {
    await message(copy.updates.failed, {
      title: copy.updates.title,
      kind: "info",
    });
    return;
  }
  if (!update) {
    await message(copy.updates.current, { title: copy.updates.title, kind: "info" });
    return;
  }
  const yes = await ask(fill(copy.updates.available, { version: update.version }), {
    title: copy.updates.availableTitle,
    kind: "info",
  });
  if (!yes) return;
  try {
    await update.downloadAndInstall();
    await relaunch();
  } catch {
    await message(copy.updates.failed, {
      title: copy.updates.title,
      kind: "error",
    });
  }
}
