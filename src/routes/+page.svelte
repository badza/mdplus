<script lang="ts">
  import "$lib/styles/theme.css";
  import "$lib/styles/base.css";
  import "$lib/styles/tabs.css";
  import "$lib/styles/editor.css";
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import type { Text } from "@codemirror/state";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import TabBar from "$lib/components/TabBar.svelte";
  import EditorPane from "$lib/components/EditorPane.svelte";
  import WelcomeScreen from "$lib/components/WelcomeScreen.svelte";
  import StatusBar from "$lib/components/StatusBar.svelte";
  import SettingsPanel from "$lib/components/SettingsPanel.svelte";
  import CommandPalette from "$lib/components/CommandPalette.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import { confirm } from "$lib/stores/confirm";
  import { openPrompt } from "$lib/stores/prompt";
  import { tabs, activeTabId, addTab, closeTab, markSaved, editorStates, openSettingsTab, setFileMeta, getFileMeta, reopenClosedTab, closedTabs, type FileMeta } from "$lib/stores/documents";
  import { createDocState } from "$lib/editor/cmSetup";
  import { pickFilesToOpen, pickSavePath, readFile, writeFile, saveScratch, deleteScratch, statFile } from "$lib/ipc/fs";
  import { fetchMarkdownUrl, remoteErrorText, type FetchedNote } from "$lib/ipc/remote";
  import { recentFiles, addRecentFile, persistSessionNow, restoreSession } from "$lib/stores/session";
  import { normalizeRecentFilesLimit, settings, loadSettings, updateSettings } from "$lib/stores/settings";
  import type { ViewMode } from "$lib/ipc/settings";
  import { APPEARANCES } from "$lib/themes";
  import { currentFontOs, fontsForOs, type FontGroup } from "$lib/fonts";
  import { fill, locales, messages } from "$lib/i18n";
  import { HANDOFF_AGENTS, composeHandoffInstruction, handoffAgent, handoffArgs, type HandoffAgent, type HandoffSelection } from "$lib/handoff";
  import { openInTerminal, writeHandoffFile } from "$lib/ipc/handoff";
  import { initTheme } from "$lib/theme";
  import { buildAndSetAppMenu } from "$lib/menu";
  import { fileName, parentDir } from "$lib/path";
  import { modKey, shortcut } from "$lib/platform";
  import { checkForUpdates } from "$lib/ipc/updater";



  function confirmDiscard(message: string): Promise<boolean> {
    const copy = get(messages);
    return confirm({
      title: copy.dialog.unsavedTitle,
      message,
      kind: "warning",
      danger: true,
      confirmLabel: copy.common.discard,
    });
  }

  // Fallback encoding for a brand-new file (no on-disk baseline to inherit). LF,
  // no BOM, with a trailing newline -- the conventional markdown default. Real
  // opens/saves always carry a captured FileMeta so this only kicks in for Save As
  // on an untitled tab.
  function defaultFileMeta(): FileMeta {
    return { mtimeMs: 0, size: 0, lineEnding: "lf", hasBom: false, hasTrailingNewline: true };
  }

  async function handleQuit() {
    try {
      await getCurrentWindow().close();
    } catch {
      // no Tauri window context
    }
  }

  onMount(() => {
    (async () => {
      await loadSettings();
      const restored = get(settings).restoreSession ? await restoreSession() : false;
      if (!restored) {
        handleNewTab();
      }
    })();

    const stopTheme = initTheme();

    let unlisten: (() => void) | undefined;
    let unlistenDrop: (() => void) | undefined;
    try {
      let closing = false;
      getCurrentWindow()
        .onCloseRequested(async (event) => {
          if (closing) return;
          event.preventDefault();
          if ($tabs.some((t) => t.isDirty)) {
            const proceed = await confirmDiscard(get(messages).dialog.quit);
            if (!proceed) return;
          }
          closing = true;
          await persistSessionNow();
          await getCurrentWindow().close();
        })
        .then((fn) => {
          unlisten = fn;
        });

      getCurrentWindow()
        .onDragDropEvent(async (event) => {
          if (event.payload.type !== "drop") return;
          const mdPaths = event.payload.paths.filter((p) => /\.(md|markdown)$/i.test(p));
          for (const path of mdPaths) {
            await openPath(path);
          }
          if (mdPaths.length > 0) persistSessionNow();
        })
        .then((fn) => {
          unlistenDrop = fn;
        });
    } catch {
      // no Tauri window context (e.g. running the frontend standalone) -- nothing to hook
    }

    // WebKit's page menu is Reload, and a debug build adds Inspect Element.
    // The writing surface keeps its own menu (copy, paste, spelling).
    function onContextMenu(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".cm-content, textarea, input, [contenteditable='true']")) return;
      event.preventDefault();
    }
    document.addEventListener("contextmenu", onContextMenu);

    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      stopTheme();
      unlisten?.();
      unlistenDrop?.();
    };
  });

  $effect(() => {
    document.documentElement.style.setProperty("--mdplus-editor-font-size", `${$settings.fontSize}px`);
    document.documentElement.style.setProperty("--mdplus-editor-font-family", $settings.fontFamily);
  });

  // True for a document tab. Settings and the welcome screen leave Handoff off.
  // Derived so a dirty-flag update does not rebuild the native menu.
  const handoffEnabled = $derived.by(() => {
    const tab = $tabs.find((item) => item.id === $activeTabId);
    return !!tab && tab.kind !== "settings";
  });

  // The native menu (File/Edit/View) is rebuilt whenever its dynamic bits change --
  // the Recent Files submenu contents.
  $effect(() => {
    buildAndSetAppMenu(
      {
        newTab: handleNewTab,
        open: handleOpen,
        openUrl: handleOpenFromUrl,
        save: handleSave,
        saveAs: handleSaveAs,
        closeTab: () => {
          if ($activeTabId) handleCloseTab($activeTabId);
        },
        reopenTab: handleReopenTab,
        quit: handleQuit,
        openRecent: handleOpenRecent,
        openSettings: () => {
          openSettingsTab();
        },
        openPalette: () => {
          showPalette = true;
        },
        checkForUpdates: () => {
          checkForUpdates().catch(() => {
            // best-effort: a failed check shouldn't interrupt the user
          });
        },
        setViewMode: (mode) => updateSettings({ viewMode: mode }),
        handoff: handleHandoff,
      },
      {
        recentFiles: $recentFiles.slice(0, normalizeRecentFilesLimit($settings.recentFilesLimit)),
        viewMode: $settings.viewMode,
        messages: $messages,
        handoffEnabled,
      },
    ).catch(() => {
      // no Tauri menu context (e.g. running the frontend standalone)
    });
  });

  async function openPath(path: string) {
    const existing = $tabs.find((t) => t.path === path);
    if (existing) {
      activeTabId.set(existing.id);
      return;
    }
    let opened;
    try {
      opened = await readFile(path);
    } catch (err) {
      const code = typeof err === "string" ? err : err instanceof Error ? err.message : "";
      const copy = get(messages);
      await confirm({
        title: fileName(path),
        message: code === "utf-8" ? copy.dialog.notUtf8 : code || copy.dialog.notUtf8,
        kind: "warning",
        alert: true,
      });
      return;
    }
    const { content, meta } = opened;
    const id = addTab({ path, title: fileName(path) }, createDocState(content));
    setFileMeta(id, meta);
    addRecentFile(path);
  }

  async function handleOpen() {
    const paths = await pickFilesToOpen();
    for (const path of paths) {
      await openPath(path);
    }
    if (paths.length > 0) persistSessionNow();
  }

  function handleOpenFromUrl() {
    const copy = get(messages);
    openPrompt({
      title: copy.openUrl.title,
      hint: copy.openUrl.hint,
      placeholder: copy.openUrl.placeholder,
      confirmLabel: copy.openUrl.open,
      busyLabel: copy.openUrl.opening,
      submit: submitOpenUrl,
    });
  }

  function handleHandoff(agentId: string) {
    const agent = handoffAgent(agentId);
    const tab = get(tabs).find((item) => item.id === get(activeTabId));
    if (!agent || !tab || tab.kind === "settings") return;
    const copy = get(messages);
    openPrompt({
      title: copy.handoff.title,
      hint: fill(copy.handoff.hint, { name: agent.label }),
      placeholder: copy.handoff.placeholder,
      confirmLabel: copy.handoff.open,
      busyLabel: copy.handoff.opening,
      allowEmpty: true,
      icon: "terminal",
      submit: (value, isCurrent) => submitHandoff(agent, value, isCurrent),
    });
  }

  function selectionOf(state: { selection: { main: { empty: boolean; from: number; to: number } }; doc: { sliceString: (from: number, to: number) => string; lineAt: (pos: number) => { number: number } } }): HandoffSelection | null {
    const range = state.selection.main;
    if (range.empty) return null;
    return {
      text: state.doc.sliceString(range.from, range.to),
      fromLine: state.doc.lineAt(range.from).number,
      toLine: state.doc.lineAt(range.to).number,
    };
  }

  function invokeError(err: unknown, fallback: string): string {
    if (typeof err === "string" && err.trim()) return err;
    if (err instanceof Error && err.message.trim()) return err.message;
    return fallback;
  }

  async function submitHandoff(agent: HandoffAgent, userText: string, isCurrent: () => boolean): Promise<string | null> {
    const copy = get(messages);
    const id = get(activeTabId);
    const tab = get(tabs).find((item) => item.id === id);
    if (!id || !tab || tab.kind === "settings") return copy.handoff.noDocument;
    const state = editorStates.get(id);
    if (!state) return copy.handoff.noDocument;

    try {
      let filePath: string;
      if (tab.path) {
        const target = tab.path;
        if (tab.isDirty) {
          const saved = await enqueueSave(() => writeAndMarkSaved(id, target, state.doc));
          if (!isCurrent() || !saved) return null;
        }
        filePath = target;
      } else {
        filePath = await writeHandoffFile(id, state.doc.toString());
        if (!isCurrent()) return null;
      }

      const instruction = composeHandoffInstruction(userText, filePath, !tab.path, tab.sourceUrl, selectionOf(state), copy.handoff);
      if (agent.prompt === "clipboard" && userText.trim()) {
        try {
          await navigator.clipboard.writeText(instruction);
        } catch {
          return copy.handoff.clipboard;
        }
      }
      const cliText = agent.prompt === "clipboard" ? "" : instruction;
      await openInTerminal(parentDir(filePath), handoffArgs(agent, cliText));
      return null;
    } catch (err) {
      if (!isCurrent()) return null;
      return invokeError(err, copy.handoff.failed);
    }
  }

  async function submitOpenUrl(value: string, isCurrent: () => boolean): Promise<string | null> {
    try {
      const note = await fetchMarkdownUrl(value);
      if (!isCurrent()) return null;
      await placeRemoteNote(note);
      return null;
    } catch (err) {
      return remoteErrorText(err, get(messages));
    }
  }

  async function openRemoteLink(url: string) {
    const existing = get(tabs).find((tab) => tab.sourceUrl === url);
    if (existing) {
      activeTabId.set(existing.id);
      return;
    }
    try {
      const note = await fetchMarkdownUrl(url);
      await placeRemoteNote(note);
    } catch (err) {
      const copy = get(messages);
      await confirm({
        title: copy.openUrl.title,
        message: remoteErrorText(err, copy),
        kind: "warning",
        alert: true,
      });
    }
  }

  // The bytes stay local. Save asks for a path; nothing is written back to the link.
  async function placeRemoteNote(note: FetchedNote) {
    const existing = get(tabs).find((tab) => tab.sourceUrl === note.url);
    if (existing) {
      activeTabId.set(existing.id);
      return;
    }
    const copy = get(messages);
    const title = note.title.trim() || copy.tabs.untitled;
    const scratchId = newScratchId();
    addTab({ path: null, title, scratchId, sourceUrl: note.url }, createDocState(note.content));
    await saveScratch(scratchId, note.content).catch(() => {});
    persistSessionNow();
  }

  async function handleDropFiles(paths: string[]) {
    for (const path of paths) {
      await openPath(path);
    }
    persistSessionNow();
  }

  let untitledCount = 1;
  function newScratchId(): string {
    // crypto.randomUUID is available in Tauri's WebView (WKWebView/WebView2).
    // Fallback covers running the frontend standalone outside Tauri.
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `scratch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function handleNewTab() {
    const copy = get(messages);
    const title = untitledCount === 1 ? copy.tabs.untitled : fill(copy.tabs.untitledN, { n: untitledCount });
    untitledCount++;
    const scratchId = newScratchId();
    addTab({ path: null, title, scratchId }, createDocState(""));
    // Pre-create the scratch file so the buffer is restorable even if the user
    // never types anything (an empty scratch file is fine to restore from).
    saveScratch(scratchId, "").catch(() => {
      // best-effort: no Tauri context (standalone frontend)
    });
  }

  async function handleOpenRecent(path: string) {
    await openPath(path);
    persistSessionNow();
  }

  // Stale-write protection. Returns one of "overwrite" | "reload" | "cancel".
  // Compares the on-disk mtime+size against the baseline captured at open/save;
  // a mismatch means the file changed on disk (git pull, Dropbox, another editor)
  // and a save would clobber external changes. Uses two sequential ask() prompts
  // to express a 3-way choice with the existing dialog primitives.
  async function checkStaleWrite(id: string, path: string): Promise<"overwrite" | "reload" | "cancel" | "fresh"> {
    const baseline = getFileMeta(id);
    if (!baseline) return "fresh"; // no baseline (e.g. brand-new save path) -- just write
    let current;
    try {
      current = await statFile(path);
    } catch {
      // File no longer exists on disk (deleted externally). Treat as fresh -- the
      // user's save will recreate it, which is what they'd expect.
      return "fresh";
    }
    if (current.mtimeMs === baseline.mtimeMs && current.size === baseline.size) {
      return "fresh";
    }
    const copy = get(messages);
    const name = fileName(path);
    const overwrite = await confirm({
      title: copy.dialog.changedTitle,
      message: fill(copy.dialog.overwrite, { name }),
      kind: "warning",
      confirmLabel: copy.dialog.overwriteAction,
    });
    if (overwrite) return "overwrite";
    const reload = await confirm({
      title: copy.dialog.changedTitle,
      message: copy.dialog.reload,
      kind: "warning",
      danger: true,
      confirmLabel: copy.dialog.reloadAction,
    });
    return reload ? "reload" : "cancel";
  }

  // Reloads the tab's content from disk and resets the stale-write baseline to
  // the freshly-read file. Used when the user picks "Reload" in checkStaleWrite.
  async function reloadFromDisk(id: string, path: string): Promise<void> {
    const { content, meta } = await readFile(path);
    // Rebuild the EditorState from disk content and swap it into editorStates.
    // EditorPane's $effect re-mounts the new state on the next activeTabId tick;
    // we force that tick by briefly clearing activeTabId when it was this tab.
    const newState = createDocState(content, 0);
    editorStates.set(id, newState);
    setFileMeta(id, meta);
    const cur = $activeTabId;
    if (cur === id) {
      activeTabId.set(null);
      queueMicrotask(() => activeTabId.set(id));
    }
  }

  // One save at a time, so autosave and ⌘S cannot both ask about the same file.
  let saveChain: Promise<unknown> = Promise.resolve();

  function enqueueSave(work: () => Promise<boolean>): Promise<boolean> {
    const run = saveChain.then(work, work);
    saveChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  // `doc` is captured before the (async) write so markSaved compares against exactly what
  // was written -- if the user keeps typing while the write is in flight, those newer
  // keystrokes correctly stay marked dirty instead of being counted as already-saved.
  async function writeAndMarkSaved(id: string, path: string, doc: Text): Promise<boolean> {
    const verdict = await checkStaleWrite(id, path);
    if (verdict === "cancel") return false;
    if (verdict === "reload") {
      await reloadFromDisk(id, path);
      return false;
    }
    // Encoding preservation: re-apply the line-ending/BOM/trailing-newline state
    // captured at open time (or at the last save). A CRLF file stays CRLF, a BOM
    // file keeps its BOM, and a file with no trailing newline isn't given one.
    const meta = getFileMeta(id) ?? defaultFileMeta();
    await writeFile(path, doc.toString(), meta);
    // After a successful write, re-stat to capture the *new* baseline so the next
    // save's stale-write check compares against what we just wrote (not the old).
    const tab = $tabs.find((t) => t.id === id);
    const scratchId = tab?.scratchId ?? null;
    markSaved(id, path, doc);
    addRecentFile(path);
    try {
      setFileMeta(id, await statFile(path));
    } catch {
      // best-effort: if the stat fails the next save just won't have a baseline
    }
    // The tab is now file-backed; its scratch buffer (if it had one) is redundant.
    if (scratchId) deleteScratch(scratchId).catch(() => {});
    persistSessionNow();
    return true;
  }

  async function handleSave() {
    const id = $activeTabId;
    if (!id) return;
    const state = editorStates.get(id);
    if (!state) return;

    const tab = $tabs.find((t) => t.id === id);
    let path = tab?.path ?? null;
    if (!path) {
      path = await pickSavePath();
      if (!path) return;
    }
    const target = path;

    await enqueueSave(() => writeAndMarkSaved(id, target, state.doc));
  }

  async function handleSaveAs() {
    const id = $activeTabId;
    if (!id) return;
    const state = editorStates.get(id);
    if (!state) return;

    const path = await pickSavePath();
    if (!path) return;

    await enqueueSave(() => writeAndMarkSaved(id, path, state.doc));
  }

  // Same checks as ⌘S. Untitled tabs are skipped so a pause does not open a save dialog.
  function handleAutoSave(id: string) {
    void enqueueSave(async () => {
      try {
        const tab = get(tabs).find((t) => t.id === id);
        if (!tab?.path || !tab.isDirty) return false;
        const state = editorStates.get(id);
        if (!state) return false;
        return await writeAndMarkSaved(id, tab.path, state.doc);
      } catch {
        return false;
      }
    });
  }

  // Debounced (1s) for the tab that changed. Untitled text is written to its scratch
  // file and into session.json. A crash mid-typing loses at most ~1s.
  async function handleDocChange(id: string) {
    const tab = get(tabs).find((t) => t.id === id);
    if (!tab?.scratchId) return;
    const state = editorStates.get(id);
    const content = state?.doc.toString() ?? "";
    await saveScratch(tab.scratchId, content).catch(() => {});
    await persistSessionNow();
  }

  function handleSelectTab(id: string) {
    activeTabId.set(id);
  }

  async function handleCloseTab(id: string) {
    const tab = $tabs.find((t) => t.id === id);
    if (tab?.isDirty) {
      const discard = await confirmDiscard(fill(get(messages).dialog.discardNamed, { name: tab.title }));
      if (!discard) return;
    }
    // Once the user has confirmed discard (or the tab was clean), the scratch buffer
    // is dead -- remove its file so scratch/ doesn't grow unbounded across sessions.
    if (tab?.scratchId) deleteScratch(tab.scratchId).catch(() => {});
    closeTab(id);
    persistSessionNow();
  }

  async function handleCloseMultiple(ids: string[]) {
    for (const id of ids) {
      await handleCloseTab(id);
    }
  }

  // Reopen Closed Tab (⌘⇧T). Pops the most-recently-closed tab from the stack in
  // documents.ts and recreates it. The four destructive Close-* menu actions all
  // push onto the same stack via closeTab, so each can be undone one at a time.
  function handleReopenTab() {
    reopenClosedTab();
    persistSessionNow();
  }

  const activeTab = $derived($tabs.find((t) => t.id === $activeTabId) ?? null);
  // The document under the Settings tab stays mounted, so coming back does not
  // rebuild the editor or redraw every diagram.
  let keptDocId = $state<string | null>(null);
  $effect(() => {
    const current = $tabs.find((tab) => tab.id === $activeTabId);
    if (current && current.kind !== "settings") {
      keptDocId = current.id;
      return;
    }
    if (keptDocId && !$tabs.some((tab) => tab.id === keptDocId && tab.kind !== "settings")) {
      keptDocId = null;
    }
  });
  const keptDoc = $derived($tabs.find((tab) => tab.id === keptDocId && tab.kind !== "settings") ?? null);

  let cursorLine = $state(1);
  let cursorCol = $state(1);
  function handleCursorChange(line: number, col: number) {
    cursorLine = line;
    cursorCol = col;
  }

  let wordCount = $state(0);
  function handleWordCountChange(count: number) {
    wordCount = count;
  }

  const pathLabel = $derived(activeTab ? (activeTab.path ?? activeTab.sourceUrl) : null);

  let showPalette = $state(false);

  const fontOs = currentFontOs();
  const fontChoices = fontsForOs(fontOs);
  // Same range as the Settings font stepper. 14 is the stored default.
  const FONT_MIN = 10;
  const FONT_MAX = 28;
  const FONT_DEFAULT = 14;

  $effect(() => {
    const title = $messages.tabs.settings;
    tabs.update((list) => {
      if (!list.some((tab) => tab.kind === "settings" && tab.title !== title)) return list;
      return list.map((tab) => (tab.kind === "settings" ? { ...tab, title } : tab));
    });
  });

  const paletteCommands = $derived.by(() => {
    const copy = $messages;
    const current = $settings;
    const groups = copy.commands.groups;
    const grouped = <T extends object>(group: string, items: T[]) => items.map((item) => ({ ...item, group }));
    const fontHeading = (group: FontGroup) => {
      if (group === "included") return copy.settings.included;
      if (group === "system") return copy.settings.systemFonts;
      if (group === "mac") return copy.settings.onThisMac;
      if (group === "windows") return copy.settings.onThisPc;
      return copy.settings.onThisSystem;
    };
    const stepFont = (next: number) => {
      const size = Math.min(FONT_MAX, Math.max(FONT_MIN, next));
      if (size !== current.fontSize) updateSettings({ fontSize: size });
    };
    const themeDetail = copy.themes[current.theme];
    const fontDetail = fontChoices.find((font) => font.stack === current.fontFamily)?.label ?? current.fontFamily;
    const languageDetail =
      current.locale === "system"
        ? copy.settings.languageSystem
        : (locales.find((pack) => pack.id === current.locale)?.nativeName ?? current.locale);
    const canHandoff = !!activeTab && activeTab.kind !== "settings";
    return [
      ...grouped(groups.file, [
        { id: "new", label: copy.commands.newTab, shortcut: shortcut(["N"]), action: handleNewTab },
        { id: "open", label: copy.commands.openFile, shortcut: shortcut(["O"]), action: handleOpen },
        {
          id: "open-url",
          label: copy.commands.openUrl,
          shortcut: shortcut(["Shift", "O"]),
          action: handleOpenFromUrl,
        },
        { id: "save", label: copy.commands.save, shortcut: shortcut(["S"]), action: handleSave, disabled: !activeTab },
        { id: "save-as", label: copy.commands.saveAs, action: handleSaveAs, disabled: !activeTab },
        {
          id: "handoff",
          label: copy.commands.handoff,
          disabled: !canHandoff,
          pick: () => ({
            placeholder: copy.commands.handoff,
            items: HANDOFF_AGENTS.map((agent) => ({
              id: `handoff-${agent.id}`,
              label: agent.label,
              action: () => handleHandoff(agent.id),
            })),
          }),
        },
        {
          id: "close-tab",
          label: copy.commands.closeTab,
          shortcut: shortcut(["W"]),
          action: () => {
            if ($activeTabId) handleCloseTab($activeTabId);
          },
          disabled: !activeTab,
        },
        {
          id: "reopen-tab",
          label: copy.commands.reopenTab,
          shortcut: shortcut(["Shift", "T"]),
          action: handleReopenTab,
          disabled: $closedTabs.length === 0,
        },
      ]),
      ...grouped(groups.view, [
        { id: "view-source", label: copy.view.write, active: current.viewMode === "source", action: () => updateSettings({ viewMode: "source" as const }) },
        { id: "view-split", label: copy.view.splitView, active: current.viewMode === "split", action: () => updateSettings({ viewMode: "split" as const }) },
        { id: "view-preview", label: copy.view.read, active: current.viewMode === "preview", action: () => updateSettings({ viewMode: "preview" as const }) },
        { id: "view-cycle", label: copy.view.cycle, shortcut: shortcut(["\\"]), action: cycleViewMode },
      ]),
      ...grouped(groups.editor, [
        {
          id: "word-wrap",
          label: copy.commands.wordWrap,
          active: current.wordWrap,
          action: () => updateSettings({ wordWrap: !current.wordWrap }),
        },
        {
          id: "focus",
          label: copy.commands.focus,
          active: current.focusMode,
          action: () => updateSettings({ focusMode: !current.focusMode }),
        },
        {
          id: "full-markdown",
          label: copy.commands.fullMarkdown,
          active: current.fullMarkdown,
          action: () => updateSettings({ fullMarkdown: !current.fullMarkdown }),
        },
        {
          id: "font-larger",
          label: copy.commands.fontLarger,
          action: () => stepFont(current.fontSize + 1),
        },
        {
          id: "font-smaller",
          label: copy.commands.fontSmaller,
          action: () => stepFont(current.fontSize - 1),
        },
        {
          id: "font-reset",
          label: copy.commands.fontReset,
          action: () => stepFont(FONT_DEFAULT),
        },
      ]),
      ...grouped(groups.preferences, [
        {
          id: "color-theme",
          label: copy.commands.colorTheme,
          detail: themeDetail,
          pick: () => ({
            placeholder: copy.commands.colorTheme,
            items: [
              {
                id: "theme-auto",
                label: copy.themes.auto,
                active: current.theme === "auto",
                action: () => updateSettings({ theme: "auto" }),
              },
              ...APPEARANCES.map((item) => ({
                id: `theme-${item.id}`,
                label: copy.themes[item.id],
                active: current.theme === item.id,
                action: () => updateSettings({ theme: item.id }),
              })),
            ],
          }),
        },
        {
          id: "font",
          label: copy.commands.chooseFont,
          detail: fontDetail,
          pick: () => ({
            placeholder: copy.commands.chooseFont,
            items: (["included", fontOs, "system"] as const).flatMap((group) =>
              fontChoices
                .filter((font) => font.group === group)
                .map((font) => ({
                  id: `font-${font.id}`,
                  group: fontHeading(group),
                  label: font.label,
                  active: current.fontFamily === font.stack,
                  action: () => updateSettings({ fontFamily: font.stack }),
                })),
            ),
          }),
        },
        {
          id: "language",
          label: copy.commands.chooseLanguage,
          detail: languageDetail,
          pick: () => ({
            placeholder: copy.commands.chooseLanguage,
            items: [
              {
                id: "locale-system",
                label: copy.settings.languageSystem,
                active: current.locale === "system",
                action: () => updateSettings({ locale: "system" }),
              },
              ...locales.map((pack) => ({
                id: `locale-${pack.id}`,
                label: pack.nativeName,
                active: current.locale === pack.id,
                action: () => updateSettings({ locale: pack.id }),
              })),
            ],
          }),
        },
      ]),
      ...grouped(groups.files, [
        {
          id: "auto-save",
          label: copy.commands.autoSave,
          active: current.autoSave,
          action: () => updateSettings({ autoSave: !current.autoSave }),
        },
        {
          id: "restore-session",
          label: copy.commands.restoreSession,
          active: current.restoreSession,
          action: () => updateSettings({ restoreSession: !current.restoreSession }),
        },
      ]),
      ...grouped(groups.app, [
        { id: "settings", label: copy.commands.settings, shortcut: shortcut([","]), action: () => openSettingsTab() },
        {
          id: "check-updates",
          label: copy.commands.checkUpdates,
          action: () => {
            checkForUpdates().catch(() => {});
          },
        },
      ]),
    ];
  });

  function cycleViewMode() {
    const order: ViewMode[] = ["source", "split", "preview"];
    const index = order.indexOf($settings.viewMode);
    updateSettings({ viewMode: order[(index + 1) % order.length] ?? "source" });
  }
</script>

<svelte:window
  onkeydown={(e) => {
    // Reopen Closed Tab: ⌘⇧T on macOS, Ctrl+Shift+T elsewhere. The native app menu
    // also routes this accelerator, but a window-level handler covers the cases where
    // the menu isn't the active focus target (and is the only path on platforms where
    // we don't install a custom app menu).
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.shiftKey && (e.key === "t" || e.key === "T")) {
      e.preventDefault();
      handleReopenTab();
    }
    if (mod && e.shiftKey && !e.altKey && (e.key === "o" || e.key === "O")) {
      e.preventDefault();
      handleOpenFromUrl();
    }
    if (mod && !e.shiftKey && !e.altKey && e.key === "\\") {
      e.preventDefault();
      cycleViewMode();
    }
  }}
/>

<div class="app">
  {#if $tabs.length > 0}
    <TabBar
      tabList={$tabs}
      activeTabId={$activeTabId}
      onSelect={handleSelectTab}
      onClose={handleCloseTab}
      onCloseMultiple={handleCloseMultiple}
      onNew={handleNewTab}
      onDropFiles={handleDropFiles}
    />
  {/if}
  {#if $tabs.length > 0 && activeTab}
    {#if keptDoc}
      <div class="editor-card" class:editor-card-hidden={activeTab.kind === "settings"}>
        <EditorPane
          activeTabId={activeTab.kind === "settings" ? keptDoc.id : $activeTabId}
          wordWrap={$settings.wordWrap}
          focusMode={$settings.focusMode}
          fullMarkdown={$settings.fullMarkdown}
          autoSave={$settings.autoSave}
          viewMode={$settings.viewMode}
          filePath={activeTab.kind === "settings" ? (keptDoc.path ?? keptDoc.sourceUrl) : (activeTab.path ?? activeTab.sourceUrl)}
          onCursorChange={handleCursorChange}
          onAutoSave={handleAutoSave}
          onDocChange={handleDocChange}
          onWordCountChange={handleWordCountChange}
          onOpenRemote={openRemoteLink}
        />
      </div>
    {/if}
    {#if activeTab.kind === "settings"}
      <div class="editor-card">
        <SettingsPanel />
      </div>
    {/if}
    {#if activeTab.kind !== "settings"}
      <StatusBar
        line={cursorLine}
        col={cursorCol}
        {wordCount}
        {pathLabel}
        viewMode={$settings.viewMode}
        onViewMode={(mode) => updateSettings({ viewMode: mode })}
        wordWrap={$settings.wordWrap}
        focusMode={$settings.focusMode}
        fullMarkdown={$settings.fullMarkdown}
        onToggle={(key) => updateSettings({ [key]: !$settings[key] })}
      />
    {/if}
  {:else}
    <div class="editor-card editor-card-empty">
      <WelcomeScreen
        onNew={handleNewTab}
        onOpen={handleOpen}
        onOpenUrl={handleOpenFromUrl}
        onOpenRecent={handleOpenRecent}
      />
    </div>
  {/if}
</div>

{#if showPalette}
  <CommandPalette commands={paletteCommands} onClose={() => (showPalette = false)} />
{/if}

<ConfirmDialog />

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--mdplus-card-frame);
  }

  /* The editor fills the window edge-to-edge; the card surface is a single
     shade off the frame so the floating tab bar and status bar read as
     sitting on a distinct layer. */
  .editor-card {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--mdplus-card-bg);
    overflow: hidden;
  }

  .editor-card-empty {
    justify-content: center;
  }

  .editor-card-hidden {
    display: none;
  }
</style>
