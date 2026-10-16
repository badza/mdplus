import type { EditorView } from "@codemirror/view";

// Block elements that carry a source line. Inline marks are ignored so a
// scroll frame never walks every <em> and <a> in the note.
const LINE_MARKS = "h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,aside,table,hr,.md-mermaid,.md-code";

export interface LineMark {
  line: number;
  top: number;
}

// One entry per source line, measured once when the preview changes.
// Scroll handling then interpolates this list instead of reading layout.
export function collectLineMarks(root: ParentNode, pane: HTMLElement): LineMark[] {
  const paneTop = pane.getBoundingClientRect().top;
  const scrollTop = pane.scrollTop;
  const tops = new Map<number, number>();
  for (const node of root.querySelectorAll<HTMLElement>(LINE_MARKS)) {
    const line = Number(node.dataset.line);
    if (!Number.isFinite(line) || line < 1) continue;
    const top = node.getBoundingClientRect().top - paneTop + scrollTop;
    const prev = tops.get(line);
    if (prev === undefined || top < prev) tops.set(line, top);
  }
  const marks: LineMark[] = [];
  for (const [line, top] of tops) marks.push({ line, top });
  marks.sort((a, b) => a.line - b.line);
  // Binary search assumes tops increase with the source line.
  const monotonic: LineMark[] = [];
  let lastTop = -Infinity;
  for (const mark of marks) {
    if (mark.top < lastTop) continue;
    monotonic.push(mark);
    lastTop = mark.top;
  }
  return monotonic;
}

export function offsetForLine(marks: LineMark[], linePos: number): number | null {
  if (marks.length === 0) return null;
  const first = marks[0];
  if (linePos <= first.line) return first.top;
  const last = marks[marks.length - 1];
  if (linePos >= last.line) return last.top;
  let lo = 0;
  let hi = marks.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (marks[mid].line <= linePos) lo = mid;
    else hi = mid;
  }
  const a = marks[lo];
  const b = marks[hi];
  const span = b.line - a.line;
  const t = span > 0 ? (linePos - a.line) / span : 0;
  return a.top + (b.top - a.top) * t;
}

export function lineForOffset(marks: LineMark[], offset: number): number | null {
  if (marks.length === 0) return null;
  const first = marks[0];
  if (offset <= first.top) return first.line;
  const last = marks[marks.length - 1];
  if (offset >= last.top) return last.line;
  let lo = 0;
  let hi = marks.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (marks[mid].top <= offset) lo = mid;
    else hi = mid;
  }
  const a = marks[lo];
  const b = marks[hi];
  const span = b.top - a.top;
  const t = span > 0 ? (offset - a.top) / span : 0;
  return a.line + (b.line - a.line) * t;
}

// Map the line-aligned offset into the follower's full scroll range so the
// top and the bottom of the two panes meet, and the motion between them
// stays continuous.
export function stretchScroll(raw: number, rawAtStart: number, rawAtEnd: number, maxScroll: number): number {
  if (maxScroll <= 0) return 0;
  const span = rawAtEnd - rawAtStart;
  if (span === 0) return 0;
  const t = (raw - rawAtStart) / span;
  if (t <= 0) return 0;
  if (t >= 1) return maxScroll;
  return t * maxScroll;
}

// Fractional source line at a scroll offset. The fraction is how far the
// viewport is through that line's block, so the other pane moves with the
// trackpad instead of jumping a block at a time.
export function editorLineAtScroll(view: EditorView, scrollTop: number): number {
  const doc = view.state.doc;
  if (doc.length === 0) return 1;
  const block = view.lineBlockAtHeight(Math.max(0, scrollTop));
  const startLine = doc.lineAt(Math.min(block.from, doc.length)).number;
  const lastPos = Math.min(Math.max(block.from, block.to - 1), doc.length);
  const endLine = doc.lineAt(lastPos).number;
  const lineSpan = endLine - startLine + 1;
  if (block.height <= 0) return startLine;
  const frac = (scrollTop - block.top) / block.height;
  return startLine + frac * lineSpan;
}

export function editorScrollForLine(view: EditorView, linePos: number): number {
  const doc = view.state.doc;
  if (doc.lines === 0) return 0;
  const lineNo = Math.min(doc.lines, Math.max(1, Math.floor(linePos)));
  const line = doc.line(lineNo);
  const block = view.lineBlockAt(line.from);
  const startLine = doc.lineAt(Math.min(block.from, doc.length)).number;
  const lastPos = Math.min(Math.max(block.from, block.to - 1), doc.length);
  const endLine = doc.lineAt(lastPos).number;
  const lineSpan = endLine - startLine + 1;
  const frac = (linePos - startLine) / lineSpan;
  return block.top + frac * block.height;
}

function maxScroll(el: HTMLElement): number {
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

// Wrapped lines keep an estimated height until they are drawn. The first
// scroll that reaches them corrects that estimate and the scroll position
// jumps. Measure the whole note once, at the real column width, first.
function warmEditorHeights(view: EditorView): boolean {
  const scroller = view.scrollDOM;
  if (scroller.clientWidth < 2 || scroller.clientHeight < 2) return false;
  const measurable = view as EditorView & {
    measure?: (flush?: boolean) => void;
    viewState?: { printing: boolean };
  };
  if (!measurable.measure || !measurable.viewState) return false;
  const top = scroller.scrollTop;
  measurable.viewState.printing = true;
  try {
    measurable.measure();
    measurable.viewState.printing = false;
    measurable.measure();
  } finally {
    measurable.viewState.printing = false;
  }
  if (top === 0 && scroller.scrollTop !== 0) scroller.scrollTop = 0;
  return true;
}

function assignScroll(el: HTMLElement, next: number) {
  const max = maxScroll(el);
  const clamped = Math.min(Math.max(next, 0), max);
  if (Math.abs(el.scrollTop - clamped) < 0.5) return;
  el.scrollTop = clamped;
}

const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]);

// Follow whichever pane the user is actually scrolling. Programmatic
// scrollTop updates do not move `driver`, so the write-back cannot fight
// the gesture or cancel its momentum.
export function bindSplitScroll(view: EditorView, pane: HTMLElement, article: HTMLElement): () => void {
  const scroller = view.scrollDOM;
  let driver: "editor" | "preview" | null = null;
  let marks: LineMark[] | null = null;
  let dirty = true;
  let frame = 0;
  let job: (() => void) | null = null;
  let waits = 0;
  let scrolling = false;
  let idle = 0;
  let warmTimer = 0;
  let warmFrame = 0;
  let knownWidth = 0;

  function refreshMarks() {
    marks = collectLineMarks(article, pane);
    dirty = false;
  }

  // Measuring every block during the gesture is the hitch, and a diagram
  // that finishes in that same moment would retarget the other pane.
  function currentMarks(): LineMark[] {
    if (marks && (!dirty || scrolling)) return marks;
    refreshMarks();
    return marks ?? [];
  }

  function touchScroll() {
    scrolling = true;
    window.clearTimeout(idle);
    idle = window.setTimeout(() => {
      scrolling = false;
      refreshMarks();
    }, 160);
  }

  function schedule(fn: () => void) {
    job = fn;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const run = job;
      job = null;
      run?.();
    });
  }

  function applyFromEditor() {
    if (view.viewportLineBlocks.length === 0 && view.state.doc.length > 0) {
      if (waits++ < 8) schedule(applyFromEditor);
      return;
    }
    waits = 0;
    const sampled = currentMarks();
    const editorMax = maxScroll(scroller);
    const previewMax = maxScroll(pane);
    if (sampled.length === 0) {
      const t = editorMax > 0 ? scroller.scrollTop / editorMax : 0;
      assignScroll(pane, t * previewMax);
      return;
    }
    const raw0 = offsetForLine(sampled, editorLineAtScroll(view, 0)) ?? 0;
    const raw1 = offsetForLine(sampled, editorLineAtScroll(view, editorMax)) ?? 0;
    const raw = offsetForLine(sampled, editorLineAtScroll(view, scroller.scrollTop)) ?? 0;
    assignScroll(pane, stretchScroll(raw, raw0, raw1, previewMax));
  }

  function applyFromPreview() {
    if (view.viewportLineBlocks.length === 0 && view.state.doc.length > 0) return;
    const sampled = currentMarks();
    const editorMax = maxScroll(scroller);
    const previewMax = maxScroll(pane);
    if (sampled.length === 0) {
      const t = previewMax > 0 ? pane.scrollTop / previewMax : 0;
      assignScroll(scroller, t * editorMax);
      return;
    }
    const raw0 = offsetForLine(sampled, editorLineAtScroll(view, 0)) ?? 0;
    const raw1 = offsetForLine(sampled, editorLineAtScroll(view, editorMax)) ?? 0;
    const span = raw1 - raw0;
    const t = previewMax > 0 ? pane.scrollTop / previewMax : 0;
    const raw = span === 0 ? raw0 : raw0 + t * span;
    const linePos = lineForOffset(sampled, raw);
    if (linePos === null) return;
    assignScroll(scroller, Math.min(editorMax, Math.max(0, editorScrollForLine(view, linePos))));
  }

  function onEditorScroll() {
    if (driver !== "editor") return;
    schedule(applyFromEditor);
  }

  function onPreviewScroll() {
    if (driver !== "preview") return;
    schedule(applyFromPreview);
  }

  function armEditor() {
    driver = "editor";
    touchScroll();
  }

  function armPreview() {
    driver = "preview";
    touchScroll();
  }

  function onEditorKey() {
    driver = "editor";
  }

  function onPreviewKey(event: KeyboardEvent) {
    if (SCROLL_KEYS.has(event.key)) driver = "preview";
  }

  scroller.addEventListener("scroll", onEditorScroll, { passive: true });
  pane.addEventListener("scroll", onPreviewScroll, { passive: true });
  scroller.addEventListener("wheel", armEditor, { passive: true });
  pane.addEventListener("wheel", armPreview, { passive: true });
  scroller.addEventListener("touchmove", armEditor, { passive: true });
  pane.addEventListener("touchmove", armPreview, { passive: true });
  view.dom.addEventListener("pointerdown", armEditor);
  pane.addEventListener("pointerdown", armPreview);
  // The preview thumb lives on the shell, beside the scroller, so a drag
  // there has to count as scrolling the preview too.
  const previewHost = pane.parentElement;
  previewHost?.addEventListener("pointerdown", armPreview, true);
  previewHost?.addEventListener("wheel", armPreview, { passive: true, capture: true });
  view.dom.addEventListener("keydown", onEditorKey, true);
  pane.addEventListener("keydown", onPreviewKey, true);

  const mutation = new MutationObserver((records) => {
    dirty = true;
    // Replacing the article is a new preview and should catch the editor.
    // A diagram filling in later only changes height; following that would
    // move the scroll while the picture appears.
    const replaced = records.some((record) => record.target === article);
    if (replaced && driver !== "preview") schedule(applyFromEditor);
  });
  mutation.observe(article, { childList: true, subtree: true });
  const resize = new ResizeObserver(() => {
    if (scrolling) {
      dirty = true;
      return;
    }
    refreshMarks();
  });
  resize.observe(article);
  resize.observe(pane);

  // The split column is narrower than Write. Rewarm when that width settles
  // so the next flick does not discover new line heights.
  const scheduleWarm = () => {
    window.clearTimeout(warmTimer);
    const run = () => {
      if (scrolling) {
        warmTimer = window.setTimeout(run, 80);
        return;
      }
      knownWidth = scroller.clientWidth;
      warmEditorHeights(view);
    };
    warmTimer = window.setTimeout(run, 60);
  };
  const onWidth = () => {
    const width = scroller.clientWidth;
    if (width < 2 || Math.abs(width - knownWidth) < 1) return;
    knownWidth = width;
    scheduleWarm();
  };
  const widthWatch = new ResizeObserver(onWidth);
  knownWidth = scroller.clientWidth;
  widthWatch.observe(scroller);
  if (!warmEditorHeights(view)) {
    warmFrame = requestAnimationFrame(() => {
      warmFrame = 0;
      knownWidth = 0;
      onWidth();
    });
  }

  schedule(applyFromEditor);

  return () => {
    if (frame) cancelAnimationFrame(frame);
    window.clearTimeout(idle);
    window.clearTimeout(warmTimer);
    if (warmFrame) cancelAnimationFrame(warmFrame);
    widthWatch.disconnect();
    scroller.removeEventListener("scroll", onEditorScroll);
    pane.removeEventListener("scroll", onPreviewScroll);
    scroller.removeEventListener("wheel", armEditor);
    pane.removeEventListener("wheel", armPreview);
    scroller.removeEventListener("touchmove", armEditor);
    pane.removeEventListener("touchmove", armPreview);
    view.dom.removeEventListener("pointerdown", armEditor);
    pane.removeEventListener("pointerdown", armPreview);
    previewHost?.removeEventListener("pointerdown", armPreview, true);
    previewHost?.removeEventListener("wheel", armPreview, { capture: true });
    view.dom.removeEventListener("keydown", onEditorKey, true);
    pane.removeEventListener("keydown", onPreviewKey, true);
    mutation.disconnect();
    resize.disconnect();
  };
}
