<script lang="ts">
  import { fade } from "svelte/transition";
  import { countPhrase, fill, messages } from "../i18n";
  import type { ViewMode } from "../ipc/settings";
  import ViewModeSwitch from "./ViewModeSwitch.svelte";

  type EditorToggle = "wordWrap" | "focusMode" | "fullMarkdown";

  let {
    line,
    col,
    wordCount = 0,
    pathLabel = null,
    viewMode = null,
    onViewMode,
    wordWrap = false,
    focusMode = false,
    fullMarkdown = false,
    onToggle,
  }: {
    line: number;
    col: number;
    wordCount?: number;
    pathLabel?: string | null;
    viewMode?: ViewMode | null;
    onViewMode?: (mode: ViewMode) => void;
    wordWrap?: boolean;
    focusMode?: boolean;
    fullMarkdown?: boolean;
    onToggle?: (key: EditorToggle) => void;
  } = $props();

  let egg = $state<{ right: number; bottom: number } | null>(null);
  let eggEl = $state<HTMLDivElement | undefined>();

  const toggles = $derived([
    { key: "wordWrap" as const, label: $messages.settings.wordWrap, on: wordWrap },
    { key: "focusMode" as const, label: $messages.settings.focus, on: focusMode },
    { key: "fullMarkdown" as const, label: $messages.settings.fullMarkdown, on: fullMarkdown },
  ]);

  function openEgg(e: MouseEvent) {
    if (viewMode !== "source" && viewMode !== "split") return;
    e.preventDefault();
    const host = e.currentTarget as HTMLElement;
    const rect = host.getBoundingClientRect();
    egg = {
      right: Math.max(8, window.innerWidth - rect.right),
      bottom: Math.max(8, window.innerHeight - rect.top + 6),
    };
  }

  function closeEgg() {
    egg = null;
  }

  $effect(() => {
    if (viewMode !== "source" && viewMode !== "split") egg = null;
  });

  $effect(() => {
    if (!egg) return;
    function handlePointerDown(e: MouseEvent) {
      if (eggEl?.contains(e.target as Node)) return;
      closeEgg();
    }
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") closeEgg();
    }
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("blur", closeEgg);
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("blur", closeEgg);
      window.removeEventListener("keydown", handleKeydown);
    };
  });
</script>

<div class="status-bar">
  <span class="status-item">{fill($messages.status.lineCol, { line, col })}</span>
  <span class="status-item">{countPhrase($messages.status.words, wordCount)}</span>
  {#if pathLabel}
    <span class="status-item status-path" title={pathLabel}>{pathLabel}</span>
  {/if}
  {#if viewMode && onViewMode}
    <div class="status-corner" role="group" aria-label={$messages.view.label} oncontextmenu={openEgg}>
      <ViewModeSwitch mode={viewMode} onChange={onViewMode} />
    </div>
  {/if}
</div>

{#if egg}
  <div
    class="egg-menu"
    bind:this={eggEl}
    style="right: {egg.right}px; bottom: {egg.bottom}px;"
    role="menu"
    tabindex="-1"
    aria-label={$messages.settings.editor}
    oncontextmenu={(e) => e.preventDefault()}
    transition:fade={{ duration: 80 }}
  >
    {#each toggles as item (item.key)}
      <button
        type="button"
        class="egg-item"
        role="menuitemcheckbox"
        aria-checked={item.on}
        onclick={() => onToggle?.(item.key)}
      >
        <span class="egg-check" aria-hidden="true">{item.on ? "✓" : ""}</span>
        <span>{item.label}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .status-bar {
    display: flex;
    align-items: center;
    height: 28px;
    padding: 0 16px;
    background: transparent;
    font-size: 11.5px;
    color: var(--mdplus-text-muted);
    user-select: none;
    flex-shrink: 0;
  }

  .status-item {
    padding: 0 6px;
    flex-shrink: 0;
  }

  .status-item:first-child {
    padding-left: 0;
  }

  .status-path {
    flex: 1;
    flex-shrink: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
  }

  .status-corner {
    display: flex;
    margin-left: auto;
  }

  .egg-menu {
    position: fixed;
    z-index: 80;
    min-width: 180px;
    padding: 4px;
    background: var(--mdplus-surface-bg);
    border: 1px solid var(--mdplus-border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  }

  .egg-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    border: none;
    background: transparent;
    border-radius: 5px;
    font: inherit;
    font-size: 13px;
    color: var(--mdplus-text);
    cursor: pointer;
    text-align: left;
  }

  .egg-item:hover {
    background: var(--mdplus-hover);
  }

  .egg-check {
    width: 14px;
    flex-shrink: 0;
    color: var(--mdplus-accent);
    font-size: 12px;
  }


</style>
