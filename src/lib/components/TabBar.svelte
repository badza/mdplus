<script lang="ts">
  import { fade } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { dndzone } from "svelte-dnd-action";
  import TabItem from "./TabItem.svelte";
  import Icon from "./Icon.svelte";
  import { tabs as tabsStore, type TabMeta } from "../stores/documents";
  import { fill, messages } from "../i18n";
  import { shortcut } from "../platform";

  let {
    tabList,
    activeTabId,
    onSelect,
    onClose,
    onCloseMultiple,
    onNew,
    onDropFiles,
  }: {
    tabList: TabMeta[];
    activeTabId: string | null;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
    onCloseMultiple: (ids: string[]) => void;
    onNew: () => void;
    onDropFiles?: (paths: string[]) => void;
  } = $props();

  // dndzone mutates the items array on `consider` (transient reorder while
  // dragging) and finalises it on `finalize`. We keep a local mirror so the
  // store only commits once, on drop.
  let dndItems = $state<TabMeta[]>([]);
  let isDragging = $state(false);
  const FLIP_MS = 180;

  // While NOT dragging, dndItems mirrors the store list 1:1 so external changes
  // (add/close/rename/dirty) flow through. While dragging, dndzone owns the
  // order and we leave the mirror untouched until `finalize` commits.
  $effect(() => {
    if (isDragging) return;
    dndItems = [...tabList];
  });

  function handleDndConsider(e: CustomEvent) {
    isDragging = true;
    dndItems = e.detail.items;
  }

  function handleDndFinalize(e: CustomEvent) {
    dndItems = e.detail.items;
    const newOrder = e.detail.items.map((t: TabMeta) => t.id);
    tabsStore.update((list) => {
      const byId = new Map(list.map((t) => [t.id, t]));
      return newOrder.map((id: string) => byId.get(id)).filter(Boolean) as TabMeta[];
    });
    isDragging = false;
  }

  let tabsTrackEl: HTMLDivElement | undefined = $state();
  let overflowing = $state(false);
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);
  let menuOpen = $state(false);
  let menuEl: HTMLDivElement | undefined = $state();
  let overflowBtnEl: HTMLButtonElement | undefined = $state();

  let tabBarEl: HTMLDivElement | undefined = $state();

  let contextMenu: { tab: TabMeta; x: number; y: number } | null = $state(null);
  let contextMenuEl: HTMLDivElement | undefined = $state();

  let menuScrollEl: HTMLDivElement | undefined = $state();
  let menuScrollbarEl: HTMLDivElement | undefined = $state();
  let menuThumbEl: HTMLDivElement | undefined = $state();
  let menuThumbVisible = $state(false);
  let menuThumbRaf: number | undefined;
  let menuThumbFadeTimer: ReturnType<typeof setTimeout> | undefined;
  let menuDragging = false;
  let menuDragStartY = 0;
  let menuDragStartScrollTop = 0;

  function measureMenuThumb() {
    if (!menuScrollEl || !menuThumbEl) return;
    const { scrollTop, scrollHeight, clientHeight } = menuScrollEl;
    if (scrollHeight <= clientHeight + 1) {
      menuThumbVisible = false;
      return;
    }
    menuThumbVisible = true;
    const thumbH = Math.max((clientHeight / scrollHeight) * clientHeight, 24);
    const maxTravel = clientHeight - thumbH;
    const maxScroll = scrollHeight - clientHeight;
    const top = maxScroll > 0 ? (scrollTop / maxScroll) * maxTravel : 0;
    menuThumbEl.style.height = `${thumbH}px`;
    menuThumbEl.style.transform = `translateY(${top}px)`;
  }

  function flashMenuThumb() {
    measureMenuThumb();
    if (!menuThumbVisible) return;
    if (menuThumbFadeTimer) clearTimeout(menuThumbFadeTimer);
    menuThumbEl?.style.setProperty("opacity", "0.85");
    menuThumbFadeTimer = setTimeout(() => {
      if (!menuDragging) menuThumbEl?.style.setProperty("opacity", "0");
    }, 700);
  }

  function handleMenuScroll() {
    flashMenuThumb();
  }

  function handleMenuWheel() {
    flashMenuThumb();
  }

  function handleThumbDown(e: MouseEvent) {
    if (!menuScrollEl) return;
    e.preventDefault();
    e.stopPropagation();
    menuDragging = true;
    menuDragStartY = e.clientY;
    menuDragStartScrollTop = menuScrollEl.scrollTop;
    menuThumbEl?.style.setProperty("opacity", "0.85");
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleThumbMove);
    window.addEventListener("mouseup", handleThumbUp);
  }

  function handleThumbMove(e: MouseEvent) {
    if (!menuScrollEl || !menuThumbEl) return;
    const thumbH = menuThumbEl.offsetHeight;
    const maxTravel = menuScrollEl.clientHeight - thumbH;
    if (maxTravel <= 0) return;
    const maxScroll = menuScrollEl.scrollHeight - menuScrollEl.clientHeight;
    const delta = ((e.clientY - menuDragStartY) / maxTravel) * maxScroll;
    menuScrollEl.scrollTop = Math.min(Math.max(menuDragStartScrollTop + delta, 0), maxScroll);
  }

  function handleThumbUp() {
    menuDragging = false;
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", handleThumbMove);
    window.removeEventListener("mouseup", handleThumbUp);
    if (menuThumbFadeTimer) clearTimeout(menuThumbFadeTimer);
    menuThumbFadeTimer = setTimeout(() => menuThumbEl?.style.setProperty("opacity", "0"), 400);
  }

  function handleContextMenu(tab: TabMeta, e: MouseEvent) {
    const menuWidth = 220;
    const menuHeight = 260;
    contextMenu = {
      tab,
      x: Math.min(e.clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(e.clientY, window.innerHeight - menuHeight - 8),
    };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  $effect(() => {
    if (!contextMenu) return;
    function handlePointerDown(e: MouseEvent) {
      if (contextMenuEl?.contains(e.target as Node)) return;
      closeContextMenu();
    }
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") closeContextMenu();
    }
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("blur", closeContextMenu);
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("blur", closeContextMenu);
      window.removeEventListener("keydown", handleKeydown);
    };
  });

  function contextClose() {
    if (!contextMenu) return;
    onClose(contextMenu.tab.id);
    closeContextMenu();
  }

  function contextCloseOthers() {
    if (!contextMenu) return;
    const id = contextMenu.tab.id;
    onCloseMultiple(tabList.filter((t) => t.id !== id).map((t) => t.id));
    closeContextMenu();
  }

  function contextCloseToRight() {
    if (!contextMenu) return;
    const idx = tabList.findIndex((t) => t.id === contextMenu!.tab.id);
    onCloseMultiple(tabList.slice(idx + 1).map((t) => t.id));
    closeContextMenu();
  }

  function contextCloseToLeft() {
    if (!contextMenu) return;
    const idx = tabList.findIndex((t) => t.id === contextMenu!.tab.id);
    onCloseMultiple(tabList.slice(0, idx).map((t) => t.id));
    closeContextMenu();
  }

  function contextCloseAll() {
    onCloseMultiple(tabList.map((t) => t.id));
    closeContextMenu();
  }

  function contextCopyPath() {
    if (!contextMenu) return;
    const value = contextMenu.tab.path ?? contextMenu.tab.sourceUrl;
    if (value) navigator.clipboard.writeText(value);
    closeContextMenu();
  }

  function contextCopyFileName() {
    if (!contextMenu) return;
    navigator.clipboard.writeText(contextMenu.tab.title);
    closeContextMenu();
  }

  const SCROLL_STEP = 200;

  function updateScrollState() {
    if (!tabsTrackEl) {
      canScrollLeft = false;
      canScrollRight = false;
      return;
    }
    const el = tabsTrackEl;
    canScrollLeft = el.scrollLeft > 1;
    canScrollRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
  }

  function checkOverflow() {
    if (!tabsTrackEl) return;
    overflowing = tabsTrackEl.scrollWidth > tabsTrackEl.clientWidth + 1;
    updateScrollState();
  }

  function scrollTabs(direction: -1 | 1) {
    if (!tabsTrackEl) return;
    tabsTrackEl.scrollBy({
      left: direction * SCROLL_STEP,
      behavior: "smooth",
    });
  }

  function scrollToActive() {
    if (!tabsTrackEl) return;
    const el = tabsTrackEl;
    const activeItem = el.querySelector<HTMLElement>(".tab.active");
    if (!activeItem) return;
    const elRect = el.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();
    let delta = 0;
    if (itemRect.right > elRect.right - 4) {
      delta = itemRect.right - elRect.right + 4;
    } else if (itemRect.left < elRect.left + 4) {
      delta = itemRect.left - elRect.left - 4;
    }
    if (delta !== 0) el.scrollBy({ left: delta, behavior: "smooth" });
  }

  $effect(() => {
    // Re-check whenever the tab list changes (add/remove/rename).
    tabList;
    queueMicrotask(checkOverflow);
  });

  // Keep the active tab in view when it changes, so selecting a partly-clipped
  // tab (or one revealed by overflow scrolling) brings it fully into view.
  $effect(() => {
    activeTabId;
    queueMicrotask(scrollToActive);
  });

  $effect(() => {
    if (!tabsTrackEl) return;
    const el = tabsTrackEl;
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);
    const onScroll = () => updateScrollState();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  });

  $effect(() => {
    if (!menuOpen) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (menuEl?.contains(target) || overflowBtnEl?.contains(target)) return;
      menuOpen = false;
    }
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") menuOpen = false;
    }
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeydown);
    };
  });

  // Custom overlay scrollbar for the tab menu -- WKWebView ignores
  // ::-webkit-scrollbar styling under overlay-scroll mode, so we drive a thumb
  // element manually (same approach as the editor's customScrollbar plugin).
  $effect(() => {
    if (!menuOpen || !menuScrollEl || !menuScrollbarEl || !menuThumbEl) return;
    const scrollEl = menuScrollEl;
    const thumbEl = menuThumbEl;

    measureMenuThumb();
    const ro = new ResizeObserver(measureMenuThumb);
    ro.observe(scrollEl);
    ro.observe(scrollEl.firstElementChild as HTMLElement);
    scrollEl.addEventListener("scroll", handleMenuScroll, { passive: true });
    scrollEl.addEventListener("wheel", handleMenuWheel, { passive: true });
    thumbEl.addEventListener("mousedown", handleThumbDown);
    return () => {
      ro.disconnect();
      scrollEl.removeEventListener("scroll", handleMenuScroll);
      scrollEl.removeEventListener("wheel", handleMenuWheel);
      thumbEl.removeEventListener("mousedown", handleThumbDown);
      if (menuThumbFadeTimer) clearTimeout(menuThumbFadeTimer);
      if (menuThumbRaf !== undefined) cancelAnimationFrame(menuThumbRaf);
    };
  });

  function selectFromMenu(id: string) {
    onSelect(id);
    menuOpen = false;
  }

  // File drop from the OS (Finder) -- separate from internal tab reordering.
  function handleExternalDrop(e: DragEvent) {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    const paths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const name = f.name;
      const path = (f as any).path;
      if (path && /\.(md|markdown)$/i.test(name)) paths.push(path);
    }
    if (paths.length) onDropFiles?.(paths);
  }

  function handleExternalDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }

  // Double-click on the tab bar's empty space (the track or bar padding, not a
  // tab or button) opens a new tab -- matches the convention in most editors.
  function handleBarDblClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (t === tabBarEl || t === tabsTrackEl) onNew();
  }
</script>

  <div
    class="tab-bar"
    bind:this={tabBarEl}
    ondblclick={handleBarDblClick}
    ondragover={handleExternalDragOver}
    ondrop={handleExternalDrop}
    role="presentation"
  >
    <div
      class="tabs-track"
      bind:this={tabsTrackEl}
      use:dndzone={{ items: dndItems, flipDurationMs: FLIP_MS, type: "tab", dropTargetStyle: {} }}
      onconsider={handleDndConsider}
      onfinalize={handleDndFinalize}
    >
      {#each dndItems as tab (tab.id)}
        <div class="tab-wrap" animate:flip={{ duration: FLIP_MS }}>
          <TabItem
            {tab}
            active={tab.id === activeTabId}
            onSelect={() => onSelect(tab.id)}
            onClose={() => onClose(tab.id)}
            onContextMenu={(e) => handleContextMenu(tab, e)}
          />
        </div>
      {/each}
    </div>

  {#if overflowing}
    <div class="tab-overflow">
      <button
        class="scroll-btn"
        class:enabled={canScrollLeft}
        disabled={!canScrollLeft}
        onclick={() => scrollTabs(-1)}
        title={$messages.tabs.scrollLeft}
        aria-label={$messages.tabs.scrollLeft}
      >
        <Icon name="chevron-left" size={14} />
      </button>
      <button
        class="scroll-btn"
        class:enabled={canScrollRight}
        disabled={!canScrollRight}
        onclick={() => scrollTabs(1)}
        title={$messages.tabs.scrollRight}
        aria-label={$messages.tabs.scrollRight}
      >
        <Icon name="chevron-right" size={14} />
      </button>
      <div class="overflow-divider" aria-hidden="true"></div>
      <button
        bind:this={overflowBtnEl}
        class="overflow-btn"
        class:active={menuOpen}
        onclick={() => (menuOpen = !menuOpen)}
        title={$messages.tabs.showAll}
        aria-haspopup="true"
        aria-expanded={menuOpen}
      >
        <Icon name="chevron-down" size={14} />
      </button>
      {#if menuOpen}
        <div class="tab-menu" bind:this={menuEl} role="menu">
          <div class="tab-menu-scroll" bind:this={menuScrollEl}>
            {#each tabList as tab (tab.id)}
              <button
                class="tab-menu-item"
                class:active={tab.id === activeTabId}
                class:deleted={tab.isDeleted}
                role="menuitem"
                onclick={() => selectFromMenu(tab.id)}
              >
                <span class="tab-icon" aria-hidden="true"><Icon name={tab.kind === "settings" ? "settings" : "markdown"} size={13} /></span>
                <span class="tab-menu-title">{tab.title}{tab.isDeleted ? ` ${$messages.tabs.deleted}` : ""}</span>
                {#if tab.isDirty}
                  <span class="dirty-dot" aria-hidden="true"></span>
                {/if}
              </button>
            {/each}
          </div>
          <div class="tab-menu-scrollbar" class:hidden={!menuThumbVisible} bind:this={menuScrollbarEl} aria-hidden="true">
            <div class="tab-menu-scrollbar-thumb" bind:this={menuThumbEl}></div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <button class="new-tab" onclick={onNew} title={fill($messages.tabs.newTab, { shortcut: shortcut(["N"]) })}>
    <Icon name="plus" size={14} />
  </button>

  {#if contextMenu}
    {@const idx = tabList.findIndex((t) => t.id === contextMenu!.tab.id)}
    {@const location = contextMenu.tab.path ?? contextMenu.tab.sourceUrl}
    <div
      class="tab-context-menu"
      bind:this={contextMenuEl}
      style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
      role="menu"
      transition:fade={{ duration: 80 }}
    >
      <button class="context-item" role="menuitem" onclick={contextClose}>{$messages.tabs.close}</button>
      {#if tabList.length > 1}
        <button class="context-item" role="menuitem" onclick={contextCloseOthers}>{$messages.tabs.closeOthers}</button>
      {/if}
      {#if idx > 0}
        <button class="context-item" role="menuitem" onclick={contextCloseToLeft}>{$messages.tabs.closeLeft}</button>
      {/if}
      {#if idx < tabList.length - 1}
        <button class="context-item" role="menuitem" onclick={contextCloseToRight}>{$messages.tabs.closeRight}</button>
      {/if}
      {#if tabList.length > 1}
        <button class="context-item" role="menuitem" onclick={contextCloseAll}>{$messages.tabs.closeAll}</button>
      {/if}
      {#if location}
        <div class="context-separator"></div>
        <button class="context-item" role="menuitem" onclick={contextCopyPath}>
          {contextMenu.tab.path ? $messages.tabs.copyPath : $messages.tabs.copyLink}
        </button>
        <button class="context-item" role="menuitem" onclick={contextCopyFileName}>{$messages.tabs.copyFileName}</button>
      {/if}
    </div>
  {/if}
</div>
