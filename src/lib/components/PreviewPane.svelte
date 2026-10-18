<script lang="ts">
  import { attachOverlayScrollbar } from "../editor/customScrollbar";
  import { syncPreviewFind } from "../editor/findPanel";
  import { messages } from "../i18n";
  import { get } from "svelte/store";
  import { paintPreview } from "../preview/decoratePreview";
  import { openExternal } from "../openExternal";
  import "katex/dist/katex.min.css";
  import { whenKatexFontsReady } from "../preview/katexFonts";
  import "../styles/preview.css";

  void whenKatexFontsReady();

  let {
    markdown,
    basePath = null,
    dark,
    solo = false,
    onToggleTask,
    onOpenRemote,
    root = $bindable(null),
  }: {
    markdown: string;
    basePath?: string | null;
    dark: boolean;
    solo?: boolean;
    onToggleTask: (line: number) => void;
    onOpenRemote?: (url: string) => void;
    root?: HTMLDivElement | null;
  } = $props();

  let article: HTMLElement | undefined;
  let shell = $state<HTMLDivElement | undefined>();

  // Same overlay thumb as the editor. The shell clips the native bar.
  $effect(() => {
    const scroller = root;
    const host = shell;
    if (!scroller || !host) return;
    const bar = attachOverlayScrollbar(scroller, host);
    return () => bar.destroy();
  });

  $effect(() => {
    const text = markdown;
    const isDark = dark;
    const base = basePath;
    void $messages.preview.copy;
    const host = article;
    if (!host) return;
    const token = { dead: false };
    // Paint on the next frame so a keystroke does not rebuild the preview
    // on the same turn as a scroll gesture in split view.
    const frame = requestAnimationFrame(() => {
      if (token.dead) return;
      void paintPreview(host, text, {
        dark: isDark,
        basePath: base,
        cancelled: () => token.dead,
      }).then(() => {
        if (!token.dead) syncPreviewFind();
      });
    });
    return () => {
      token.dead = true;
      cancelAnimationFrame(frame);
    };
  });

  // Clicks bubble from the real controls (checkbox, copy button, link). The
  // listener lives here so the pane itself is not an interactive widget.
  $effect(() => {
    const el = root;
    if (!el) return;
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  });

  function onClick(event: Event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const copy = target.closest(".md-copy");
    if (copy instanceof HTMLButtonElement) {
      event.preventDefault();
      const code = copy.parentElement?.querySelector("code")?.textContent ?? "";
      navigator.clipboard.writeText(code).then(
        () => {
          copy.textContent = get(messages).preview.copied;
        },
        () => {
          copy.textContent = get(messages).preview.copy;
        },
      );
      window.setTimeout(() => {
        if (copy.isConnected) copy.textContent = get(messages).preview.copy;
      }, 1200);
      return;
    }

    const box = target.closest('input[type="checkbox"]');
    if (box) {
      event.preventDefault();
      const line = Number(box.closest("[data-line]")?.getAttribute("data-line"));
      if (line) onToggleTask(line);
      return;
    }

    const link = target.closest("a");
    if (!link) return;
    const href = link.getAttribute("href") ?? "";
    event.preventDefault();
    if (href.startsWith("#")) {
      const id = href.slice(1);
      root?.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
      return;
    }
    const next = resolvedHref(href, basePath);
    // A markdown link inside a note that itself came from a URL opens as another tab.
    if (isRemoteBase(basePath) && isMarkdownLocation(next) && onOpenRemote) {
      onOpenRemote(next);
      return;
    }
    if (/^(https?:|mailto:)/i.test(next)) openExternal(next);
  }

  function resolvedHref(href: string, base: string | null): string {
    if (!isRemoteBase(base)) return href;
    try {
      return new URL(href, base).href;
    } catch {
      return href;
    }
  }

  function isRemoteBase(base: string | null | undefined): base is string {
    return !!base && /^https?:\/\//i.test(base);
  }

  function isMarkdownLocation(url: string): boolean {
    try {
      return /\.(?:md|markdown)$/i.test(new URL(url).pathname);
    } catch {
      return /\.(?:md|markdown)$/i.test(url.split(/[?#]/)[0] ?? "");
    }
  }
</script>

<div class="preview-shell" bind:this={shell}>
  <div class="preview-pane" tabindex="-1" bind:this={root}>
    <article class="preview-article" bind:this={article}></article>
    {#if solo && !markdown.trim()}
      <p class="preview-empty">{$messages.preview.empty}</p>
    {/if}
  </div>
</div>
