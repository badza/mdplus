import { EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from "@codemirror/view";
import { markScrollerActive } from "../scrollActivity";

// Native scrollbars are hidden by clipping the scroller (see editor.css and
// preview.css) and replaced with this overlay. WKWebView on macOS ignores
// ::-webkit-scrollbar styling whenever the OS is set to auto-hiding overlay
// scrollbars, so the editor and the preview have to share this thumb or they
// will never look alike.
const THUMB_MIN_HEIGHT = 24;

export function attachOverlayScrollbar(scroller: HTMLElement, host: HTMLElement): { layout: () => void; destroy: () => void } {
  const track = document.createElement("div");
  track.className = "cm-custom-scrollbar-track";
  const thumb = document.createElement("div");
  thumb.className = "cm-custom-scrollbar-thumb";
  track.appendChild(thumb);
  host.appendChild(track);

  let raf: number | undefined;
  let dragging = false;
  let dragStartY = 0;
  let dragStartScrollTop = 0;
  let shown = false;
  let thumbH = -1;
  let thumbY = "";

  function placeThumb() {
    const { scrollTop, scrollHeight, clientHeight } = scroller;
    const visible = scrollHeight > clientHeight + 1;
    if (visible !== shown) {
      shown = visible;
      track.style.display = visible ? "block" : "none";
    }
    if (!visible) return;

    const thumbHeight = Math.max((clientHeight / scrollHeight) * clientHeight, THUMB_MIN_HEIGHT);
    const maxThumbTravel = clientHeight - thumbHeight;
    const maxScroll = scrollHeight - clientHeight;
    const thumbTop = maxScroll > 0 ? (scrollTop / maxScroll) * maxThumbTravel : 0;
    if (thumbHeight !== thumbH) {
      thumbH = thumbHeight;
      thumb.style.height = `${thumbHeight}px`;
    }
    const transform = `translateY(${thumbTop}px)`;
    if (transform !== thumbY) {
      thumbY = transform;
      thumb.style.transform = transform;
    }
  }

  function layout() {
    track.style.top = `${scroller.offsetTop}px`;
    track.style.height = `${scroller.offsetHeight}px`;
    placeThumb();
  }

  function scheduleThumb() {
    if (raf !== undefined) return;
    raf = requestAnimationFrame(() => {
      raf = undefined;
      placeThumb();
    });
  }

  function onTrackMouseDown(event: MouseEvent) {
    const rect = track.getBoundingClientRect();
    const clickY = event.clientY - rect.top;
    const thumbHeight = thumb.offsetHeight;
    const maxThumbTravel = rect.height - thumbHeight;
    if (maxThumbTravel <= 0) return;
    const ratio = Math.min(Math.max((clickY - thumbHeight / 2) / maxThumbTravel, 0), 1);
    scroller.scrollTop = ratio * (scroller.scrollHeight - scroller.clientHeight);
  }

  function onThumbMouseDown(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    dragStartY = event.clientY;
    dragStartScrollTop = scroller.scrollTop;
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
  }

  function onDragMove(event: MouseEvent) {
    const thumbHeight = thumb.offsetHeight;
    const maxThumbTravel = scroller.clientHeight - thumbHeight;
    if (maxThumbTravel <= 0) return;
    const maxScroll = scroller.scrollHeight - scroller.clientHeight;
    const scrollDelta = ((event.clientY - dragStartY) / maxThumbTravel) * maxScroll;
    scroller.scrollTop = Math.min(Math.max(dragStartScrollTop + scrollDelta, 0), maxScroll);
  }

  function onDragEnd() {
    dragging = false;
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
  }

  function onTrackWheel(event: WheelEvent) {
    if (event.deltaY === 0) return;
    scroller.scrollTop += event.deltaY;
    event.preventDefault();
  }

  function onScroll() {
    markScrollerActive(scroller);
    scheduleThumb();
  }

  scroller.addEventListener("scroll", onScroll, { passive: true });
  track.addEventListener("mousedown", onTrackMouseDown);
  thumb.addEventListener("mousedown", onThumbMouseDown);
  track.addEventListener("wheel", onTrackWheel, { passive: false });

  const resize = new ResizeObserver(() => layout());
  resize.observe(scroller);
  const content = scroller.firstElementChild;
  if (content) resize.observe(content);

  layout();

  return {
    layout,
    destroy() {
      scroller.removeEventListener("scroll", onScroll);
      track.removeEventListener("mousedown", onTrackMouseDown);
      thumb.removeEventListener("mousedown", onThumbMouseDown);
      track.removeEventListener("wheel", onTrackWheel);
      window.removeEventListener("mousemove", onDragMove);
      window.removeEventListener("mouseup", onDragEnd);
      if (raf !== undefined) cancelAnimationFrame(raf);
      if (dragging) document.body.style.userSelect = "";
      resize.disconnect();
      track.remove();
    },
  };
}

class ScrollbarWidget implements PluginValue {
  private bar: ReturnType<typeof attachOverlayScrollbar>;

  constructor(view: EditorView) {
    this.bar = attachOverlayScrollbar(view.scrollDOM, view.dom);
  }

  update(update: ViewUpdate) {
    if (update.geometryChanged) this.bar.layout();
  }

  destroy() {
    this.bar.destroy();
  }
}

export const customScrollbarPlugin = ViewPlugin.fromClass(ScrollbarWidget);

export const customScrollbarTheme = EditorView.baseTheme({
  ".cm-custom-scrollbar-track": {
    position: "absolute",
    right: "0",
    width: "14px",
    zIndex: "20",
    userSelect: "none",
  },
  ".cm-custom-scrollbar-thumb": {
    position: "absolute",
    left: "0",
    right: "0",
    borderRadius: "0",
    background: "var(--mdplus-scrollbar-thumb)",
  },
  ".cm-custom-scrollbar-thumb:hover": {
    background: "var(--mdplus-scrollbar-thumb-hover)",
  },
});
