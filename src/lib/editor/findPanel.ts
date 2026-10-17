import {
  SearchQuery,
  closeSearchPanel,
  getSearchQuery,
  openSearchPanel,
  search,
  searchPanelOpen,
  setSearchQuery,
} from "@codemirror/search";
import { Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap, type Panel, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { applyPreviewFind, clearPreviewFind, selectedFindText, type TextQuery } from "../preview/previewFind";

// The editor column is display:none in Read, so preview marks use this surface.
export interface FindSurface {
  mode(): "source" | "split" | "preview";
  article(): HTMLElement | null;
  scroller(): HTMLElement | null;
}

export interface FindSnap {
  open: boolean;
  search: string;
  replace: string;
  caseSensitive: boolean;
  regexp: boolean;
  wholeWord: boolean;
  readOnly: boolean;
  focus: boolean;
}

type FindListener = (snap: FindSnap) => void;

let surface: FindSurface | null = null;
let activeView: EditorView | null = null;
let wantsReveal = false;
let lastSnap: FindSnap | null = null;
let publishQueued = false;
let queuedFocus = false;
const listeners = new Set<FindListener>();

export function bindFindSurface(next: FindSurface | null) {
  surface = next;
}

export function watchFind(listener: FindListener): () => void {
  listeners.add(listener);
  if (lastSnap) listener({ ...lastSnap, focus: false });
  return () => listeners.delete(listener);
}

// Preview rebuilds its DOM on each edit, which wipes the marks.
export function syncPreviewFind() {
  paintPreview();
  if (!wantsReveal) return;
  wantsReveal = false;
  revealPreview();
}

export function syncFindBar(view: EditorView) {
  activeView = view;
  publish(false);
}

export function openFind(view: EditorView): boolean {
  activeView = view;
  const prev = getSearchQuery(view.state);
  const active = view.root.activeElement;
  const typing = active instanceof Element && !!active.closest(".find-float");
  let searchText = prev.search;
  if (!typing) {
    const main = view.state.selection.main;
    const picked = selectedFindText(view.state.sliceDoc(main.from, main.to));
    if (picked) searchText = picked;
  }
  const next = queryFrom({
    search: searchText,
    replace: prev.replace,
    caseSensitive: prev.caseSensitive,
    regexp: prev.regexp,
    wholeWord: prev.wholeWord,
  });
  // Highlights exist only while CodeMirror thinks its panel is open.
  if (!searchPanelOpen(view.state)) openSearchPanel(view);
  if (!getSearchQuery(view.state).eq(next)) view.dispatch({ effects: setSearchQuery.of(next) });
  paintPreview();
  publish(true);
  return true;
}

export function closeFind(view: EditorView) {
  activeView = view;
  wantsReveal = false;
  const reading = surface?.mode() === "preview";
  closeSearchPanel(view);
  const article = surface?.article();
  if (article) clearPreviewFind(article);
  publish(false);
  if (reading) surface?.scroller()?.focus({ preventScroll: true });
  else view.focus();
}

export function applyFindQuery(view: EditorView, fields: TextQuery & { replace: string }) {
  activeView = view;
  const next = queryFrom(fields);
  if (!searchPanelOpen(view.state)) openSearchPanel(view);
  if (!getSearchQuery(view.state).eq(next)) view.dispatch({ effects: setSearchQuery.of(next) });
  else paintPreview();
}

export function findExtension(): Extension {
  return [
    search({
      top: true,
      createPanel: () => hiddenPanel(),
      scrollToMatch: (range) => EditorView.scrollIntoView(range, { y: "center" }),
    }),
    Prec.high(keymap.of([{ key: "Mod-f", run: openFind }])),
    findBridge,
  ];
}

const findBridge = ViewPlugin.fromClass(
  class {
    constructor(private readonly view: EditorView) {
      activeView = view;
    }

    update(update: ViewUpdate) {
      activeView = update.view;
      const wasOpen = searchPanelOpen(update.startState);
      const isOpen = searchPanelOpen(update.state);
      if (!wasOpen && !isOpen) return;
      const queryChanged = !getSearchQuery(update.startState).eq(getSearchQuery(update.state));
      if (!isOpen) {
        const article = surface?.article();
        if (article) clearPreviewFind(article);
      } else if (queryChanged || update.docChanged) {
        paintPreview();
      }
      const nav = update.transactions.some(
        (tr) =>
          tr.isUserEvent("select.search") || (tr.isUserEvent("input.replace") && !tr.isUserEvent("input.replace.all")),
      );
      if (nav) {
        if ((surface?.mode() ?? "source") === "source" || !update.docChanged) revealPreview();
        else wantsReveal = true;
      }
      if (wasOpen !== isOpen || queryChanged || update.docChanged || update.selectionSet) publish(false);
    }

    destroy() {
      if (activeView === this.view) activeView = null;
    }
  },
);

function hiddenPanel(): Panel {
  const dom = document.createElement("div");
  dom.className = "find-sentinel";
  dom.hidden = true;
  return { dom, top: true };
}

function queryFrom(fields: TextQuery & { replace: string }): SearchQuery {
  return new SearchQuery({
    search: fields.search,
    replace: fields.replace,
    caseSensitive: fields.caseSensitive,
    regexp: fields.regexp,
    wholeWord: fields.wholeWord,
  });
}

function publish(focus: boolean) {
  if (!activeView) return;
  queuedFocus = focus;
  if (publishQueued) return;
  publishQueued = true;
  const view = activeView;
  queueMicrotask(() => {
    publishQueued = false;
    const focusNow = queuedFocus;
    if (!activeView || activeView !== view) return;
    const query = getSearchQuery(view.state);
    const snap: FindSnap = {
      open: searchPanelOpen(view.state),
      search: query.search,
      replace: query.replace,
      caseSensitive: query.caseSensitive,
      regexp: query.regexp,
      wholeWord: query.wholeWord,
      readOnly: view.state.readOnly,
      focus: focusNow,
    };
    lastSnap = snap;
    for (const listener of listeners) listener(snap);
  });
}

function paintPreview() {
  const article = surface?.article();
  const view = activeView;
  if (!article || !view || (surface?.mode() ?? "source") === "source") return;
  if (!searchPanelOpen(view.state)) {
    clearPreviewFind(article);
    return;
  }
  const query = getSearchQuery(view.state);
  applyPreviewFind(article, {
    search: query.search,
    caseSensitive: query.caseSensitive,
    regexp: query.regexp,
    wholeWord: query.wholeWord,
  });
}

// shortcut: the current preview mark is the rendered word on the source line, not a source-offset map. Upgrade when Read needs replace of the exact rendered hit.
function revealPreview() {
  const article = surface?.article();
  const scroller = surface?.scroller();
  const view = activeView;
  if (!article || !scroller || !view || (surface?.mode() ?? "source") === "source") return;
  for (const mark of article.querySelectorAll(".md-find-current")) mark.classList.remove("md-find-current");
  const sel = view.state.selection.main;
  if (sel.empty) return;
  const line = String(view.state.doc.lineAt(sel.from).number);
  const selected = view.state.sliceDoc(sel.from, sel.to);
  const marks = [...article.querySelectorAll<HTMLElement>("mark.md-find")].filter(
    (mark) => mark.closest("[data-line]")?.getAttribute("data-line") === line,
  );
  const hit = marks.find((mark) => mark.textContent === selected) ?? marks[0];
  const target = hit ?? article.querySelector<HTMLElement>(`[data-line="${line}"]`);
  if (hit) {
    const id = hit.dataset.find ?? "";
    for (const mark of article.querySelectorAll(`mark.md-find[data-find="${id}"]`)) {
      mark.classList.add("md-find-current");
    }
  }
  const bar = view.dom.closest(".workspace")?.querySelector(".find-float");
  if (target) scrollMatchIntoView(scroller, bar instanceof HTMLElement ? bar : null, target);
}

function scrollMatchIntoView(scroller: HTMLElement, bar: HTMLElement | null, target: HTMLElement) {
  const pane = scroller.getBoundingClientRect();
  const match = target.getBoundingClientRect();
  const float = bar?.getBoundingClientRect();
  const overlaps = !!float && float.bottom > pane.top && float.top < pane.bottom;
  let viewTop = pane.top + 8;
  let viewBottom = pane.bottom - 12;
  if (overlaps && float && float.top < pane.top + pane.height / 2) viewTop = Math.min(float.bottom + 8, pane.bottom - 48);
  if (overlaps && float && float.bottom > pane.top + pane.height / 2) viewBottom = Math.max(float.top - 8, pane.top + 48);
  if (viewBottom <= viewTop) return;
  if (match.top >= viewTop && match.bottom <= viewBottom) return;
  const delta = match.top < viewTop ? match.top - viewTop : match.bottom - viewBottom;
  scroller.scrollTop += delta;
}
