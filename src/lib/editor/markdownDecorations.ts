import { syntaxTree, ensureSyntaxTree } from "@codemirror/language";
import { Range, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { openExternal } from "../openExternal";
import { resolveResourceUrl } from "../preview/resources";
import { documentPathFacet, liveBlocksFacet, mermaidLiveFacet, sourceRenderFacet, viewportParsed } from "./editorContext";
import { liveMermaidSource } from "./mermaidWidget";
import { TaskCheckbox, taskClickHandler } from "./taskToggle";

const HEADING_CLASS: Record<string, string> = {
  ATXHeading1: "cm-heading cm-heading-1",
  ATXHeading2: "cm-heading cm-heading-2",
  ATXHeading3: "cm-heading cm-heading-3",
  ATXHeading4: "cm-heading cm-heading-4",
  ATXHeading5: "cm-heading cm-heading-4",
  ATXHeading6: "cm-heading cm-heading-4",
};

const MARK_NODES = new Set(["HeaderMark", "EmphasisMark", "CodeMark"]);

// Nodes that are part of a link/image's *syntax* (the delimiters and the URL) and
// should be hidden when the cursor isn't on the link's line, so a [label](url) reads
// as just "label". LinkLabel is deliberately NOT here -- it's the visible text.
const LINK_DELIM_NODES = new Set(["LinkMark", "URL", "LinkTitle"]);

// ---------------------------------------------------------------------------
// Image widget: replaces the whole ![alt](url) with an actual <img> when the
// cursor isn't on the image's line. Falls back to styled alt text when the cursor
// is on the line (so the user can edit the source).
// ---------------------------------------------------------------------------
class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) {
    super();
  }
  eq(other: ImageWidget) {
    return this.src === other.src && this.alt === other.alt;
  }
  toDOM() {
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.className = "cm-image-rendered";
    // Failure to load (broken URL, offline) collapses to the alt text styled below.
    img.addEventListener("error", () => {
      img.replaceWith(document.createTextNode(this.alt));
    });
    return img;
  }
  ignoreEvent() {
    return false;
  }
}

// Extract the URL and alt text from an Image node's children.
function imageParts(view: EditorView, node: { from: number; to: number; name: string }): { src: string; alt: string } | null {
  let src = "";
  let alt = "";
  syntaxTree(view.state).iterate({
    from: node.from,
    to: node.to,
    enter: (child) => {
      if (child.name === "URL") src = view.state.sliceDoc(child.from, child.to);
      if (child.name === "LinkLabel") alt = view.state.sliceDoc(child.from, child.to);
    },
  });
  return src ? { src, alt } : null;
}

// ---------------------------------------------------------------------------
// Table widget: replaces the whole GFM table source with a real rendered
// <table> when the cursor isn't inside it. Falls back to raw markdown (for
// editing) when the cursor enters the table's lines.
// ---------------------------------------------------------------------------
class TableWidget extends WidgetType {
  constructor(readonly html: string) {
    super();
  }
  eq(other: TableWidget) {
    return this.html === other.html;
  }
  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "cm-table-rendered";
    const table = document.createElement("table");
    table.innerHTML = this.html;
    wrap.appendChild(table);
    return wrap;
  }
  ignoreEvent() {
    return false;
  }
}

// Escapes a cell's raw text for safe insertion into innerHTML. Cell content is
// inline-parsed markdown (links, emphasis, code) so we render the *source* text
// with HTML escaping -- bold/italic/code styling is left to the syntax
// highlighter running on the editor text. The widget is a read-only preview.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Builds the inner HTML (rows) for a Table node by parsing the raw text.
// Splits on lines and pipes -- simpler and more robust than walking the syntax
// tree, and handles the GFM table format the parser guarantees.
function tableHtmlClean(state: EditorState, node: { from: number; to: number }): string | null {
  const raw = state.sliceDoc(node.from, node.to);
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return null;

  // Parse a line into cells: trim, strip leading/trailing pipes, split on pipes.
  function parseCells(line: string): string[] {
    let s = line.trim();
    // Remove leading and trailing pipes.
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|")) s = s.slice(0, -1);
    return s.split("|").map((c) => c.trim());
  }

  // Check if a line is the delimiter row (---|:--:|---:).
  function isDelimiter(line: string): boolean {
    const cells = parseCells(line);
    return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
  }

  let html = "";
  let openedBody = false;
  let headerDone = false;
  let ok = false;

  for (const line of lines) {
    if (isDelimiter(line)) continue; // skip the ---|--- row
    const cells = parseCells(line);
    if (cells.length === 0) continue;
    if (!headerDone) {
      html += "<thead><tr>";
      html += cells.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
      html += "</tr></thead>";
      headerDone = true;
      ok = true;
    } else {
      if (!openedBody) {
        html += "<tbody>";
        openedBody = true;
      }
      html += "<tr>";
      html += cells.map((c) => `<td>${escapeHtml(c)}</td>`).join("");
      html += "</tr>";
      ok = true;
    }
  }

  if (openedBody) html += "</tbody>";
  return ok ? html : null;
}

// --- Inline decorations (ViewPlugin) ---------------------------------------
// All non-block decorations: line styles, marks, image widgets, link hiding.
// Block decorations (table widgets) are handled separately by tableField
// because CodeMirror forbids block decorations from ViewPlugins.
function buildInlineDecorations(view: EditorView): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const sel = view.state.selection.main;
  const renderSource = view.state.facet(sourceRenderFacet);
  const liveBlocks = view.state.facet(liveBlocksFacet);
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const headingClass = HEADING_CLASS[node.name];
        if (headingClass) {
          decos.push(Decoration.line({ class: headingClass }).range(node.from, node.from));
        } else if (node.name === "StrongEmphasis") {
          decos.push(Decoration.mark({ class: "cm-strong" }).range(node.from, node.to));
        } else if (node.name === "Emphasis") {
          decos.push(Decoration.mark({ class: "cm-em" }).range(node.from, node.to));
        } else if (node.name === "InlineCode") {
          decos.push(Decoration.mark({ class: "cm-inline-code" }).range(node.from, node.to));
        } else if (node.name === "LinkLabel") {
          const parentName = node.node.parent?.name ?? "Link";
          const cls = parentName === "Image" ? "cm-image" : "cm-link";
          decos.push(Decoration.mark({ class: cls }).range(node.from, node.to));
        } else if (node.name === "Image" && renderSource && liveBlocks) {
          const rangeFrom = node.from;
          const rangeTo = node.to;
          const cursorOnRange = sel.from <= rangeTo && sel.to >= rangeFrom;
          if (!cursorOnRange) {
            const parts = imageParts(view, node);
            if (parts) {
              const src = resolveResourceUrl(parts.src, view.state.facet(documentPathFacet));
              decos.push(Decoration.replace({ widget: new ImageWidget(src, parts.alt), block: false }).range(node.from, node.to));
            }
          }
        } else if (node.name === "TaskMarker" && renderSource && liveBlocks) {
          const cursorInMarker = sel.from <= node.to && sel.to >= node.from;
          if (!cursorInMarker) {
            const mark = view.state.sliceDoc(node.from, node.to);
            const checked = mark.length >= 2 && mark[1] !== " ";
            decos.push(Decoration.replace({ widget: new TaskCheckbox(checked) }).range(node.from, node.to));
          }
        } else if (node.name === "Blockquote") {
          for (let p = node.from; p < node.to; ) {
            const line = view.state.doc.lineAt(p);
            decos.push(Decoration.line({ class: "cm-blockquote" }).range(line.from, line.from));
            p = line.to + 1;
          }
        } else if (node.name === "FencedCode" || node.name === "CodeBlock") {
          // A live mermaid fence is replaced by a block widget. A line decoration
          // on those same lines would collide with the replacement.
          if (node.name === "FencedCode" && liveMermaidSource(view.state, node.node)) return false;
          for (let p = node.from; p < node.to; ) {
            const line = view.state.doc.lineAt(p);
            decos.push(Decoration.line({ class: "cm-code-block" }).range(line.from, line.from));
            p = line.to + 1;
          }
        } else if (MARK_NODES.has(node.name)) {
          decos.push(Decoration.mark({ class: "cm-formatting-mark" }).range(node.from, node.to));
        } else if (renderSource && LINK_DELIM_NODES.has(node.name)) {
          const parent = node.node.parent;
          const rangeFrom = parent?.from ?? node.from;
          const rangeTo = parent?.to ?? node.to;
          const cursorOnRange = sel.from <= rangeTo && sel.to >= rangeFrom;
          if (!cursorOnRange) {
            decos.push(Decoration.replace({}).range(node.from, node.to));
          }
        }
      },
    });
  }
  return Decoration.set(decos, true);
}

// --- Block table decorations (StateField) ----------------------------------
// Block decorations must come from a StateField, not a ViewPlugin. This field
// scans for Table nodes and emits block-replace widgets that render a real
// <table> when the cursor isn't inside the table.
function buildTableDecorations(state: EditorState): DecorationSet {
  if (!state.facet(sourceRenderFacet) || !state.facet(liveBlocksFacet)) return Decoration.none;
  const decos: Range<Decoration>[] = [];
  const sel = state.selection.main;
  // StateField doesn't have access to the viewport, so scan the full document.
  // Tables are block-level and typically few, so this is cheap.
  syntaxTree(state).iterate({
    from: 0,
    to: state.doc.length,
    enter: (node) => {
      if (node.name !== "Table") return;
      const cursorOnTable = sel.from <= node.to && sel.to >= node.from;
      if (cursorOnTable) return;
      const html = tableHtmlClean(state, node);
      if (!html) return;
      const firstLine = state.doc.lineAt(node.from);
      const lastLine = state.doc.lineAt(Math.min(node.to, state.doc.length));
      if (lastLine.to <= firstLine.from) return;
      decos.push(Decoration.replace({ widget: new TableWidget(html), block: true }).range(firstLine.from, lastLine.to));
    },
  });
  return Decoration.set(decos, true);
}

// ---------------------------------------------------------------------------
// Clickable links: ⌘/Ctrl-click a rendered link opens it in the system browser.
// We intercept click events on .cm-link spans, find the enclosing Link node via
// the syntax tree, extract its URL, and hand it to window.open (or the Tauri
// shell opener if available).
// ---------------------------------------------------------------------------
const linkClickHandler = EditorView.domEventHandlers({
  click(e: MouseEvent, view: EditorView) {
    if (!(e.metaKey || e.ctrlKey)) return false;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) return false;
    let url: string | null = null;
    syntaxTree(view.state).iterate({
      from: pos,
      to: pos + 1,
      enter: (node) => {
        if (node.name === "Link") {
          // Find the URL child.
          syntaxTree(view.state).iterate({
            from: node.from,
            to: node.to,
            enter: (child) => {
              if (child.name === "URL") url = view.state.sliceDoc(child.from, child.to);
            },
          });
        }
      },
    });
    if (url) {
      e.preventDefault();
      openExternal(url);
      return true;
    }
    return false;
  },
});

const formattingTheme = EditorView.baseTheme({
  ".cm-heading-1": { fontSize: "1.6em", fontWeight: "700" },
  ".cm-heading-2": { fontSize: "1.4em", fontWeight: "700" },
  ".cm-heading-3": { fontSize: "1.2em", fontWeight: "700" },
  ".cm-heading-4": { fontSize: "1.05em", fontWeight: "700" },
  ".cm-strong": { fontWeight: "700" },
  ".cm-em": { fontStyle: "italic" },
  ".cm-inline-code": {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    background: "var(--mdplus-code-bg)",
    borderRadius: "3px",
    padding: "0 3px",
  },
  ".cm-formatting-mark": { opacity: "0.4" },
  ".cm-link": {
    color: "var(--mdplus-accent)",
    textDecoration: "underline",
    textDecorationColor: "color-mix(in srgb, var(--mdplus-syn-link) 40%, transparent)",
    cursor: "pointer",
  },
  ".cm-image": {
    color: "var(--mdplus-accent)",
    fontStyle: "italic",
  },
  ".cm-image-rendered": {
    maxWidth: "100%",
    height: "auto",
    display: "block",
    margin: "6px 0",
    borderRadius: "4px",
  },
  ".cm-blockquote": {
    borderLeft: "3px solid var(--mdplus-border)",
    background: "var(--mdplus-blockquote-bg)",
    paddingLeft: "10px",
    color: "var(--mdplus-text-muted)",
  },
  ".cm-code-block": {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    background: "var(--mdplus-codeblock-bg)",
    fontSize: "0.95em",
  },
  ".cm-table-rendered": {
    margin: "6px 0",
  },
  ".cm-table-rendered table": {
    borderCollapse: "collapse",
    width: "100%",
    fontSize: "0.95em",
    background: "var(--mdplus-card-bg)",
  },
  ".cm-table-rendered th, .cm-table-rendered td": {
    border: "1px solid var(--mdplus-border)",
    padding: "5px 10px",
    textAlign: "left",
    verticalAlign: "top",
  },
  ".cm-table-rendered th": {
    background: "var(--mdplus-table-header-bg, var(--mdplus-table-bg))",
    fontWeight: "600",
  },
  ".cm-table-rendered tbody tr:nth-child(even)": {
    background: "var(--mdplus-table-bg)",
  },
  ".cm-task": {
    margin: "0 0.4em 0 0.15em",
    verticalAlign: "middle",
    accentColor: "var(--mdplus-accent)",
  },
  ".cm-mermaid": {
    margin: "8px 0",
    cursor: "text",
    overflowX: "auto",
  },
  ".cm-mermaid svg": {
    display: "block",
    maxWidth: "100%",
    height: "auto",
  },
  ".cm-mermaid-error": {
    color: "var(--mdplus-text-muted)",
    fontFamily: "system-ui, sans-serif",
    fontSize: "12.5px",
    padding: "4px 0",
  },
});

const formattingViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildInlineDecorations(view);
    }
    update(update: ViewUpdate) {
      const contextChanged =
        update.startState.facet(documentPathFacet) !== update.state.facet(documentPathFacet) ||
        update.startState.facet(mermaidLiveFacet) !== update.state.facet(mermaidLiveFacet) ||
        update.startState.facet(sourceRenderFacet) !== update.state.facet(sourceRenderFacet) ||
        update.startState.facet(liveBlocksFacet) !== update.state.facet(liveBlocksFacet);
      if (update.docChanged || update.viewportChanged || update.selectionSet || contextChanged) {
        this.decorations = buildInlineDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

// Block decorations (table widgets) must live in a StateField, not a ViewPlugin.
const tableField = StateField.define<DecorationSet>({
  create(state) {
    return buildTableDecorations(state);
  },
  update(value, tr) {
    const renderChanged = tr.startState.facet(sourceRenderFacet) !== tr.state.facet(sourceRenderFacet);
    const blocksChanged = tr.startState.facet(liveBlocksFacet) !== tr.state.facet(liveBlocksFacet);
    if (tr.docChanged || tr.selection || renderChanged || blocksChanged) {
      return buildTableDecorations(tr.state);
    }
    for (const e of tr.effects) {
      if (e.is(viewportParsed)) {
        return buildTableDecorations(tr.state);
      }
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ViewPlugin that ensures the syntax tree is parsed for the current viewport
// and signals the StateField to rebuild table decorations when new content
// becomes visible on scroll. The syntax tree is lazy, so we force-parse the
// viewport and retry shortly after to pick up newly parsed Table nodes.
const tableViewportPlugin = ViewPlugin.fromClass(
  class {
    pending: ReturnType<typeof setTimeout> | undefined;
    ahead: ReturnType<typeof setTimeout> | undefined;
    view: EditorView;
    constructor(view: EditorView) {
      this.view = view;
      // The tree is lazy. Parse the note once up front so a table below
      // the fold does not turn into a widget on the first scroll past it.
      this.ahead = setTimeout(() => this.parseAhead(), 0);
    }
    parseAhead() {
      try {
        if (!this.view.dom.isConnected) return;
        ensureSyntaxTree(this.view.state, this.view.state.doc.length, 1000);
        // Split leaves tables as text. Dispatching here would rebuild
        // decorations in the middle of the first scroll.
        if (!this.view.state.facet(liveBlocksFacet)) return;
        this.view.dispatch({ effects: viewportParsed.of() });
      } catch {
        // View was destroyed before the parse finished.
      }
    }
    update(update: ViewUpdate) {
      if (!update.viewportChanged && !update.docChanged) return;
      this.view = update.view;
      if (!update.state.facet(liveBlocksFacet)) {
        clearTimeout(this.pending);
        return;
      }
      ensureSyntaxTree(this.view.state, this.view.viewport.to, 1000);
      clearTimeout(this.pending);
      this.pending = setTimeout(() => {
        try {
          if (!this.view.dom.isConnected || !this.view.state.facet(liveBlocksFacet)) return;
          ensureSyntaxTree(this.view.state, this.view.viewport.to, 1000);
          this.view.dispatch({ effects: viewportParsed.of() });
        } catch {
          // View was destroyed during the timeout -- nothing to do.
        }
      }, 150);
    }
    destroy() {
      clearTimeout(this.pending);
      clearTimeout(this.ahead);
    }
  },
);

export const liveFormattingPlugin: Extension = [
  formattingViewPlugin,
  tableViewportPlugin,
  tableField,
  formattingTheme,
  linkClickHandler,
  taskClickHandler,
];