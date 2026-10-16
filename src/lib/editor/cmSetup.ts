import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { search, searchKeymap } from "@codemirror/search";
import { editorContext, editorContextCompartment } from "./editorContext";
import { liveFormattingPlugin } from "./markdownDecorations";
import { mermaidWidgets } from "./mermaidWidget";
import { hideMarkersPlugin } from "./previewMode";
import { markdownAuthoring } from "./markdownAuthoring";
import { customScrollbarPlugin, customScrollbarTheme } from "./customScrollbar";
import { mdplusHighlighting, mdplusEditorTheme } from "./highlightTheme";

export const wordWrapCompartment = new Compartment();

function wordWrapExtension(wordWrap: boolean): Extension {
  return wordWrap ? EditorView.lineWrapping : [];
}

export function setWordWrap(view: EditorView, wordWrap: boolean) {
  view.dispatch({ effects: wordWrapCompartment.reconfigure(wordWrapExtension(wordWrap)) });
}

export function baseExtensions(wordWrap = true): Extension[] {
  return [
    history(),
    drawSelection(),
    highlightActiveLine(),
    markdown({ extensions: GFM }),
    mdplusHighlighting,
    mdplusEditorTheme,
    editorContextCompartment.of(editorContext({ path: null, dark: false, liveMermaid: true })),
    liveFormattingPlugin,
    mermaidWidgets,
    hideMarkersPlugin,
    markdownAuthoring,
    customScrollbarPlugin,
    customScrollbarTheme,
    search({ top: true }),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    wordWrapCompartment.of(wordWrapExtension(wordWrap)),
  ];
}

export function createDocState(content: string, cursor?: number, wordWrap = true): EditorState {
  const clampedCursor = cursor === undefined ? undefined : Math.min(Math.max(cursor, 0), content.length);
  return EditorState.create({
    doc: content,
    selection: clampedCursor === undefined ? undefined : { anchor: clampedCursor },
    extensions: baseExtensions(wordWrap),
  });
}
