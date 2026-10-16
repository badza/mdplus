import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { mermaidLiveFacet, sourceRenderFacet } from "./editorContext";
import { liveMermaidSource } from "./mermaidWidget";

const MARK_NODES = new Set(["HeaderMark", "EmphasisMark", "CodeMark"]);

function insideLiveMermaid(view: EditorView, node: SyntaxNode): boolean {
  for (let current: SyntaxNode | null = node; current; current = current.parent) {
    if (current.name === "FencedCode" && liveMermaidSource(view.state, current)) return true;
  }
  return false;
}

function buildHideDecorations(view: EditorView): DecorationSet {
  if (!view.state.facet(sourceRenderFacet)) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  const sel = view.state.selection.main;
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (!MARK_NODES.has(node.name)) return;
        if (insideLiveMermaid(view, node.node)) return;

        const enclosing = node.node.parent;
        const rangeFrom = enclosing?.from ?? node.from;
        const rangeTo = enclosing?.to ?? node.to;
        const cursorOnRange = sel.from <= rangeTo && sel.to >= rangeFrom;
        if (cursorOnRange) return;

        let hideTo = node.to;
        if (node.name === "HeaderMark") {
          // absorb the single space after "##" so hiding it doesn't leave a stray leading space
          while (view.state.doc.sliceString(hideTo, hideTo + 1) === " ") hideTo++;
        }
        builder.add(node.from, hideTo, Decoration.replace({}));
      },
    });
  }
  return builder.finish();
}

export const hideMarkersPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildHideDecorations(view);
    }
    update(update: ViewUpdate) {
      const liveChanged = update.startState.facet(mermaidLiveFacet) !== update.state.facet(mermaidLiveFacet);
      const renderChanged = update.startState.facet(sourceRenderFacet) !== update.state.facet(sourceRenderFacet);
      if (update.docChanged || update.viewportChanged || update.selectionSet || liveChanged || renderChanged) {
        this.decorations = buildHideDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
