<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import {
    findNext,
    findPrevious,
    getSearchQuery,
    replaceAll,
    replaceNext,
    searchPanelOpen,
  } from "@codemirror/search";
  import type { EditorView } from "@codemirror/view";
  import { applyFindQuery, closeFind, watchFind, type FindSnap } from "../editor/findPanel";
  import { fill, messages } from "../i18n";
  import type { ViewMode } from "../ipc/settings";
  import { collectMatches } from "../preview/previewFind";
  import Icon from "./Icon.svelte";

  let { getView, viewMode }: { getView: () => EditorView | undefined; viewMode: ViewMode } = $props();

  let open = $state(false);
  let search = $state("");
  let replace = $state("");
  let caseSensitive = $state(false);
  let regexp = $state(false);
  let wholeWord = $state(false);
  let readOnly = $state(false);
  let replaceOpen = $state(false);
  let countText = $state("");
  let countNone = $state(false);
  let dragging = $state(false);
  let placedLeft = $state<number | null>(null);
  let placedTop = $state<number | null>(null);

  let floatEl = $state<HTMLDivElement | undefined>();
  let searchEl = $state<HTMLInputElement | undefined>();
  let replaceEl = $state<HTMLInputElement | undefined>();
  let stopDrag: (() => void) | null = null;

  const canReplace = $derived(viewMode !== "preview" && !readOnly);

  function onSnap(snap: FindSnap) {
    const active = document.activeElement;
    const typing = active instanceof HTMLInputElement && !!floatEl?.contains(active);
    open = snap.open;
    readOnly = snap.readOnly;
    if (snap.focus || !typing) {
      search = snap.search;
      replace = snap.replace;
      caseSensitive = snap.caseSensitive;
      regexp = snap.regexp;
      wholeWord = snap.wholeWord;
    }
    refreshCount();
    if (!snap.focus) return;
    tick().then(() => {
      searchEl?.focus();
      searchEl?.select();
    });
  }

  onMount(() => watchFind(onSnap));

  onDestroy(() => stopDrag?.());

  $effect(() => {
    if (!open) return;
    const onResize = () => clampToHost();
    window.addEventListener("resize", onResize);
    queueMicrotask(clampToHost);
    return () => window.removeEventListener("resize", onResize);
  });

  // Listeners stay off the template so the drag chrome is not treated as a control.
  $effect(() => {
    const root = floatEl;
    if (!root) return;
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("dblclick", recenter);
    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("dblclick", recenter);
      root.removeEventListener("keydown", onKeyDown);
    };
  });

  function commit() {
    const view = getView();
    if (!view) return;
    applyFindQuery(view, { search, replace, caseSensitive, regexp, wholeWord });
    refreshCount();
  }

  function onSearchInput(event: Event) {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    search = input.value;
    commit();
  }

  function onReplaceInput(event: Event) {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    replace = input.value;
    commit();
  }

  function toggleFlag(flag: "case" | "re" | "word") {
    if (flag === "case") caseSensitive = !caseSensitive;
    else if (flag === "re") regexp = !regexp;
    else wholeWord = !wholeWord;
    commit();
  }

  function refreshCount() {
    const view = getView();
    const copy = $messages.find;
    if (!view || !searchPanelOpen(view.state)) {
      countText = "";
      countNone = false;
      return;
    }
    const query = getSearchQuery(view.state);
    if (!query.search || !query.valid) {
      countText = "";
      countNone = false;
      return;
    }
    const ranges = collectMatches(query.getCursor(view.state), 2001);
    const more = ranges.length > 2000;
    const total = more ? 2000 : ranges.length;
    if (total === 0) {
      countText = copy.none;
      countNone = true;
      return;
    }
    countNone = false;
    const sel = view.state.selection.main;
    const index = ranges.findIndex((range) => range.from === sel.from && range.to === sel.to);
    const shown = more ? `${total}+` : String(total);
    countText = index >= 0 && !more ? fill(copy.count, { current: index + 1, total }) : fill(copy.total, { total: shown });
  }

  function run(command: (view: EditorView) => boolean) {
    const view = getView();
    if (!view) return;
    const current = document.activeElement;
    command(view);
    if (current instanceof HTMLElement && floatEl?.contains(current)) current.focus();
    refreshCount();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    const view = getView();
    if (!view) return;
    if (event.target === searchEl) {
      event.preventDefault();
      (event.shiftKey ? findPrevious : findNext)(view);
    } else if (event.target === replaceEl) {
      event.preventDefault();
      replaceNext(view);
      replaceEl?.focus();
    }
  }

  function keepFocus(event: MouseEvent) {
    event.preventDefault();
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest("input, button, a, label, .find-field")) return;
    const root = floatEl;
    const host = root?.closest(".workspace");
    if (!root || !(host instanceof HTMLElement)) return;
    event.preventDefault();
    const hostRect = host.getBoundingClientRect();
    const rect = root.getBoundingClientRect();
    const originLeft = rect.left - hostRect.left;
    const originTop = rect.top - hostRect.top;
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 3) return;
      dragging = true;
      const maxX = Math.max(0, host.clientWidth - root.offsetWidth);
      const maxY = Math.max(0, host.clientHeight - root.offsetHeight);
      placedLeft = clamp(originLeft + ev.clientX - startX, 0, maxX);
      placedTop = clamp(originTop + ev.clientY - startY, 0, maxY);
    };
    const up = () => {
      dragging = false;
      stopDrag = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    stopDrag?.();
    stopDrag = up;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function recenter(event: MouseEvent) {
    const target = event.target;
    if (target instanceof Element && target.closest("input, button, a, label, .find-field")) return;
    placedLeft = null;
    placedTop = null;
  }

  function clampToHost() {
    const root = floatEl;
    const host = root?.parentElement;
    if (!root || !host || placedLeft == null || placedTop == null) return;
    placedLeft = clamp(placedLeft, 0, Math.max(0, host.clientWidth - root.offsetWidth));
    placedTop = clamp(placedTop, 0, Math.max(0, host.clientHeight - root.offsetHeight));
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  const grip =
    '<svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" aria-hidden="true"><circle cx="2" cy="2" r="1"/><circle cx="6" cy="2" r="1"/><circle cx="2" cy="7" r="1"/><circle cx="6" cy="7" r="1"/><circle cx="2" cy="12" r="1"/><circle cx="6" cy="12" r="1"/></svg>';
</script>

{#if open}
  <div
    class="find-float"
    class:is-placed={placedLeft != null && placedTop != null}
    class:is-dragging={dragging}
    style={placedLeft == null || placedTop == null ? undefined : `left: ${placedLeft}px; top: ${placedTop}px`}
    role="search"
    bind:this={floatEl}
  >
    <div class="find-line">
      <span class="find-grip" title={$messages.find.drag}>{@html grip}</span>
      {#if canReplace}
        <button
          type="button"
          class="find-icon find-toggle"
          aria-expanded={replaceOpen}
          aria-label={$messages.find.replace}
          title={$messages.find.replace}
          onmousedown={keepFocus}
          onclick={() => (replaceOpen = !replaceOpen)}
        >
          <Icon name={replaceOpen ? "chevron-down" : "chevron-right"} size={14} />
        </button>
      {/if}
      <div class="find-field">
        <input
          class="find-input"
          type="text"
          name="search"
          placeholder={$messages.find.placeholder}
          aria-label={$messages.find.placeholder}
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          bind:this={searchEl}
          bind:value={search}
          oninput={onSearchInput}
        />
        <span class="find-count" class:is-none={countNone} aria-live="polite">{countText}</span>
        <button
          type="button"
          class="find-chip"
          class:is-on={caseSensitive}
          aria-pressed={caseSensitive}
          title={$messages.find.matchCase}
          onmousedown={keepFocus}
          onclick={() => toggleFlag("case")}
        >Cc</button>
        <button
          type="button"
          class="find-chip"
          class:is-on={wholeWord}
          aria-pressed={wholeWord}
          title={$messages.find.wholeWord}
          onmousedown={keepFocus}
          onclick={() => toggleFlag("word")}
        >W</button>
        <button
          type="button"
          class="find-chip"
          class:is-on={regexp}
          aria-pressed={regexp}
          title={$messages.find.regexp}
          onmousedown={keepFocus}
          onclick={() => toggleFlag("re")}
        >.*</button>
      </div>
      <button
        type="button"
        class="find-icon"
        aria-label={$messages.find.previous}
        title={$messages.find.previous}
        onmousedown={keepFocus}
        onclick={() => run(findPrevious)}
      >
        <span class="find-up"><Icon name="chevron-down" size={14} /></span>
      </button>
      <button
        type="button"
        class="find-icon"
        aria-label={$messages.find.next}
        title={$messages.find.next}
        onmousedown={keepFocus}
        onclick={() => run(findNext)}
      >
        <Icon name="chevron-down" size={14} />
      </button>
      <button
        type="button"
        class="find-icon"
        aria-label={$messages.find.close}
        title={$messages.find.close}
        onmousedown={keepFocus}
        onclick={() => {
          const view = getView();
          if (view) closeFind(view);
        }}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
    {#if canReplace && replaceOpen}
      <div class="find-line">
        <span class="find-grip" aria-hidden="true"></span>
        <span class="find-toggle-spacer" aria-hidden="true"></span>
        <div class="find-field">
          <input
            class="find-input"
            type="text"
            name="replace"
            placeholder={$messages.find.replacePlaceholder}
            aria-label={$messages.find.replacePlaceholder}
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            bind:this={replaceEl}
            bind:value={replace}
            oninput={onReplaceInput}
          />
        </div>
        <button type="button" class="find-text" onmousedown={keepFocus} onclick={() => run(replaceNext)}>
          {$messages.find.replace}
        </button>
        <button type="button" class="find-text" onmousedown={keepFocus} onclick={() => run(replaceAll)}>
          {$messages.find.replaceAll}
        </button>
      </div>
    {/if}
  </div>
{/if}
