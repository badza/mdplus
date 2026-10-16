import { syntaxTree } from "@codemirror/language";
import { EditorView, WidgetType } from "@codemirror/view";

const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/;

// Replaces the `[ ]` / `[x]` marker with a real checkbox once the cursor
// leaves those three characters, so a checklist reads as a checklist.
export class TaskCheckbox extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: TaskCheckbox) {
    return other.checked === this.checked;
  }
  toDOM() {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "cm-task";
    box.tabIndex = -1;
    return box;
  }
  ignoreEvent() {
    return true;
  }
}

export const taskClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains("cm-task")) return false;
    event.preventDefault();
    const pos = view.posAtDOM(target);
    return toggleTaskMarkerAt(view, pos);
  },
});

export function toggleTaskMarkerAt(view: EditorView, pos: number): boolean {
  let range: { from: number; to: number } | null = null;
  const from = Math.max(0, pos - 2);
  const to = Math.min(view.state.doc.length, pos + 3);
  syntaxTree(view.state).iterate({
    from,
    to,
    enter: (node) => {
      if (node.name === "TaskMarker" && pos >= node.from && pos <= node.to) {
        range = { from: node.from, to: node.to };
      }
    },
  });
  if (!range) return false;
  const found = range as { from: number; to: number };
  const inside = view.state.sliceDoc(found.from + 1, found.from + 2);
  view.dispatch({
    changes: { from: found.from + 1, to: found.from + 2, insert: inside === " " ? "x" : " " },
  });
  return true;
}

// Preview checkboxes report the source line. The marker is the `[ ]` on that line.
export function toggleTaskLine(view: EditorView, lineNumber: number): boolean {
  if (lineNumber < 1 || lineNumber > view.state.doc.lines) return false;
  const line = view.state.doc.line(lineNumber);
  const match = line.text.match(TASK_LINE);
  if (!match) return false;
  const at = line.from + match[1].length + 1;
  const inside = match[2];
  view.dispatch({ changes: { from: at, to: at + 1, insert: inside === " " ? "x" : " " } });
  return true;
}
