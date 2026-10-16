import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { mermaidDarkFacet, mermaidLiveFacet, viewportParsed } from "./editorContext";
import { get } from "svelte/store";
import { messages } from "../i18n";
import { mermaidErrorText, paintDiagram, peekMermaidSvg, renderMermaidSvg } from "../preview/mermaid";

function fenceLanguage(state: EditorState, node: SyntaxNode): string {
  let child = node.firstChild;
  while (child) {
    if (child.name === "CodeInfo") {
      return state.sliceDoc(child.from, child.to).trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    }
    child = child.nextSibling;
  }
  return "";
}

function fenceCode(state: EditorState, node: SyntaxNode): string {
  let child = node.firstChild;
  while (child) {
    if (child.name === "CodeText") {
      let code = state.sliceDoc(child.from, child.to);
      if (code.startsWith("\n")) code = code.slice(1);
      if (code.endsWith("\n")) code = code.slice(0, -1);
      return code;
    }
    child = child.nextSibling;
  }
  return "";
}

// The source of a mermaid fence that should be drawn in place, or null when
// the cursor is inside it (leave the text editable) or live diagrams are off.
export function liveMermaidSource(state: EditorState, node: SyntaxNode): string | null {
  if (!state.facet(mermaidLiveFacet)) return null;
  const sel = state.selection.main;
  if (sel.from <= node.to && sel.to >= node.from) return null;
  if (fenceLanguage(state, node) !== "mermaid") return null;
  const code = fenceCode(state, node);
  return code.trim() ? code : null;
}

class MermaidWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly dark: boolean,
  ) {
    super();
  }
  eq(other: MermaidWidget) {
    return other.source === this.source && other.dark === this.dark;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-mermaid";
    wrap.title = get(messages).preview.clickToEdit;
    const slot = document.createElement("div");
    slot.className = "cm-mermaid-slot";
    wrap.append(slot);
    // A block widget does not take the cursor on its own. A click puts the
    // selection inside the fence, which drops the diagram and shows the source.
    wrap.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({ selection: { anchor: view.posAtDOM(wrap) } });
      view.focus();
    });
    const source = this.source;
    const dark = this.dark;
    const cached = peekMermaidSvg(source, dark);
    if (cached) {
      slot.innerHTML = cached;
      return wrap;
    }
    renderMermaidSvg(source, dark).then(
      (svg) => {
        if (!slot.isConnected) return;
        paintDiagram(slot, () => {
          slot.innerHTML = svg;
        });
      },
      (err: unknown) => {
        if (!slot.isConnected) return;
        paintDiagram(slot, () => {
          slot.className = "cm-mermaid-error";
          slot.textContent = mermaidErrorText(err);
        });
      },
    );
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

function buildMermaidDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const dark = state.facet(mermaidDarkFacet);
  const ranges: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    from: 0,
    to: state.doc.length,
    enter: (node) => {
      if (node.name !== "FencedCode") return;
      const source = liveMermaidSource(state, node.node);
      if (!source) return;
      let end = node.to;
      if (end > node.from && state.sliceDoc(end - 1, end) === "\n") end -= 1;
      if (end <= node.from) return;
      const first = state.doc.lineAt(node.from);
      const last = state.doc.lineAt(end);
      ranges.push(
        Decoration.replace({ widget: new MermaidWidget(source, dark), block: true }).range(first.from, last.to),
      );
      return false;
    },
  });
  for (const range of ranges) builder.add(range.from, range.to, range.value);
  return builder.finish();
}

const mermaidField = StateField.define<DecorationSet>({
  create(state) {
    return buildMermaidDecorations(state);
  },
  update(value, tr) {
    const contextChanged =
      tr.startState.facet(mermaidLiveFacet) !== tr.state.facet(mermaidLiveFacet) ||
      tr.startState.facet(mermaidDarkFacet) !== tr.state.facet(mermaidDarkFacet);
    if (tr.docChanged || tr.selection || contextChanged) return buildMermaidDecorations(tr.state);
    for (const effect of tr.effects) {
      if (effect.is(viewportParsed)) return buildMermaidDecorations(tr.state);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const mermaidWidgets = [mermaidField];
