<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "./Icon.svelte";
  import { messages } from "../i18n";

  // `pick` replaces this list with a second step. Escape returns to the commands.
  type Command = {
    id: string;
    label: string;
    group?: string;
    shortcut?: string;
    detail?: string;
    action?: () => void;
    pick?: () => { placeholder: string; items: Command[] };
    disabled?: boolean;
    active?: boolean;
  };

  let { commands, onClose }: { commands: Command[]; onClose: () => void } = $props();

  let query = $state("");
  let selectedIndex = $state(0);
  let pick = $state<{ placeholder: string; items: Command[] } | null>(null);
  let savedQuery = "";
  let savedIndex = 0;
  let input: HTMLInputElement;
  let listEl: HTMLDivElement | undefined;

  const shown = $derived(pick ? pick.items : commands);
  const filtered = $derived(
    shown.filter((c) => !c.disabled && c.label.toLowerCase().includes(query.toLowerCase())),
  );
  const selected = $derived(
    filtered.length === 0 ? 0 : Math.max(0, Math.min(selectedIndex, filtered.length - 1)),
  );

  const sections = $derived.by(() => {
    const out: { group: string; commands: { command: Command; index: number }[] }[] = [];
    filtered.forEach((command, index) => {
      const group = command.group ?? "";
      const last = out.at(-1);
      if (!last || last.group !== group) out.push({ group, commands: [] });
      out.at(-1)?.commands.push({ command, index });
    });
    return out;
  });

  function openPick(command: Command) {
    const next = command.pick?.();
    if (!next) return;
    savedQuery = query;
    savedIndex = selectedIndex;
    query = "";
    pick = next;
    const active = next.items.findIndex((item) => item.active && !item.disabled);
    selectedIndex = active >= 0 ? active : 0;
    input?.focus();
  }

  function closePick() {
    pick = null;
    query = savedQuery;
    selectedIndex = savedIndex;
    input?.focus();
  }

  function run(command: Command) {
    if (!pick && command.pick) {
      openPick(command);
      return;
    }
    onClose();
    command.action?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (pick) closePick();
      else onClose();
    } else if (e.key === "Backspace" && pick && query.length === 0) {
      e.preventDefault();
      closePick();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filtered.length === 0) return;
      selectedIndex = Math.min(selected + 1, filtered.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length === 0) return;
      selectedIndex = Math.max(selected - 1, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const command = filtered[selected];
      if (command) run(command);
    }
  }

  $effect(() => {
    const index = selected;
    listEl?.querySelectorAll<HTMLButtonElement>(".command-row")[index]?.scrollIntoView({ block: "nearest" });
  });

  onMount(() => {
    input?.focus();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="scrim" onclick={onClose} role="presentation">
  <!-- onclick only stops the click from bubbling to the scrim's close handler -- it must
       NOT also swallow keydown, since the input inside is always focused and every
       keystroke needs to reach the window-level handleKeydown above. -->
  <div class="palette" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="presentation">
    <div class="query">
      {#if pick}
        <button
          type="button"
          class="back"
          aria-label={$messages.commands.back}
          onmousedown={(e) => e.preventDefault()}
          onclick={closePick}
        >
          <Icon name="chevron-left" size={16} />
        </button>
      {/if}
      <input
        bind:this={input}
        bind:value={query}
        type="text"
        class:has-back={!!pick}
        placeholder={pick?.placeholder ?? $messages.commands.placeholder}
        spellcheck="false"
        oninput={() => (selectedIndex = 0)}
      />
    </div>
    <div class="command-list" bind:this={listEl}>
      {#each sections as section, s (section.group + s)}
        <div class="group" role="group" aria-label={section.group || undefined}>
          {#if section.group}
            <div class="group-label">{section.group}</div>
          {/if}
          {#each section.commands as { command, index } (command.id)}
            <button class="command-row" class:selected={index === selected} onclick={() => run(command)}>
              <span class="check" aria-hidden="true">{command.active ? "✓" : ""}</span>
              <span class="label">{command.label}</span>
              {#if command.shortcut}
                <span class="shortcut">{command.shortcut}</span>
              {:else if command.detail}
                <span class="shortcut" title={command.detail}>{command.detail}</span>
              {/if}
            </button>
          {/each}
        </div>
      {:else}
        <div class="empty">{$messages.commands.empty}</div>
      {/each}
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.25);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 14vh;
    z-index: 100;
  }

  .palette {
    width: 520px;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    background: var(--mdplus-surface-bg);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
    border: 1px solid var(--mdplus-border);
    overflow: hidden;
  }

  .query {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--mdplus-border);
  }

  .back {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    margin-left: 4px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--mdplus-text-muted);
    cursor: pointer;
    flex-shrink: 0;
  }

  .back:hover {
    background: var(--mdplus-hover);
    color: var(--mdplus-text);
  }

  input {
    font: inherit;
    font-size: 14px;
    flex: 1;
    min-width: 0;
    padding: 12px 14px;
    border: none;
    background: transparent;
    color: var(--mdplus-text);
    outline: none;
  }

  input.has-back {
    padding-left: 2px;
  }

  .command-list {
    overflow-y: auto;
    padding: 6px;
  }

  .group + .group {
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid var(--mdplus-border);
  }

  .group-label {
    padding: 4px 10px 2px;
    font-size: 11px;
    font-weight: 600;
    line-height: 16px;
    color: var(--mdplus-text-muted);
  }

  .command-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    background: transparent;
    color: var(--mdplus-text);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    text-align: left;
  }

  .check {
    width: 14px;
    flex-shrink: 0;
    color: var(--mdplus-accent);
    font-size: 12px;
  }

  .label {
    flex: 1;
    min-width: 0;
  }

  .command-row.selected {
    background: var(--mdplus-hover);
  }

  .shortcut {
    color: var(--mdplus-text-muted);
    font-size: 12px;
    max-width: 46%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty {
    padding: 14px;
    text-align: center;
    color: var(--mdplus-text-muted);
    font-size: 13px;
  }
</style>
