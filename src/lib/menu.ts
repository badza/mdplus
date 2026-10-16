import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { HANDOFF_AGENTS } from "./handoff";
import type { Messages } from "./i18n/messages";
import type { ViewMode } from "./ipc/settings";

export interface MenuHandlers {
  newTab: () => void;
  open: () => void;
  openUrl: () => void;
  save: () => void;
  saveAs: () => void;
  closeTab: () => void;
  reopenTab: () => void;
  quit: () => void;
  openRecent: (path: string) => void;
  openSettings: () => void;
  openPalette: () => void;
  checkForUpdates: () => void;
  setViewMode: (mode: ViewMode) => void;
  handoff: (agentId: string) => void;
}

export interface MenuState {
  recentFiles: string[];
  viewMode: ViewMode;
  messages: Messages;
  handoffEnabled: boolean;
}

export async function buildAndSetAppMenu(handlers: MenuHandlers, state: MenuState) {
  const copy = state.messages;
  const recentItems =
    state.recentFiles.length > 0
      ? await Promise.all(
          state.recentFiles.map((path) => MenuItem.new({ text: path, action: () => handlers.openRecent(path) })),
        )
      : [await MenuItem.new({ text: copy.menu.noRecent, enabled: false })];

  const recentSubmenu = await Submenu.new({ text: copy.menu.openRecent, items: recentItems });

  const handoffItems = await Promise.all(
    HANDOFF_AGENTS.map((agent) =>
      MenuItem.new({
        text: agent.label,
        enabled: state.handoffEnabled,
        action: () => handlers.handoff(agent.id),
      }),
    ),
  );
  const handoffSubmenu = await Submenu.new({ text: copy.menu.handoff, items: handoffItems });

  const fileMenu = await Submenu.new({
    text: copy.menu.file,
    items: [
      await MenuItem.new({ text: copy.menu.newTab, accelerator: "CmdOrCtrl+N", action: handlers.newTab }),
      await MenuItem.new({ text: copy.menu.open, accelerator: "CmdOrCtrl+O", action: handlers.open }),
      await MenuItem.new({
        text: copy.menu.openUrl,
        accelerator: "CmdOrCtrl+Shift+O",
        action: handlers.openUrl,
      }),
      recentSubmenu,
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({ text: copy.menu.save, accelerator: "CmdOrCtrl+S", action: handlers.save }),
      await MenuItem.new({ text: copy.menu.saveAs, accelerator: "CmdOrCtrl+Shift+S", action: handlers.saveAs }),
      handoffSubmenu,
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({ text: copy.menu.closeTab, accelerator: "CmdOrCtrl+W", action: handlers.closeTab }),
      await MenuItem.new({ text: copy.menu.reopenTab, accelerator: "CmdOrCtrl+Shift+T", action: handlers.reopenTab }),
    ],
  });

  const editMenu = await Submenu.new({
    text: copy.menu.edit,
    items: [
      await PredefinedMenuItem.new({ item: "Undo" }),
      await PredefinedMenuItem.new({ item: "Redo" }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Cut" }),
      await PredefinedMenuItem.new({ item: "Copy" }),
      await PredefinedMenuItem.new({ item: "Paste" }),
      await PredefinedMenuItem.new({ item: "SelectAll" }),
    ],
  });

  const viewMenu = await Submenu.new({
    text: copy.menu.view,
    items: [
      await CheckMenuItem.new({
        text: copy.menu.write,
        checked: state.viewMode === "source",
        action: () => handlers.setViewMode("source"),
      }),
      await CheckMenuItem.new({
        text: copy.menu.splitView,
        checked: state.viewMode === "split",
        action: () => handlers.setViewMode("split"),
      }),
      await CheckMenuItem.new({
        text: copy.menu.read,
        checked: state.viewMode === "preview",
        action: () => handlers.setViewMode("preview"),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        text: copy.menu.commandPalette,
        accelerator: "CmdOrCtrl+Shift+P",
        action: handlers.openPalette,
      }),
    ],
  });

  const appMenu = await Submenu.new({
    text: "mdplus",
    items: [
      await PredefinedMenuItem.new({ item: { About: null } }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({ text: copy.menu.preferences, accelerator: "CmdOrCtrl+,", action: handlers.openSettings }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({ text: copy.menu.checkUpdates, action: handlers.checkForUpdates }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Services" }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Hide" }),
      await PredefinedMenuItem.new({ item: "HideOthers" }),
      await PredefinedMenuItem.new({ item: "ShowAll" }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      // A plain item (not PredefinedMenuItem "Quit") so it routes through our
      // window close-requested handler and gets the unsaved-changes prompt.
      await MenuItem.new({ text: copy.menu.quit, accelerator: "CmdOrCtrl+Q", action: handlers.quit }),
    ],
  });

  const menu = await Menu.new({ items: [appMenu, fileMenu, editMenu, viewMenu] });
  await menu.setAsAppMenu();
}
