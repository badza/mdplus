<script lang="ts">
  import { fly, fade } from "svelte/transition";
  import { get } from "svelte/store";
  import { messages } from "../i18n";
  import { confirmStore, resolveConfirm, type ConfirmKind } from "../stores/confirm";
  import { closePrompt, promptStore } from "../stores/prompt";
  import Icon from "./Icon.svelte";

  let draft = $state("");
  let promptError = $state("");
  let promptBusy = $state(false);
  let urlInput = $state<HTMLInputElement | null>(null);
  let promptWasOpen = false;
  // Bumped on dismiss so a fetch that returns later cannot open a tab.
  let promptGeneration = 0;

  function iconName(kind: ConfirmKind): "warning" | "info" {
    return kind === "info" ? "info" : "warning";
  }

  function handleConfirm() {
    resolveConfirm(true);
  }

  function handleCancel() {
    resolveConfirm(false);
  }

  function handleScrim() {
    if ($promptStore) {
      cancelPrompt();
      return;
    }
    // Clicking outside the dialog cancels -- same as the Cancel button.
    resolveConfirm(false);
  }

  function handleConfirmKey(e: KeyboardEvent): boolean {
    if (!$confirmStore) return false;
    if (e.key === "Escape") {
      e.preventDefault();
      resolveConfirm(false);
      return true;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      resolveConfirm(true);
      return true;
    }
    return true;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (handleConfirmKey(e)) return;
  }

  $effect(() => {
    const open = $promptStore !== null;
    if (open && !promptWasOpen) {
      draft = "";
      promptError = "";
      promptBusy = false;
      queueMicrotask(() => urlInput?.focus());
    }
    promptWasOpen = open;
  });

  function cancelPrompt() {
    promptGeneration += 1;
    promptBusy = false;
    closePrompt();
  }

  async function submitPrompt() {
    const request = $promptStore;
    if (!request || promptBusy) return;
    const value = draft.trim();
    if (!value && !request.allowEmpty) {
      promptError = $messages.openUrl.empty;
      urlInput?.focus();
      return;
    }
    promptBusy = true;
    promptError = "";
    const generation = promptGeneration;
    const isCurrent = () => generation === promptGeneration && get(promptStore) === request;
    const message = await request.submit(value, isCurrent);
    if (!isCurrent()) return;
    if (message) {
      promptError = message;
      promptBusy = false;
      urlInput?.focus();
      return;
    }
    closePrompt();
  }

  function handlePromptKeydown(e: KeyboardEvent) {
    if ($confirmStore) {
      handleConfirmKey(e);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancelPrompt();
    }
    e.stopPropagation();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $promptStore}
  {@const request = $promptStore}
  <div
    class="scrim"
    onclick={handleScrim}
    role="presentation"
    transition:fade={{ duration: 120 }}
  >
    <div
      class="dialog prompt"
      onclick={(e) => e.stopPropagation()}
      onkeydown={handlePromptKeydown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-title"
      aria-describedby="prompt-hint"
      aria-busy={promptBusy}
      tabindex="-1"
      transition:fly={{ y: 12, duration: 160 }}
    >
      <form
        class="prompt-form"
        onsubmit={(e) => {
          e.preventDefault();
          if ($confirmStore) return;
          void submitPrompt();
        }}
      >
        <div class="icon-row">
          <span class="icon-badge">
            <Icon name={request.icon ?? "link"} size={18} />
          </span>
          <h2 id="prompt-title">{request.title}</h2>
        </div>

        <label id="prompt-hint" class="message" for="open-url-input">{request.hint}</label>
        <input
          id="open-url-input"
          class="url-input"
          type="text"
          bind:this={urlInput}
          bind:value={draft}
          placeholder={request.placeholder}
          autocomplete="off"
          spellcheck="false"
          disabled={promptBusy}
          aria-invalid={promptError ? "true" : undefined}
          aria-describedby={promptError ? "prompt-error" : undefined}
        />
        {#if promptError}
          <p id="prompt-error" class="url-error" role="alert">{promptError}</p>
        {/if}

        <div class="actions">
          <button class="btn btn-secondary" type="button" onclick={cancelPrompt}>
            {$messages.common.cancel}
          </button>
          <button class="btn" type="submit" disabled={promptBusy}>
            {promptBusy ? request.busyLabel : request.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
{#if $confirmStore}
  <div
    class="scrim confirm-layer"
    onclick={handleScrim}
    role="presentation"
    transition:fade={{ duration: 120 }}
  >
    <div
      class="dialog"
      class:danger={$confirmStore.danger}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => {
        handleConfirmKey(e);
        e.stopPropagation();
      }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      tabindex="-1"
      transition:fly={{ y: 12, duration: 160 }}
    >
      <div class="icon-row">
        <span class="icon-badge" class:danger={$confirmStore.danger}>
          <Icon name={iconName($confirmStore.kind ?? "info")} size={18} />
        </span>
        {#if $confirmStore.title}
          <h2 id="confirm-title">{$confirmStore.title}</h2>
        {/if}
      </div>

      <p id="confirm-message" class="message">{$confirmStore.message}</p>

      <div class="actions">
        {#if !$confirmStore.alert}
          <button class="btn btn-secondary" onclick={handleCancel}>
            {$confirmStore.cancelLabel ?? $messages.common.cancel}
          </button>
        {/if}
        <button
          class="btn"
          class:btn-danger={$confirmStore.danger}
          onclick={handleConfirm}
        >
          {$confirmStore.confirmLabel ?? ($confirmStore.danger ? $messages.common.discard : $messages.common.ok)}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .scrim.confirm-layer {
    z-index: 220;
  }

  .dialog {
    width: 360px;
    max-width: calc(100vw - 32px);
    background: var(--mdplus-surface-bg);
    color: var(--mdplus-text);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
    border: 1px solid var(--mdplus-border);
    padding: 18px 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .dialog.prompt {
    width: 440px;
  }

  .prompt-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin: 0;
  }

  .url-input {
    font: inherit;
    font-size: 13px;
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    border: 1px solid var(--mdplus-border);
    border-radius: 7px;
    background: var(--mdplus-bg);
    color: var(--mdplus-text);
    outline: none;
  }

  .url-input:focus {
    border-color: var(--mdplus-accent);
  }

  .url-input:disabled {
    opacity: 0.7;
  }

  .url-error {
    margin: -6px 0 0;
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--mdplus-accent);
  }

  .icon-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .icon-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    flex-shrink: 0;
    color: var(--mdplus-text-muted);
    background: var(--mdplus-btn-bg);
  }

  .icon-badge.danger {
    color: var(--mdplus-accent);
    background: rgba(232, 89, 79, 0.12);
  }

  :root[data-tone="dark"] .icon-badge.danger {
    background: rgba(255, 122, 110, 0.16);
  }

  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.3;
  }

  .message {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--mdplus-text);
    opacity: 0.85;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 2px;
  }

  .btn {
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    padding: 7px 14px;
    border: 1px solid var(--mdplus-border);
    border-radius: 7px;
    background: var(--mdplus-btn-bg);
    color: var(--mdplus-text);
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
    min-width: 72px;
  }

  .btn:hover {
    background: var(--mdplus-btn-hover-bg);
    border-color: var(--mdplus-tab-indicator);
  }

  .btn:active {
    background: var(--mdplus-btn-active-bg);
  }

  .btn:disabled {
    opacity: 0.65;
    cursor: default;
  }

  .btn-secondary {
    background: transparent;
    color: var(--mdplus-text-muted);
  }

  .btn-secondary:hover {
    color: var(--mdplus-text);
    background: var(--mdplus-btn-hover-bg);
  }

  .btn-danger {
    color: #fff;
    border-color: #d63a3f;
    background: linear-gradient(to bottom, #e8594f, #d63a3f);
  }

  .btn-danger:hover {
    background: linear-gradient(to bottom, #ec6960, #df4449);
    border-color: #c92e33;
  }

  :root[data-tone="dark"] .btn-danger {
    border-color: #c44347;
    background: linear-gradient(to bottom, #ff7a6e, #e8594f);
  }

  :root[data-tone="dark"] .btn-danger:hover {
    background: linear-gradient(to bottom, #ff8a7e, #ed6960);
  }
</style>