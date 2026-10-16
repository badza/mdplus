import { EditorSelection, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentMore, indentLess, insertNewlineAndIndent } from "@codemirror/commands";

// Markdown authoring extensions: the editing affordances that turn a tabbed text box
// into a markdown editor. See the reviewer's "the thing I'd actually invest in".
//
//   1. List continuation on Enter (continue "- " / "1. " / "* " / "- [ ] "),
//      and outdent-on-empty-Enter (press Enter on an empty list item to leave the list).
//   2. ⌘B / ⌘I / ⌘K toggles (bold / italic / link). ⌘K wraps a selection in [sel](url),
//      and pasting a URL over a selection turns it into [selection](url).
//   3. Auto-pairing for `, *, _, [, (.
//   4. Tab / Shift-Tab to indent/outdent list items.
//   5. Smart paste: pasting HTML into a markdown buffer converts to markdown;
//      pasting a URL over a selection wraps it as [selection](url).

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAIRS: Record<string, string> = {
  "`": "`",
  "*": "*",
  _: "_",
  "[": "]",
  "(": ")",
};

const PAIR_OPENERS = new Set(Object.keys(PAIRS));

// The set of characters that, when sitting immediately to the *right* of the cursor,
// should NOT trigger auto-pairing (because the user is likely closing an existing pair
// or the next char is a word boundary we don't want to swallow). Empty/whitespace
// and pair-closers let pairing happen.
function charAllowsPairingBefore(ch: string | undefined): boolean {
  if (ch === undefined) return true;
  return ch === "" || /\s/.test(ch);
}

// Wraps the current selection with `open`/`close`, or removes the wrap if the
// selection is already wrapped (toggle). With an empty selection, inserts
// `open`+`close` and puts the cursor between them.
function toggleWrap(view: EditorView, open: string, close: string): boolean {
  const { state } = view;
  const changes = state.changeByRange((range) => {
    if (!range.empty) {
      const sel = state.sliceDoc(range.from, range.to);
      // Toggle off: selection is exactly open+...+close.
      if (sel.startsWith(open) && sel.endsWith(close) && sel.length >= open.length + close.length) {
        const inner = sel.slice(open.length, sel.length - close.length);
        return {
          changes: { from: range.from, to: range.to, insert: inner },
          range: EditorSelection.range(range.from, range.from + inner.length),
        };
      }
      // Toggle on: wrap.
      const wrapped = open + sel + close;
      return {
        changes: { from: range.from, to: range.to, insert: wrapped },
        range: EditorSelection.range(range.from + open.length, range.from + open.length + sel.length),
      };
    }
    // Empty selection: insert open+close and place cursor between.
    return {
      changes: { from: range.from, insert: `${open}${close}` },
      range: EditorSelection.cursor(range.from + open.length),
    };
  });
  view.dispatch(changes);
  return true;
}

function wrapLink(view: EditorView): boolean {
  const { state } = view;
  const changes = state.changeByRange((range) => {
    if (!range.empty) {
      const sel = state.sliceDoc(range.from, range.to);
      // If already a link [sel](...), leave the URL placeholder selected for edit.
      const wrapped = `[${sel}](url)`;
      return {
        changes: { from: range.from, to: range.to, insert: wrapped },
        // Place the caret inside the () so the user can type/paste the URL.
        range: EditorSelection.range(
          range.from + sel.length + 3, // after "]("
          range.from + sel.length + 3 + 3, // length of "url"
        ),
      };
    }
    // Empty selection: insert [](url) and place caret inside [].
    return {
      changes: { from: range.from, insert: `[](url)` },
      range: EditorSelection.range(range.from + 1, range.from + 1),
    };
  });
  view.dispatch(changes);
  return true;
}

// ---------------------------------------------------------------------------
// List continuation (Enter)
// ---------------------------------------------------------------------------

// Matches a leading list marker: "- ", "* ", "+ ", "1. ", "2. ", "- [ ] ", "- [x] ".
const LIST_MARKER_RE = /^(\s*)([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/;

function handleListEnter(view: EditorView): boolean {
  const { state } = view;
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) return false;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  const after = line.text.slice(pos - line.from);
  // Only engage list continuation when the cursor is at the end of the line (nothing
  // meaningful after it) — pressing Enter mid-line should behave normally.
  if (after.trim() !== "") return false;
  const m = before.match(LIST_MARKER_RE);
  if (!m) return false;
  const indent = m[1];
  const marker = m[2];
  const checkbox = m[3] ?? "";
  const textAfterMarker = before.slice(m[0].length);

  // Outdent-on-empty-Enter: the line is *just* the marker (no content after it).
  // Pressing Enter should leave the list rather than keep spawning empty items.
  if (textAfterMarker.trim() === "") {
    // Delete the marker line content (replace with empty) and let a normal newline
    // land on a blank line. We replace from line start to pos with "" then insert "\n".
    const from = line.from;
    const to = pos;
    view.dispatch({
      changes: { from, to, insert: "\n" },
      selection: EditorSelection.cursor(from + 1),
    });
    return true;
  }

  // Continue the list: same indent and marker. Ordered lists increment.
  // A task item continues as a fresh unchecked box.
  let nextMarker = marker;
  const orderedMatch = marker.match(/^(\d+)\.$/);
  if (orderedMatch) {
    nextMarker = `${parseInt(orderedMatch[1], 10) + 1}.`;
  }
  const nextPrefix = `${indent}${nextMarker} ${checkbox ? "[ ] " : ""}`;
  view.dispatch({
    changes: { from: pos, to: pos, insert: `\n${nextPrefix}` },
    selection: EditorSelection.cursor(pos + 1 + nextPrefix.length),
  });
  return true;
}

// Enter key handler: try list continuation first; fall back to default newline.
function enterHandler(view: EditorView): boolean {
  if (handleListEnter(view)) return true;
  return insertNewlineAndIndent(view);
}

// ---------------------------------------------------------------------------
// Tab / Shift-Tab indent for list items
// ---------------------------------------------------------------------------

function cursorInListItem(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos);
  return LIST_MARKER_RE.test(line.text);
}

function tabHandler(view: EditorView): boolean {
  const { state } = view;
  // If every selection is inside a list line, indent (insert two spaces of indent
  // at line start); this is what makes Tab promote a list item one level.
  // If no selection is in a list line, fall through to the default (insert tab /
  // indent more).
  const allInLists = state.selection.ranges.every((r) => cursorInListItem(state, r.from) && cursorInListItem(state, r.to));
  if (!allInLists) return indentMore(view);

  // Indent each list line by two spaces. We operate per-line across the selection.
  const lines: { from: number; line: number }[] = [];
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let n = startLine; n <= endLine; n++) {
      const l = state.doc.line(n);
      if (LIST_MARKER_RE.test(l.text)) lines.push({ from: l.from, line: n });
    }
  }
  if (lines.length === 0) return indentMore(view);
  // De-dup
  const seen = new Set<number>();
  const changes = lines
    .filter((x) => (seen.has(x.line) ? false : (seen.add(x.line), true)))
    .map((x) => ({ from: x.from, insert: "  " }));
  view.dispatch({
    changes,
    selection: EditorSelection.cursor(state.selection.main.head + 2),
  });
  return true;
}

function shiftTabHandler(view: EditorView): boolean {
  const { state } = view;
  const allInLists = state.selection.ranges.every((r) => cursorInListItem(state, r.from) && cursorInListItem(state, r.to));
  if (!allInLists) return indentLess(view);
  // Outdent each list line by up to two spaces.
  const seen = new Set<number>();
  const changes: { from: number; to: number }[] = [];
  let headDelta = 0;
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let n = startLine; n <= endLine; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const l = state.doc.line(n);
      if (!LIST_MARKER_RE.test(l.text)) continue;
      const spaces = l.text.match(/^\s*/)![0];
      const cut = Math.min(2, spaces.length);
      if (cut > 0) {
        changes.push({ from: l.from, to: l.from + cut });
        if (n === state.doc.lineAt(state.selection.main.head).number) headDelta -= cut;
      }
    }
  }
  if (changes.length === 0) return indentLess(view);
  view.dispatch({
    changes,
    selection: EditorSelection.cursor(state.selection.main.head + headDelta),
  });
  return true;
}

// ---------------------------------------------------------------------------
// Auto-pairing + smart paste (inputHandler)
// ---------------------------------------------------------------------------

// Converts pasted HTML to markdown. Handles the common cases the reviewer called
// out (smart paste). Intentionally small — not a full HTML→md converter, just the
// transformations that matter for pasting from browsers/Word into a md editor.
function htmlToMarkdown(html: string): string {
  // Block-level: headings, lists, paragraphs, blockquotes, code blocks, line breaks.
  // We do this with regex on the raw HTML string (no DOM parse) so it works the same
  // in the Tauri WebView and in standalone dev. It's lossy by design — tables and
  // <pre><code> are preserved as best-effort md.
  let out = html;

  // <br> and <br/> -> newline
  out = out.replace(/<br\s*\/?>/gi, "\n");
  // </p> and </div> -> double newline (paragraph break); drop the open tags.
  out = out.replace(/<\/(p|div|h[1-6]|li|ul|ol|blockquote|pre)>/gi, "\n\n");
  // Headings: <h1>..</h1> -> "# .."
  out = out.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, lvl: string, body: string) => {
    return `\n${"#".repeat(Number(lvl))} ${body.trim()}\n`;
  });
  // Bold / italic
  out = out.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**");
  out = out.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*");
  // Inline code
  out = out.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");
  // Links: <a href="url">text</a> -> [text](url)
  out = out.replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
  // Images: <img src="url" alt="x"> -> ![x](url)
  out = out.replace(/<img\s+[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi, "![$2]($1)");
  out = out.replace(/<img\s+[^>]*src=["']([^"']*)["'][^>]*\/?>/gi, "![]($1)");
  // Lists: <ul><li>a</li><li>b</li></ul> -> "- a\n- b"
  out = out.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_m, body: string) => {
    const items = [...body.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((x) => `- ${x[1].trim()}`);
    return `\n${items.join("\n")}\n`;
  });
  out = out.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, body: string) => {
    const items = [...body.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((x, i) => `${i + 1}. ${x[1].trim()}`);
    return `\n${items.join("\n")}\n`;
  });
  // Blockquotes
  out = out.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, body: string) => {
    return body
      .trim()
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
  });
  // Code blocks: <pre><code>...</code></pre> -> fenced
  out = out.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_m, body: string) => {
    return `\n\`\`\`\n${body.trim()}\n\`\`\`\n`;
  });
  // Strip remaining tags.
  out = out.replace(/<[^>]+>/g, "");
  // Decode the common HTML entities.
  out = out
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  // Collapse runs of 3+ newlines to 2.
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

const inputHandler = EditorView.inputHandler.of((view, from, to, text, _insertType) => {
  // --- Auto-pairing ---
  // Only pair when the user typed a single opening char, the selection is empty
  // (or being replaced), and the char after the caret is a boundary that allows it.
  if (text.length === 1 && PAIR_OPENERS.has(text)) {
    const close = PAIRS[text];
    const { state } = view;
    if (from === to) {
      // Empty selection — pair only if the char to the right allows it.
      const afterChar = state.sliceDoc(to, to + 1);
      if (charAllowsPairingBefore(afterChar)) {
        // Special-case: don't pair `*` or `_` if it would form `**`/`__` at the start
        // of a word (ambiguous). We still pair; the toggle-wrap on selection handles
        // the wrapping case. For raw typing, pairing `*`->`**` is the common md want.
        view.dispatch({
          changes: { from, to, insert: `${text}${close}` },
          selection: EditorSelection.cursor(from + 1),
          userEvent: "input.type.markdownAuthoring",
        });
        return true;
      }
    }
    // Selection being replaced: wrap the selection instead of just inserting.
    if (from !== to) {
      const sel = state.sliceDoc(from, to);
      view.dispatch({
        changes: { from, to, insert: `${text}${sel}${close}` },
        selection: EditorSelection.range(from + 1, from + 1 + sel.length),
        userEvent: "input.type.markdownAuthoring",
      });
      return true;
    }
  }

  // --- Auto-skip over matching close char ---
  // If the user typed a close char and the same char is immediately to the right,
  // just move the caret forward (so typing `]` after `foo[` lands *after* the `]`).
  if (text.length === 1) {
    const closeSet = new Set(Object.values(PAIRS));
    if (closeSet.has(text)) {
      const afterChar = view.state.sliceDoc(to, to + 1);
      if (afterChar === text) {
        view.dispatch({
          changes: { from, to: to + 1, insert: "" },
          selection: EditorSelection.cursor(to + 1),
          userEvent: "input.type.markdownAuthoring",
        });
        return true;
      }
    }
  }

  // --- Smart paste ---
  // Pasting text that looks like HTML (contains a tag) converts to markdown.
  // Pasting a URL over a selection wraps it as [selection](url).
  if (text.includes("<") && /<\/?[a-zA-Z][^>]*>/.test(text)) {
    const md = htmlToMarkdown(text);
    view.dispatch({
      changes: { from, to, insert: md },
      selection: EditorSelection.cursor(from + md.length),
      userEvent: "input.paste.markdownAuthoring",
    });
    return true;
  }
  // URL-over-selection: if the inserted text is a URL and there was a selection,
  // wrap as [selection](url). (from !== to means a selection is being replaced.)
  if (from !== to && /^\s*https?:\/\/\S+\s*$/.test(text)) {
    const sel = view.state.sliceDoc(from, to);
    const url = text.trim();
    const insert = `[${sel}](${url})`;
    view.dispatch({
      changes: { from, to, insert },
      selection: EditorSelection.cursor(from + insert.length),
      userEvent: "input.paste.markdownAuthoring",
    });
    return true;
  }

  return false;
});

// ---------------------------------------------------------------------------
// Keymap
// ---------------------------------------------------------------------------

const authoringKeymap = keymap.of([
  { key: "Enter", run: enterHandler },
  { key: "Mod-b", preventDefault: true, run: (v) => toggleWrap(v, "**", "**") },
  { key: "Mod-i", preventDefault: true, run: (v) => toggleWrap(v, "*", "*") },
  { key: "Mod-k", preventDefault: true, run: wrapLink },
  { key: "Tab", run: tabHandler },
  { key: "Shift-Tab", run: shiftTabHandler },
]);

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const markdownAuthoring: Extension = [inputHandler, authoringKeymap];