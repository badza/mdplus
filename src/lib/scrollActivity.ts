// Shared by the overlay scrollbar and diagram drawing. A picture that
// finishes during a flick waits until the scroller has been still.
const lastScroll = new WeakMap<EventTarget, number>();
const SETTLE_MS = 180;

export function markScrollerActive(scroller: EventTarget) {
  lastScroll.set(scroller, performance.now());
}

export function recentlyScrolled(scroller: EventTarget): boolean {
  const at = lastScroll.get(scroller);
  return at !== undefined && performance.now() - at < SETTLE_MS;
}
