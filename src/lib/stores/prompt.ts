import { writable, get } from "svelte/store";

export interface PromptRequest {
  title: string;
  hint: string;
  placeholder: string;
  confirmLabel: string;
  busyLabel: string;
  // Handoff may be confirmed with an empty field. Open from URL may not.
  allowEmpty?: boolean;
  icon?: "link" | "terminal";
  // Returns an error string to keep the dialog open, or null once the note is open.
  // `isCurrent` is false after the user dismisses the dialog, so a late fetch
  // does not open a tab.
  submit: (value: string, isCurrent: () => boolean) => Promise<string | null>;
}

const store = writable<PromptRequest | null>(null);

export const promptStore = { subscribe: store.subscribe };

export function openPrompt(request: PromptRequest): void {
  if (get(store)) return;
  store.set(request);
}

export function closePrompt(): void {
  store.set(null);
}
