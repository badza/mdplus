<script lang="ts">
  import { fill, messages } from "../i18n";
  import type { ViewMode } from "../ipc/settings";
  import { shortcut } from "../platform";
  import Icon from "./Icon.svelte";
  import type { IconName } from "./Icon.svelte";

  let {
    mode,
    onChange,
  }: {
    mode: ViewMode;
    onChange: (mode: ViewMode) => void;
  } = $props();

  // Write is the editor. Marks, tables, and diagrams show when the cursor
  // leaves them, so it is not a raw markdown dump and not the reading page.
  const modes = $derived([
    { id: "source" as ViewMode, label: $messages.view.write, icon: "write" as IconName },
    { id: "split" as ViewMode, label: $messages.view.split, icon: "split" as IconName },
    { id: "preview" as ViewMode, label: $messages.view.read, icon: "read" as IconName },
  ]);

  function onKeydown(event: KeyboardEvent) {
    const index = modes.findIndex((item) => item.id === mode);
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      const next = modes[(index + step + modes.length) % modes.length];
      if (next) onChange(next.id);
    }
  }
</script>

<div class="view-switch" aria-label={$messages.view.label} title={fill($messages.view.cycleWith, { shortcut: shortcut(["\\"]) })}>
  {#each modes as item (item.id)}
    <button
      type="button"
      aria-pressed={mode === item.id}
      aria-label={item.label}
      title={item.label}
      onclick={() => onChange(item.id)}
      onkeydown={onKeydown}
    >
      <Icon name={item.icon} size={14} />
    </button>
  {/each}
</div>

<style>
  .view-switch {
    display: flex;
    flex-shrink: 0;
    margin-left: auto;
    gap: 2px;
  }

  button {
    appearance: none;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--mdplus-text-muted);
    font: inherit;
    display: grid;
    place-items: center;
    width: 26px;
    height: 22px;
    padding: 0;
    cursor: pointer;
  }

  button:hover {
    background: var(--mdplus-hover);
    color: var(--mdplus-text);
  }

  button[aria-pressed="true"] {
    background: var(--mdplus-active);
    color: var(--mdplus-text);
  }
</style>
