import { SearchQuery } from "@codemirror/search";
import { Text as DocText } from "@codemirror/state";

// Same query the editor uses, so Read highlights the words you can see.
export interface TextQuery {
  search: string;
  caseSensitive: boolean;
  regexp: boolean;
  wholeWord: boolean;
}

export interface MatchRange {
  from: number;
  to: number;
}

const CAP = 2000;

// What Cmd+F drops into the find field. A long selection is left alone.
export function selectedFindText(text: string): string {
  if (!text || text.length > 100) return "";
  return text.replaceAll("\n", "\\n");
}

export function findRanges(text: string, query: TextQuery): MatchRange[] {
  const spec = new SearchQuery(query);
  if (!spec.valid) return [];
  return collectMatches(spec.getCursor(asText(text)), CAP);
}

export function collectMatches(
  cursor: { next(): IteratorResult<{ from: number; to: number }> },
  cap = CAP,
): MatchRange[] {
  const out: MatchRange[] = [];
  let previous = -1;
  let steps = 0;
  while (out.length < cap && steps < cap * 4) {
    steps++;
    const step = cursor.next();
    if (step.done) break;
    const { from, to } = step.value;
    // A zero-width regexp match would otherwise spin on the same spot.
    if (to <= from) {
      if (from === previous) break;
      previous = from;
      continue;
    }
    if (from < previous) break;
    previous = from;
    out.push({ from, to });
  }
  return out;
}

interface Chunk {
  node: Text;
  start: number;
}

// Drop old marks and merge the text back together before searching again.
export function clearPreviewFind(root: ParentNode) {
  const parents = new Set<Node>();
  for (const mark of root.querySelectorAll("mark.md-find")) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parents.add(parent);
  }
  for (const parent of parents) parent.normalize();
}

// Highlight rendered text. Each [data-line] block is searched on its own so a
// match cannot glue the end of one paragraph to the start of the next.
export function applyPreviewFind(root: HTMLElement, query: TextQuery): number {
  clearPreviewFind(root);
  if (!query.search) return 0;
  const spec = new SearchQuery(query);
  if (!spec.valid) return 0;

  let count = 0;
  for (const group of textGroups(root)) {
    const ranges = collectMatches(spec.getCursor(asText(group.text)), CAP - count);
    // Rightmost first: splitting a text node keeps the earlier offsets valid.
    for (let i = ranges.length - 1; i >= 0; i--) {
      wrapRange(group.chunks, ranges[i].from, ranges[i].to, count + i);
    }
    count += ranges.length;
    if (count >= CAP) return count;
  }
  return count;
}

function asText(text: string) {
  return DocText.of(text.split("\n"));
}

const BLOCK = "p, h1, h2, h3, h4, h5, h6, li, pre, td, th, blockquote, aside, figcaption";

function blockOf(parent: Element): Element | null {
  return parent.closest(BLOCK) ?? parent.closest("[data-line]");
}

function textGroups(root: HTMLElement): { text: string; chunks: Chunk[] }[] {
  const groups: { text: string; chunks: Chunk[]; block: Element }[] = [];
  let current: { text: string; chunks: Chunk[]; block: Element } | null = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    const parent = text.parentElement;
    // Inline marks (strong, em, code) also carry data-line. Group by the
    // block so "hello **world**" is still one phrase.
    const block = parent ? blockOf(parent) : null;
    if (parent && block && text.data && !parent.closest("button, script, style, svg, .katex, .md-mermaid")) {
      if (!current || current.block !== block) {
        current = { text: "", chunks: [], block };
        groups.push(current);
      }
      current.chunks.push({ node: text, start: current.text.length });
      current.text += text.data;
    }
    node = walker.nextNode();
  }
  return groups;
}

// Later matches are wrapped first so earlier offsets in the same text node stay put.
function wrapRange(chunks: Chunk[], from: number, to: number, index: number) {
  const parts: Text[] = [];
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i];
    const node = chunk.node;
    if (!node.parentNode) continue;
    const end = chunk.start + node.length;
    const start = Math.max(from, chunk.start);
    const stop = Math.min(to, end);
    if (start >= stop) continue;
    const localFrom = start - chunk.start;
    const localTo = stop - chunk.start;
    let target = node;
    if (localTo < target.length) target.splitText(localTo);
    if (localFrom > 0) target = target.splitText(localFrom);
    parts.push(target);
  }
  for (const target of parts) {
    const mark = document.createElement("mark");
    mark.className = "md-find";
    mark.dataset.find = String(index);
    target.parentNode?.insertBefore(mark, target);
    mark.appendChild(target);
  }
}
