import { get } from "svelte/store";
import { messages } from "../i18n";
import { whenKatexFontsReady } from "./katexFonts";
import { codeLanguage, highlightCode } from "./highlight";
import { mermaidErrorText, peekMermaidSvg, renderMermaidSvg } from "./mermaid";
import { renderMarkdown } from "./renderMarkdown";
import { isLocalMachineUrl } from "../net";
import { resolveResourceUrl } from "./resources";

export interface DecorateOptions {
  dark: boolean;
  basePath: string | null;
  cancelled: () => boolean;
}

// Rebuild the preview off-screen, then swap it in. Diagrams and formula
// fonts finish first, so the first scroll does not grow them on screen.
// Unchanged diagrams keep the SVG node they already have.
export async function paintPreview(article: HTMLElement, markdown: string, options: DecorateOptions): Promise<void> {
  if (!markdown.trim()) {
    article.replaceChildren();
    return;
  }
  const next = document.createElement("div");
  next.innerHTML = renderMarkdown(markdown);
  const darkKey = options.dark ? "1" : "0";
  const pool = [...article.querySelectorAll<HTMLElement>(".md-mermaid")].filter(
    (host) => host.dataset.dark === darkKey && host.querySelector("svg"),
  );
  const jobs: Promise<void>[] = [];
  for (const code of [...next.querySelectorAll("pre > code")]) {
    const pre = code.parentElement;
    if (!pre || pre.tagName !== "PRE") continue;
    if (codeLanguage(code) !== "mermaid") continue;
    const source = code.textContent ?? "";
    const reused = pool.find((host) => host.dataset.src === source);
    if (reused) {
      // Copy the picture. Moving the live node out early would leave a hole
      // while any other diagram is still drawing.
      const copy = reused.cloneNode(true) as HTMLElement;
      const line = pre.dataset.line;
      if (line) copy.dataset.line = line;
      pre.replaceWith(copy);
      continue;
    }
    jobs.push(mountMermaid(pre, source, options, darkKey));
  }
  decoratePreview(next, options);
  if (next.querySelector(".katex")) jobs.push(whenKatexFontsReady());
  if (jobs.length) await Promise.all(jobs);
  if (options.cancelled()) return;
  article.replaceChildren(...next.childNodes);
}

// Point images at local files and highlight fenced code. Mermaid hosts are
// already in place when this runs from paintPreview.
export function decoratePreview(root: HTMLElement, options: DecorateOptions): void {
  for (const img of root.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    if (!src) continue;
    const resolved = resolveResourceUrl(src, options.basePath);
    // A note can point an image at a service on this machine. Don't request it.
    if (isLocalMachineUrl(resolved)) {
      img.removeAttribute("src");
      continue;
    }
    img.src = resolved;
  }

  for (const code of [...root.querySelectorAll("pre > code")]) {
    const pre = code.parentElement;
    if (!pre || pre.tagName !== "PRE") continue;
    const lang = codeLanguage(code);
    if (lang === "mermaid") continue;
    if (code instanceof HTMLElement) highlightCode(code, lang);
    wrapWithCopy(pre);
  }
}

function mountMermaid(pre: HTMLElement, source: string, options: DecorateOptions, darkKey: string): Promise<void> {
  const host = document.createElement("div");
  host.className = "md-mermaid";
  host.dataset.src = source;
  host.dataset.dark = darkKey;
  const line = pre.dataset.line;
  if (line) host.dataset.line = line;
  const cached = peekMermaidSvg(source, options.dark);
  pre.replaceWith(host);
  if (cached) {
    host.innerHTML = cached;
    return Promise.resolve();
  }
  // The host is still off-screen. Filling it here cannot move the scroll.
  return renderMermaidSvg(source, options.dark).then(
    (svg) => {
      if (options.cancelled()) return;
      host.innerHTML = svg;
    },
    (err: unknown) => {
      if (options.cancelled()) return;
      host.className = "md-mermaid-error";
      const message = document.createElement("p");
      message.textContent = mermaidErrorText(err);
      const shown = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = source;
      shown.append(code);
      host.replaceChildren(message, shown);
    },
  );
}

function wrapWithCopy(pre: HTMLElement): void {
  const wrap = document.createElement("div");
  wrap.className = "md-code";
  const line = pre.dataset.line;
  if (line) wrap.dataset.line = line;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "md-copy";
  button.textContent = get(messages).preview.copy;
  pre.replaceWith(wrap);
  wrap.append(button, pre);
}
