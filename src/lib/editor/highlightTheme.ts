import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// A custom HighlightStyle that maps Lezer tags to CSS classes (tok-*) instead of
// hardcoded colors. The actual colours live in theme.css as CSS variables, so they
// automatically adapt when the user switches between light and dark themes.
//
// This replaces CodeMirror's defaultHighlightStyle, which hardcodes light-theme
// colours (e.g. #219, #00f, #940) and is invisible in dark mode.
//
// The tag set covers everything the markdown parser emits (see @lezer/markdown's
// styleTags), plus the general programming tags from defaultHighlightStyle for
// any fenced code blocks that get a sub-language parser.
export const mdplusHighlightStyle = HighlightStyle.define([
  // Headings -- blue, bold is applied separately via the formatting decorations.
  { tag: t.heading1, class: "tok-heading1" },
  { tag: t.heading2, class: "tok-heading2" },
  { tag: t.heading3, class: "tok-heading3" },
  { tag: [t.heading4, t.heading5, t.heading6], class: "tok-heading4" },

  // Emphasis / strong / strikethrough -- fontStyle/weight are applied via the
  // formatting decorations (cm-em, cm-strong), so here we just tint the colour
  // slightly so italic/bold text reads as distinct from plain content.
  { tag: t.emphasis, class: "tok-emphasis" },
  { tag: t.strong, class: "tok-strong" },
  { tag: t.strikethrough, class: "tok-strikethrough" },

  // Links / images / URLs
  { tag: t.link, class: "tok-link" },
  { tag: t.url, class: "tok-url" },

  // Inline code + code blocks -- warm red, monospace font from formatting decos.
  { tag: t.monospace, class: "tok-code" },

  // Strings (link titles, fenced language strings) -- green
  { tag: [t.string, t.special(t.string)], class: "tok-string" },

  // Numbers / booleans / atoms
  { tag: [t.number, t.integer, t.float], class: "tok-number" },
  { tag: [t.atom, t.bool], class: "tok-atom" },

  // Keywords (rare in markdown but used in fenced code sub-languages) -- purple
  { tag: t.keyword, class: "tok-keyword" },

  // Variable / type / function names (for fenced code sub-languages)
  { tag: t.variableName, class: "tok-variable" },
  { tag: [t.typeName, t.namespace], class: "tok-type" },
  { tag: t.className, class: "tok-class" },
  { tag: t.propertyName, class: "tok-property" },
  { tag: t.definition(t.variableName), class: "tok-variable" },

  // Comments -- muted gray, italic
  { tag: t.comment, class: "tok-comment" },

  // Escapes / entities / special characters
  { tag: [t.escape, t.character], class: "tok-escape" },

  // Processing instructions -- the markdown marks (#, *, `, [, ], etc.).
  // Muted so the formatting syntax recedes behind the content.
  { tag: t.processingInstruction, class: "tok-punct" },

  // Metadata / labels
  { tag: [t.labelName, t.contentSeparator], class: "tok-label" },

  // List / quote content -- slightly muted
  { tag: [t.list, t.quote], class: "tok-quote" },

  // Errors
  { tag: t.invalid, class: "tok-invalid" },

  // Default content -- no class needed, inherits the editor's text colour.
  { tag: t.content, class: "tok-content" },
]);

export const mdplusHighlighting = syntaxHighlighting(mdplusHighlightStyle, { fallback: true });

// Editor chrome theme: cursor colour, selection background, active-line background.
// CodeMirror's default draws a 1.2px black caret and uses the platform selection
// colour -- both are hard to see in dark mode and don't match the app's accent.
// We widen the cursor to 2px and tint it with the accent colour so it's always
// visible, and use a subtle accent-tinted selection.
//
// The `&` selector is CodeMirror's syntax for targeting the editor root (.cm-editor).
// `&dark` / `&light` are matched against the `&dark` / `&light` classes that
// CodeMirror toggles based on the theme -- but since we drive theming via our own
// data-theme attribute on <html>, we use CSS variables that change with data-theme
// instead of relying on the &dark/&light mechanism.
export const mdplusEditorTheme = EditorView.baseTheme({
  // Cursor -- wider (2px) and accent-coloured so it's always visible.
  ".cm-cursor, .cm-dropCursor": {
    borderLeft: "2px solid var(--mdplus-cursor)",
    marginLeft: "-1px",
  },
  "&.cm-focused > .cm-scroller > .cm-cursorLayer .cm-cursor": {
    display: "block",
  },

  // Selection background -- accent-tinted, subtle.
  ".cm-selectionBackground": {
    background: "var(--mdplus-selection)",
  },
  ".cm-focused .cm-selectionBackground": {
    background: "var(--mdplus-selection)",
  },

  // Native caret colour (used when drawSelection is off, but drawSelection
  // hides the native caret -- this is a fallback for good measure).
  ".cm-content": {
    caretColor: "var(--mdplus-cursor)",
  },

  // Search match highlight (from @codemirror/search's highlight plugin).
  ".cm-searchMatch": {
    background: "var(--mdplus-selection-match)",
    borderRadius: "2px",
  },
  ".cm-searchMatch-selected": {
    background: "var(--mdplus-selection-match)",
  },

  // Active line -- keep the existing subtle treatment.
  ".cm-activeLine": {
    backgroundColor: "var(--mdplus-hover)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--mdplus-hover)",
  },
});