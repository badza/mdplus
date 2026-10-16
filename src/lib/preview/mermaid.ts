import { get } from "svelte/store";
import { messages } from "../i18n";
import { recentlyScrolled } from "../scrollActivity";

// One render at a time. mermaid.render shares a DOM node internally, and two
// overlapping calls (a fence in the editor and the same fence in the preview)
// clobber each other's ids.
let tail: Promise<unknown> = Promise.resolve();
// The first diagram used to pay for loading mermaid in the middle of a scroll.
void import("mermaid");
let themeKey = "";
let sequence = 0;
const svgCache = new Map<string, string>();

function cacheKey(source: string, dark: boolean): string {
  return `${dark ? "d" : "l"}\n${source}`;
}

// A diagram that was already drawn. Split view and tab switches reuse this
// instead of blanking the figure while mermaid renders again.
export function peekMermaidSvg(source: string, dark: boolean): string | null {
  return svgCache.get(cacheKey(source, dark)) ?? null;
}

function rememberSvg(source: string, dark: boolean, svg: string) {
  const key = cacheKey(source, dark);
  if (svgCache.has(key)) svgCache.delete(key);
  svgCache.set(key, svg);
  if (svgCache.size > 40) {
    const oldest = svgCache.keys().next().value;
    if (oldest) svgCache.delete(oldest);
  }
}

export function renderMermaidSvg(source: string, dark: boolean): Promise<string> {
  const job = tail.then(() => draw(source, dark));
  tail = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}

// Drop an SVG into a host that is already on screen. The diagram is often
// at the end of the file and still empty while the user scrolls; when the
// picture arrives, the browser and the editor try to stay glued to the
// bottom and the page jumps. Put the scroll offset back.
export function paintDiagram(host: HTMLElement, fill: () => void): void {
  const scroller = scrollParent(host);
  if (!scroller) {
    fill();
    return;
  }
  if (recentlyScrolled(scroller)) {
    const wait = () => {
      if (!host.isConnected) return;
      if (recentlyScrolled(scroller)) {
        requestAnimationFrame(wait);
        return;
      }
      paintDiagram(host, fill);
    };
    requestAnimationFrame(wait);
    return;
  }
  const before = scroller.scrollTop;
  const above = host.getBoundingClientRect().top < scroller.getBoundingClientRect().top - 1;
  const heightBefore = host.offsetHeight;
  fill();
  const delta = host.offsetHeight - heightBefore;
  const restore = () => {
    if (!host.isConnected || !delta) return;
    const moved = scroller.scrollTop - before;
    // Only undo the jump that matches the diagram's growth. A real scroll
    // in the same moment moves by a different amount and is left alone.
    if (above) {
      if (Math.abs(moved - delta) < 8) scroller.scrollTop = before + delta;
      return;
    }
    if (moved > 1 && Math.abs(moved - delta) < 8) scroller.scrollTop = before;
  };
  restore();
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
}

function scrollParent(node: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = node.parentElement;
  while (el) {
    const overflow = getComputedStyle(el).overflowY;
    if (overflow === "auto" || overflow === "scroll") return el;
    el = el.parentElement;
  }
  return null;
}

export function mermaidErrorText(err: unknown): string {
  const fallback = get(messages).preview.diagramFailed;
  const raw = err instanceof Error && err.message ? err.message : fallback;
  const line = raw
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean);
  return (line ?? fallback).replace(/^Error:\s*/, "");
}

async function draw(source: string, dark: boolean): Promise<string> {
  const mermaid = (await import("mermaid")).default;
  const key = dark ? "dark" : "light";
  if (themeKey !== key) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      htmlLabels: false,
      logLevel: "fatal",
      look: "classic",
      // A comma in the family list is split by mermaid's style builder.
      fontFamily: "system-ui",
      theme: "base",
      themeVariables: dark ? darkVariables : lightVariables,
    });
    themeKey = key;
  }
  const id = `mdplus-mmd-${++sequence}`;
  try {
    const { svg } = await mermaid.render(id, source);
    rememberSvg(source, dark, svg);
    return svg;
  } catch (err) {
    document.getElementById(id)?.remove();
    throw err;
  }
}

const lightVariables = {
  background: "transparent",
  fontFamily: "system-ui",
  primaryColor: "#f6f6f6",
  secondaryColor: "#f3f3f3",
  tertiaryColor: "#ffffff",
  primaryTextColor: "#262626",
  secondaryTextColor: "#262626",
  tertiaryTextColor: "#262626",
  primaryBorderColor: "#e3e3e3",
  secondaryBorderColor: "#e3e3e3",
  tertiaryBorderColor: "#e3e3e3",
  lineColor: "#b5b5b5",
  textColor: "#262626",
  titleColor: "#262626",
  mainBkg: "#f6f6f6",
  nodeBorder: "#e0e0e0",
  nodeTextColor: "#262626",
  clusterBkg: "#fafafa",
  clusterBorder: "#e6e6e6",
  defaultLinkColor: "#8f8f8f",
  edgeLabelBackground: "#ffffff",
  actorBkg: "#f6f6f6",
  actorBorder: "#e0e0e0",
  actorTextColor: "#262626",
  signalColor: "#8a8a8a",
  signalTextColor: "#262626",
  labelBoxBkgColor: "#f7f7f7",
  labelBoxBorderColor: "#e4e4e4",
  labelTextColor: "#262626",
  noteBkgColor: "#faf6f5",
  noteTextColor: "#262626",
  noteBorderColor: "#ead9d6",
  activationBkgColor: "#f3f3f3",
  activationBorderColor: "#e0e0e0",
};

const darkVariables = {
  background: "transparent",
  fontFamily: "system-ui",
  primaryColor: "#2a2a2a",
  secondaryColor: "#242424",
  tertiaryColor: "#1f1f1f",
  primaryTextColor: "#e6e6e6",
  secondaryTextColor: "#e6e6e6",
  tertiaryTextColor: "#e6e6e6",
  primaryBorderColor: "#3c3c3c",
  secondaryBorderColor: "#3c3c3c",
  tertiaryBorderColor: "#3c3c3c",
  lineColor: "#6e6e6e",
  textColor: "#e6e6e6",
  titleColor: "#e6e6e6",
  mainBkg: "#2a2a2a",
  nodeBorder: "#3c3c3c",
  nodeTextColor: "#e6e6e6",
  clusterBkg: "#232323",
  clusterBorder: "#3a3a3a",
  defaultLinkColor: "#8a8a8a",
  edgeLabelBackground: "#1c1c1c",
  actorBkg: "#2a2a2a",
  actorBorder: "#3c3c3c",
  actorTextColor: "#e6e6e6",
  signalColor: "#9a9a9a",
  signalTextColor: "#e6e6e6",
  labelBoxBkgColor: "#2a2a2a",
  labelBoxBorderColor: "#3c3c3c",
  labelTextColor: "#e6e6e6",
  noteBkgColor: "#2c2626",
  noteTextColor: "#e6e6e6",
  noteBorderColor: "#5c403c",
  activationBkgColor: "#333333",
  activationBorderColor: "#4a4a4a",
};
