<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { fade } from "svelte/transition";
  import { EditorView } from "@codemirror/view";
  import { editorStates, updateDirty } from "../stores/documents";
  import { setWordWrap } from "../editor/cmSetup";
  import { editorContext, editorContextCompartment } from "../editor/editorContext";
  import { toggleTaskLine } from "../editor/taskToggle";
  import { countWords } from "../editor/wordCount";
  import { messages } from "../i18n";
  import { resolvedTheme } from "../theme";
  import type { ViewMode } from "../ipc/settings";
  import { bindSplitScroll } from "../preview/scrollSync";
  import Icon from "./Icon.svelte";
  import PreviewPane from "./PreviewPane.svelte";

  let {
    activeTabId,
    wordWrap = true,
    focusMode = true,
    fullMarkdown = false,
    autoSave = false,
    viewMode = "source",
    filePath = null,
    onCursorChange,
    onAutoSave,
    onDocChange,
    onWordCountChange,
    onOpenRemote,
  }: {
    activeTabId: string | null;
    wordWrap?: boolean;
    focusMode?: boolean;
    fullMarkdown?: boolean;
    autoSave?: boolean;
    viewMode?: ViewMode;
    filePath?: string | null;
    onCursorChange?: (line: number, col: number) => void;
    onAutoSave?: () => void;
    onDocChange?: () => void;
    onWordCountChange?: (count: number) => void;
    onOpenRemote?: (url: string) => void;
  } = $props();

  let container: HTMLDivElement;
  let workspaceEl: HTMLDivElement | undefined;
  let previewRoot = $state<HTMLDivElement | null>(null);
  let view: EditorView | undefined;
  let mountedTabId: string | null = null;
  let mountedWordWrap: boolean | null = null;
  let autoSaveTimer: ReturnType<typeof setTimeout> | undefined;
  let docChangeTimer: ReturnType<typeof setTimeout> | undefined;
  const AUTO_SAVE_DEBOUNCE_MS = 800;
  const DOC_CHANGE_DEBOUNCE_MS = 1000;
  let isDocEmpty = $state(true);
  let docText = $state("");
  let ratio = $state(0.5);

  function reportCursor() {
    if (!view) return;
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    onCursorChange?.(line.number, pos - line.from + 1);
  }

  function reportContentMetrics() {
    if (!view) return;
    const text = view.state.doc.toString();
    docText = text;
    onWordCountChange?.(countWords(text));
    isDocEmpty = text.length === 0;
  }

  onMount(() => {
    view = new EditorView({
      parent: container,
      dispatchTransactions: (transactions) => {
        view!.update(transactions);
        if (mountedTabId) {
          // Persist every transaction (not just doc changes) so cursor/selection
          // survive a tab switch, and keep the dirty flag O(1) via Text ref-equality.
          editorStates.set(mountedTabId, view!.state);
          if (transactions.some((tr) => tr.docChanged)) {
            updateDirty(mountedTabId, view!.state.doc);
            reportContentMetrics();
            if (autoSave) {
              clearTimeout(autoSaveTimer);
              autoSaveTimer = setTimeout(() => onAutoSave?.(), AUTO_SAVE_DEBOUNCE_MS);
            }
            // Untitled-buffer persistence: debounce a doc-change callback so a
            // crash mid-typing doesn't lose more than ~1s of work. The parent
            // decides what to persist (scratch file + session.json) based on the
            // active tab's kind.
            clearTimeout(docChangeTimer);
            docChangeTimer = setTimeout(() => onDocChange?.(), DOC_CHANGE_DEBOUNCE_MS);
          }
        }
        reportCursor();
      },
    });
  });

  onDestroy(() => {
    clearTimeout(autoSaveTimer);
    clearTimeout(docChangeTimer);
    view?.destroy();
  });

  $effect(() => {
    const path = filePath;
    const dark = $resolvedTheme === "dark";
    const renderSource = !fullMarkdown;
    // Split already shows the rendered page. Widgets in the editor would
    // appear as the lines scroll into view and hitch that first pass.
    const liveBlocks = viewMode === "source" && renderSource;
    const live = liveBlocks;
    if (!view) return;
    if (activeTabId !== mountedTabId) {
      if (activeTabId === null) {
        mountedTabId = null;
        docText = "";
        isDocEmpty = true;
        return;
      }
      const state = editorStates.get(activeTabId);
      if (!state) return;
      view.setState(state);
      mountedTabId = activeTabId;
      mountedWordWrap = wordWrap;
      setWordWrap(view, wordWrap);
      if (viewMode !== "preview") view.focus();
      reportCursor();
      reportContentMetrics();
    }
    view.dispatch({
      effects: editorContextCompartment.reconfigure(
        editorContext({ path, dark, liveMermaid: live, renderSource, liveBlocks }),
      ),
    });
    if (viewMode !== "preview") queueMicrotask(() => view?.requestMeasure());
  });

  $effect(() => {
    if (!view || activeTabId !== mountedTabId || wordWrap === mountedWordWrap) return;
    setWordWrap(view, wordWrap);
    mountedWordWrap = wordWrap;
  });

  // Focus padding changes the wrap width without resizing the pane.
  $effect(() => {
    const focused = viewMode === "source" && focusMode;
    if (!view || viewMode === "preview") return;
    void focused;
    queueMicrotask(() => view?.requestMeasure());
  });

  // Split view follows the pane under the gesture. The mapping is built when
  // the preview changes and applied once per frame, so the trackpad keeps
  // its momentum instead of being pulled back to the nearest block.
  $effect(() => {
    if (viewMode !== "split" || !view || !previewRoot) return;
    const article = previewRoot.querySelector(".preview-article");
    if (!(article instanceof HTMLElement)) return;
    return bindSplitScroll(view, previewRoot, article);
  });

  function startSplitDrag(event: PointerEvent) {
    if (!workspaceEl) return;
    event.preventDefault();
    const workspace = workspaceEl;
    function move(ev: PointerEvent) {
      const rect = workspace.getBoundingClientRect();
      if (rect.width <= 0) return;
      const next = (ev.clientX - rect.left) / rect.width;
      ratio = Math.min(0.72, Math.max(0.28, next));
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function handleToggleTask(line: number) {
    if (view) toggleTaskLine(view, line);
  }
</script>

<div
  class="workspace"
  class:is-split={viewMode === "split"}
  class:is-preview={viewMode === "preview"}
  class:is-focus={viewMode === "source" && focusMode}
  style={viewMode === "split" ? `--split-editor:${ratio};--split-preview:${1 - ratio}` : undefined}
  bind:this={workspaceEl}
>
  <div class="editor-column">
    <div class="editor-wrapper">
      <div class="editor-pane" bind:this={container}></div>
      {#if isDocEmpty && viewMode !== "preview"}
        <div class="doc-empty-hint" aria-hidden="true" transition:fade={{ duration: 220 }}>
          <Icon name="markdown" size={28} />
          <p class="doc-empty-title">{$messages.editor.startWriting}</p>
          <p class="doc-empty-sub">{$messages.editor.startHint}</p>
        </div>
      {/if}
    </div>
  </div>
  {#if viewMode === "split"}
    <div class="split-rule" role="separator" aria-orientation="vertical" aria-label={$messages.window.resizePanes} onpointerdown={startSplitDrag}></div>
  {/if}
  {#if viewMode !== "source"}
    <PreviewPane
      markdown={docText}
      basePath={filePath}
      dark={$resolvedTheme === "dark"}
      solo={viewMode === "preview"}
      onToggleTask={handleToggleTask}
      {onOpenRemote}
      bind:root={previewRoot}
    />
  {/if}
</div>
