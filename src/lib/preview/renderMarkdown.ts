import type { Element, Root as HastRoot } from "hast";
import type { Blockquote, Paragraph, Root } from "mdast";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";

const ALERT_KINDS = new Set(["note", "tip", "important", "warning", "caution"]);
const ALERT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n?/;

// GitHub alert: a blockquote whose first line is [!NOTE] (or TIP, IMPORTANT,
// WARNING, CAUTION). The marker is stripped and the quote becomes an <aside>
// so the preview can label it without showing the syntax.
function remarkAlerts() {
  return (tree: Root) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      const first = node.children[0];
      if (first?.type !== "paragraph" || first.children.length === 0) return;
      const head = first.children[0];
      if (head.type !== "text") return;
      const match = head.value.match(ALERT_RE);
      if (!match) return;
      const kind = match[1].toLowerCase();
      if (!ALERT_KINDS.has(kind)) return;
      const rest = head.value.slice(match[0].length);
      if (rest.length > 0) head.value = rest;
      else first.children.shift();
      if (paragraphIsEmpty(first)) node.children.shift();
      node.data = node.data ?? {};
      node.data.hName = "aside";
      node.data.hProperties = {
        className: ["md-alert", `md-alert-${kind}`],
      };
    });
  };
}

function paragraphIsEmpty(paragraph: Paragraph): boolean {
  return paragraph.children.every((child) => child.type === "text" && child.value.trim() === "");
}

// data-line lets split view scroll the preview and the editor together, and
// lets a task checkbox find the source line it should toggle. Checkboxes are
// left enabled so a click in the preview edits the file.
function rehypePreviewAttrs() {
  return (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      const line = node.position?.start?.line;
      if (line) node.properties.dataLine = String(line);
      if (node.tagName === "input" && node.properties.type === "checkbox") {
        delete node.properties.disabled;
      }
    });
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkAlerts)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypePreviewAttrs)
  .use(rehypeKatex)
  .use(rehypeStringify);

export function renderMarkdown(source: string): string {
  return String(processor.processSync(source));
}
