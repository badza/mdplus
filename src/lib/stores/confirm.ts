import { writable, get } from "svelte/store";

export type ConfirmKind = "warning" | "info" | "danger";

export interface ConfirmOptions {
  title?: string;
  message: string;
  kind?: ConfirmKind;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, the confirm button reads as a destructive action (red-tinted). */
  danger?: boolean;
  /** One button. Enter and Escape both dismiss. */
  alert?: boolean;
}

export interface ConfirmState extends ConfirmOptions {
  open: boolean;
  // Resolves the promise returned by the imperative `confirm()` call.
  resolve: (value: boolean) => void;
}

const store = writable<ConfirmState | null>(null);

export const confirmStore = { subscribe: store.subscribe };

/**
 * Imperative confirm dialog. Replaces Tauri's native `ask()` so every
 * confirmation in the app shares one styled component instead of a mix of
 * native OS dialogs. Returns a promise that resolves to `true` (confirm) or
 * `false` (cancel / dismiss).
 *
 *   const ok = await confirm({ message: "Discard changes?", danger: true });
 *   if (!ok) return;
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    store.set({
      open: true,
      resolve,
      kind: "info",
      danger: false,
      alert: false,
      title: undefined,
      confirmLabel: undefined,
      cancelLabel: undefined,
      ...options,
    });
  });
}

/** Called by the dialog component when the user picks confirm/cancel or dismisses. */
export function resolveConfirm(value: boolean): void {
  const current = get(store);
  if (current) {
    current.resolve(value);
  }
  store.set(null);
}