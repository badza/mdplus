<script lang="ts">
  import { messages } from "../i18n";
  import type { TabMeta } from "../stores/documents";
  import Icon from "./Icon.svelte";

  let {
    tab,
    active,
    onSelect,
    onClose,
    onContextMenu,
  }: {
    tab: TabMeta;
    active: boolean;
    onSelect: () => void;
    onClose: () => void;
    onContextMenu?: (e: MouseEvent) => void;
  } = $props();

  const tip = $derived.by(() => {
    const name = tab.isDeleted ? `${tab.title} ${$messages.tabs.deleted}` : tab.title;
    const location = tab.path ?? tab.sourceUrl;
    return location ? `${name}\n${location}` : name;
  });

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    onContextMenu?.(e);
  }

  function handleAuxClick(e: MouseEvent) {
    // Middle-click closes the tab, same as the close button.
    if (e.button === 1) {
      e.preventDefault();
      onClose();
    }
  }
</script>

<div class="tab-item" class:dirty={tab.isDirty}>
  <button
    class="tab"
    class:active
    class:deleted={tab.isDeleted}
    onclick={onSelect}
    onauxclick={handleAuxClick}
    oncontextmenu={handleContextMenu}
    title={tip}
    aria-label={tab.path ?? tab.sourceUrl ?? tab.title}
  >
    <span class="tab-icon" aria-hidden="true"><Icon name={tab.kind === "settings" ? "settings" : "markdown"} size={13} /></span>
    <span class="tab-title">{tab.title}{tab.isDeleted ? ` ${$messages.tabs.deleted}` : ""}</span>
    <span class="tab-end">
      <span
        class="tab-close"
        role="button"
        tabindex="0"
        onclick={(e) => { e.stopPropagation(); onClose(); }}
        onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onClose(); } }}
        title={$messages.tabs.close}
      >
        <Icon name="close" size={12} />
      </span>
    </span>
  </button>
  {#if tab.isDirty}
    <span class="dirty-dot" aria-hidden="true"></span>
  {/if}
</div>