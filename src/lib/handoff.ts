import { fill } from "./i18n/messages";

// One row per coding CLI. The launcher is shared. Agents differ only in the
// binary and in where the instruction goes.
//
// "positional": the instruction is one argument after `--`.
// "flag": the last command token is the flag that takes the instruction, and
//         that flag is dropped when there is nothing to send.
// "clipboard": the CLI has no initial-prompt argument. The instruction is
//         copied, and Terminal just starts the program.

export type HandoffPrompt = "positional" | "flag" | "clipboard";

export interface HandoffAgent {
  id: string;
  label: string;
  command: readonly string[];
  prompt: HandoffPrompt;
}

export const HANDOFF_AGENTS: readonly HandoffAgent[] = [
  { id: "claude", label: "Claude Code", command: ["claude"], prompt: "positional" },
  { id: "grok", label: "Grok", command: ["grok"], prompt: "positional" },
  { id: "codex", label: "Codex", command: ["codex"], prompt: "positional" },
  { id: "gemini", label: "Gemini", command: ["gemini", "-i"], prompt: "flag" },
  { id: "opencode", label: "OpenCode", command: ["opencode", "--prompt"], prompt: "flag" },
  { id: "cursor", label: "Cursor Agent", command: ["cursor-agent"], prompt: "positional" },
  { id: "copilot", label: "GitHub Copilot", command: ["copilot"], prompt: "clipboard" },
  { id: "aider", label: "Aider", command: ["aider", "--message"], prompt: "flag" },
  { id: "cline", label: "Cline", command: ["cline"], prompt: "positional" },
  { id: "droid", label: "Droid", command: ["droid"], prompt: "positional" },
  { id: "qwen", label: "Qwen", command: ["qwen", "-i"], prompt: "flag" },
  { id: "kiro", label: "Kiro", command: ["kiro-cli", "chat"], prompt: "positional" },
];

// A short selection is quoted in the instruction. A longer one is named by
// line range so the shell argument stays small.
export const HANDOFF_SELECTION_LIMIT = 2000;

export interface HandoffSelection {
  text: string;
  fromLine: number;
  toLine: number;
}

export interface HandoffCopy {
  file: string;
  scratch: string;
  scratchUrl: string;
  selection: string;
  selectionRange: string;
}

export function handoffAgent(id: string): HandoffAgent | null {
  return HANDOFF_AGENTS.find((agent) => agent.id === id) ?? null;
}

export function handoffArgs(agent: HandoffAgent, instruction: string): string[] {
  const text = instruction.trim();
  if (agent.prompt === "clipboard" || !text) {
    if (agent.prompt === "flag") return agent.command.slice(0, -1);
    return [...agent.command];
  }
  if (agent.prompt === "positional") return [...agent.command, "--", text];
  return [...agent.command, text];
}

export function composeHandoffInstruction(
  userText: string,
  path: string,
  scratch: boolean,
  sourceUrl: string | null,
  selection: HandoffSelection | null,
  copy: HandoffCopy,
): string {
  const parts: string[] = [];
  if (scratch && sourceUrl) {
    parts.push(fill(copy.scratchUrl, { url: sourceUrl, path }));
  } else if (scratch) {
    parts.push(fill(copy.scratch, { path }));
  } else {
    parts.push(fill(copy.file, { path }));
  }
  if (selection) {
    const span = { from: selection.fromLine, to: selection.toLine };
    if (selection.text.length <= HANDOFF_SELECTION_LIMIT) {
      parts.push(fill(copy.selection, { ...span, text: selection.text }));
    } else {
      parts.push(fill(copy.selectionRange, span));
    }
  }
  const typed = userText.trim();
  if (typed) parts.push(typed);
  return parts.join("\n\n");
}
