<script lang="ts">
  import Icon from "./Icon.svelte";
  import { messages } from "../i18n";
  import { shortcut } from "../platform";
  import { recentFiles } from "../stores/session";
  import { normalizeRecentFilesLimit, settings } from "../stores/settings";
  import appIcon from "../assets/app-icon.png";

  let {
    onNew,
    onOpen,
    onOpenUrl,
    onOpenRecent,
  }: {
    onNew: () => void;
    onOpen: () => void;
    onOpenUrl: () => void;
    onOpenRecent: (path: string) => void;
  } = $props();

  // The welcome list stays short. Open Recent follows the settings limit.
  const recentShown = $derived(Math.min(5, normalizeRecentFilesLimit($settings.recentFilesLimit)));

  function baseName(path: string): string {
    return path.split("/").pop() ?? path;
  }

  function dirName(path: string): string {
    const idx = path.lastIndexOf("/");
    if (idx <= 0) return "";
    return path.slice(0, idx);
  }
</script>

<div class="welcome">
  <img class="welcome-mark" src={appIcon} alt="" width="80" height="80" />
  <h1 class="welcome-title">mdplus</h1>
  <p class="welcome-sub">{$messages.welcome.slogan}</p>

  <div class="welcome-actions">
    <button class="welcome-action primary" onclick={onNew}>
      <Icon name="plus" size={15} />
      <span>{$messages.welcome.newFile}</span>
      <kbd>{shortcut(["N"])}</kbd>
    </button>
    <button class="welcome-action" onclick={onOpen}>
      <Icon name="document" size={15} />
      <span>{$messages.welcome.open}</span>
      <kbd>{shortcut(["O"])}</kbd>
    </button>
    <button class="welcome-action" onclick={onOpenUrl}>
      <Icon name="link" size={15} />
      <span>{$messages.welcome.openUrl}</span>
      <kbd>{shortcut(["Shift", "O"])}</kbd>
    </button>
  </div>

  {#if $recentFiles.length > 0}
    <div class="welcome-recent">
      <p class="welcome-recent-label">{$messages.welcome.recent}</p>
      <ul class="welcome-recent-list">
        {#each $recentFiles.slice(0, recentShown) as path (path)}
          <li>
            <button class="recent-item" onclick={() => onOpenRecent(path)} title={path}>
              <Icon name="document" size={13} />
              <span class="recent-name">{baseName(path)}</span>
              {#if dirName(path)}
                <span class="recent-dir">{dirName(path)}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <p class="welcome-tip">{$messages.welcome.tipBefore}<strong>.md</strong>{$messages.welcome.tipAfter}</p>
</div>

<style>
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;
    padding: 40px 24px;
    text-align: center;
    color: var(--mdplus-text-muted);
    user-select: none;
  }

  .welcome-mark {
    width: 80px;
    height: 80px;
    margin-bottom: 12px;
  }

  .welcome-title {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    color: var(--mdplus-text);
    letter-spacing: -0.01em;
  }

  .welcome-sub {
    margin: 2px 0 24px 0;
    font-size: 13.5px;
    color: var(--mdplus-text-muted);
  }

  .welcome-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    max-width: 280px;
  }

  .welcome-action {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border: 1px solid var(--mdplus-border);
    border-radius: 8px;
    background: var(--mdplus-bg-subtle);
    color: var(--mdplus-text);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease, border-color 0.12s ease;
  }

  .welcome-action:hover {
    background: var(--mdplus-hover);
    border-color: var(--mdplus-tab-indicator);
  }

  .welcome-action.primary {
    background: var(--mdplus-pill-active-bg);
    border-color: var(--mdplus-pill-active-border);
    box-shadow: var(--mdplus-pill-active-shadow);
  }

  .welcome-action.primary:hover {
    background: var(--mdplus-btn-hover-bg);
  }

  .welcome-action span {
    flex: 1 1 auto;
  }

  .welcome-action kbd {
    font-family: var(--mdplus-editor-font-family, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
    font-size: 11px;
    color: var(--mdplus-text-muted);
    background: var(--mdplus-bg);
    border: 1px solid var(--mdplus-border);
    border-radius: 4px;
    padding: 1px 5px;
    line-height: 1.4;
    flex-shrink: 0;
  }

  .welcome-recent {
    width: 100%;
    max-width: 280px;
    margin-top: 24px;
    text-align: left;
  }

  .welcome-recent-label {
    margin: 0 0 6px 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--mdplus-text-muted);
  }

  .welcome-recent-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .recent-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    border: none;
    background: transparent;
    border-radius: 6px;
    color: var(--mdplus-text);
    font-size: 12.5px;
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease;
  }

  .recent-item:hover {
    background: var(--mdplus-hover);
  }

  .recent-item :global(.icon) {
    opacity: 0.55;
    flex-shrink: 0;
  }

  .recent-name {
    flex: 0 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recent-dir {
    flex: 1 1 auto;
    min-width: 0;
    margin-left: auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--mdplus-text-muted);
    font-size: 11.5px;
    text-align: right;
    direction: rtl;
  }

  .welcome-tip {
    margin: 28px 0 0 0;
    font-size: 11.5px;
    color: var(--mdplus-text-muted);
    opacity: 0.85;
  }

  .welcome-tip strong {
    font-weight: 600;
    color: var(--mdplus-text);
  }
</style>