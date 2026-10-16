<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { messages } from "../i18n";
  import Icon from "./Icon.svelte";

  const win = getCurrentWindow();

  function minimize() {
    win.minimize();
  }

  function toggleMaximize() {
    win.toggleMaximize();
  }

  function handleClose() {
    win.close();
  }

  function handleDblClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (t.closest(".win-btn")) return;
    toggleMaximize();
  }
</script>

<div class="title-bar" data-tauri-drag-region role="presentation" ondblclick={handleDblClick}>
  <span class="title-bar-label" data-tauri-drag-region aria-hidden="true">mdplus</span>
  <div class="title-bar-controls">
    <button class="win-btn" onclick={minimize} title={$messages.window.minimize}>
      <Icon name="minimize" size={12} />
    </button>
    <button class="win-btn" onclick={toggleMaximize} title={$messages.window.maximize}>
      <Icon name="maximize" size={11} />
    </button>
    <button class="win-btn win-btn-close" onclick={handleClose} title={$messages.window.close}>
      <Icon name="close" size={12} />
    </button>
  </div>
</div>

<style>
  .title-bar {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    height: 36px;
    flex-shrink: 0;
    padding: 0 0 0 12px;
    background: var(--mdplus-titlebar-bg);
    user-select: none;
  }

  .title-bar-label {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 12px;
    font-weight: 500;
    color: var(--mdplus-text-muted);
    pointer-events: none;
    top: 50%;
    transform: translateY(-50%);
  }

  .title-bar-controls {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 8px;
    flex-shrink: 0;
    z-index: 2;
  }

  .win-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 20px;
    border: none;
    background: transparent;
    color: var(--mdplus-text-muted);
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
  }

  .win-btn:hover {
    background: var(--mdplus-btn-hover-bg);
    color: var(--mdplus-text);
  }

  .win-btn:active {
    background: var(--mdplus-btn-active-bg);
  }

  .win-btn-close:hover {
    background: linear-gradient(to bottom, #f15b60, #ed5156);
    color: #fff;
  }
</style>