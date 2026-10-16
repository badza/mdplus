<script lang="ts">
  export type IconName =
    | "markdown"
    | "close"
    | "plus"
    | "minimize"
    | "maximize"
    | "document"
    | "chevron-down"
    | "chevron-left"
    | "chevron-right"
    | "warning"
    | "info"
    | "write"
    | "split"
    | "read"
    | "settings"
    | "link"
    | "terminal";

  let { name, size = 16 }: { name: IconName; size?: number } = $props();

  // Hand-drawn 24x24 stroke icons -- no icon-font/library dependency, keeps bundle tiny.
  const paths: Record<IconName, string> = {
    markdown: '<path d="M4 9h16M4 15h16M9 4 7 20M17 4l-2 16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minimize: '<path d="M5 12h14"/>',
    maximize: '<rect x="5.5" y="5.5" width="13" height="13" rx="1.5"/>',
    document: '<path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4"/><path d="M8 13h8M8 17h5"/>',
    "chevron-down": '<path d="M6 9l6 6 6-6"/>',
    "chevron-left": '<path d="M15 6l-6 6 6 6"/>',
    "chevron-right": '<path d="M9 6l6 6-6 6"/>',
    warning: '<path d="M12 3l9 16H3z"/><path d="M12 10v5M12 17.5v.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
    write: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    split: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M12 5v14"/>',
    read: '<path d="M2.5 12S6.2 7 12 7s9.5 5 9.5 5-3.7 5-9.5 5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    terminal: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M7 9l3 3-3 3M12 15h5"/>',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  class="icon"
>
  {@html paths[name]}
</svg>

<style>
  .icon {
    flex-shrink: 0;
    display: block;
  }
</style>
