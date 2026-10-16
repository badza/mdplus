import { derived, get } from "svelte/store";
import { settings } from "../stores/settings";
import { normalizeLocale, packFor, pluralText, resolveLocale, type PluralForms } from "./messages";

export {
  fill,
  locales,
  normalizeLocale,
  packFor,
  pluralText,
  resolveLocale,
  themeLabel,
  type LocalePack,
  type Messages,
  type PluralForms,
} from "./messages";

export const activeLocaleId = derived(settings, ($settings) =>
  resolveLocale(normalizeLocale($settings.locale)),
);

export const localePack = derived(activeLocaleId, (id) => packFor(id));

export const messages = derived(localePack, (pack) => pack.messages);

export function countPhrase(forms: PluralForms, count: number): string {
  return pluralText(get(localePack), forms, count);
}
