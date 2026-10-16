import { invoke } from "@tauri-apps/api/core";

export async function writeHandoffFile(id: string, content: string): Promise<string> {
  return invoke<string>("write_handoff_file", { id, content });
}

export async function openInTerminal(cwd: string, args: string[]): Promise<void> {
  return invoke("open_in_terminal", { cwd, args });
}
