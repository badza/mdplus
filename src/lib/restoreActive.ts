// Pick the tab that was active, after some saved tabs failed to open.
// `index` is the position in the saved list, not in the list of tabs that opened.
export function restoredActiveId(
  opened: readonly { index: number; id: string }[],
  activeIndex: number | null,
): string | null {
  if (opened.length === 0) return null;
  if (activeIndex === null) return opened[0].id;
  return opened.find((item) => item.index === activeIndex)?.id ?? opened[0].id;
}
