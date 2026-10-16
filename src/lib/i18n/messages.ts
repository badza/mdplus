import type { Theme } from "../themes";

// Chrome strings live here so a new language is one catalog, not a hunt
// through components. Copy `en`, set `id` to a BCP 47 tag such as "de",
// set `nativeName` to the name in that language, and append the pack to
// `locales`. `plural` defaults to English (1 is "one", everything else is
// "other"); a language with more forms can supply its own.
export type PluralCategory = "one" | "few" | "many" | "other";

export interface PluralForms {
  one: string;
  other: string;
  few?: string;
  many?: string;
}

export interface Messages {
  common: {
    cancel: string;
    ok: string;
    discard: string;
    close: string;
  };
  settings: {
    title: string;
    lead: string;
    appearance: string;
    theme: string;
    themeHint: string;
    font: string;
    fontHint: string;
    sample: string;
    custom: string;
    customFont: string;
    smaller: string;
    larger: string;
    language: string;
    languageHint: string;
    languageSystem: string;
    editor: string;
    view: string;
    viewHint: string;
    wordWrap: string;
    wordWrapHint: string;
    focus: string;
    focusHint: string;
    fullMarkdown: string;
    fullMarkdownHint: string;
    files: string;
    autoSave: string;
    autoSaveHint: string;
    restoreSession: string;
    restoreSessionHint: string;
    recentFiles: string;
    recentFilesHint: string;
    included: string;
    onThisMac: string;
    onThisPc: string;
    onThisSystem: string;
    systemFonts: string;
  };
  themes: Record<Theme, string>;
  view: {
    write: string;
    split: string;
    read: string;
    splitView: string;
    cycle: string;
    cycleWith: string;
    label: string;
  };
  commands: {
    placeholder: string;
    empty: string;
    newTab: string;
    openFile: string;
    openUrl: string;
    save: string;
    saveAs: string;
    closeTab: string;
    reopenTab: string;
    checkUpdates: string;
    settings: string;
    wordWrap: string;
    focus: string;
    fullMarkdown: string;
    autoSave: string;
    restoreSession: string;
    colorTheme: string;
    chooseFont: string;
    chooseLanguage: string;
    handoff: string;
    fontLarger: string;
    fontSmaller: string;
    fontReset: string;
    back: string;
    groups: {
      file: string;
      view: string;
      editor: string;
      preferences: string;
      files: string;
      app: string;
    };
  };
  welcome: {
    slogan: string;
    newFile: string;
    open: string;
    openUrl: string;
    recent: string;
    tipBefore: string;
    tipAfter: string;
  };
  status: {
    lineCol: string;
    words: PluralForms;
  };
  tabs: {
    settings: string;
    untitled: string;
    untitledN: string;
    deleted: string;
    close: string;
    scrollLeft: string;
    scrollRight: string;
    showAll: string;
    newTab: string;
    closeOthers: string;
    closeLeft: string;
    closeRight: string;
    closeAll: string;
    copyPath: string;
    copyLink: string;
    copyFileName: string;
  };
  menu: {
    file: string;
    edit: string;
    view: string;
    noRecent: string;
    openRecent: string;
    newTab: string;
    open: string;
    openUrl: string;
    save: string;
    saveAs: string;
    closeTab: string;
    reopenTab: string;
    preferences: string;
    checkUpdates: string;
    quit: string;
    commandPalette: string;
    handoff: string;
    write: string;
    splitView: string;
    read: string;
  };
  openUrl: {
    title: string;
    hint: string;
    placeholder: string;
    open: string;
    opening: string;
    empty: string;
    scheme: string;
    page: string;
    large: string;
    missing: string;
    status: string;
    network: string;
  };
  handoff: {
    title: string;
    hint: string;
    placeholder: string;
    open: string;
    opening: string;
    failed: string;
    clipboard: string;
    noDocument: string;
    file: string;
    scratch: string;
    scratchUrl: string;
    selection: string;
    selectionRange: string;
  };
  dialog: {
    unsavedTitle: string;
    quit: string;
    discardNamed: string;
    changedTitle: string;
    overwrite: string;
    reload: string;
    overwriteAction: string;
    reloadAction: string;
  };
  preview: {
    empty: string;
    copy: string;
    copied: string;
    diagramFailed: string;
    clickToEdit: string;
  };
  editor: {
    startWriting: string;
    startHint: string;
  };
  updates: {
    failed: string;
    title: string;
    current: string;
    availableTitle: string;
    available: string;
  };
  files: {
    markdown: string;
  };
  window: {
    minimize: string;
    maximize: string;
    close: string;
    resizePanes: string;
  };
}

export interface LocalePack {
  id: string;
  nativeName: string;
  messages: Messages;
  plural?: (count: number) => PluralCategory;
}

const en: Messages = {
  common: {
    cancel: "Cancel",
    ok: "OK",
    discard: "Discard",
    close: "Close",
  },
  settings: {
    title: "Settings",
    lead: "These apply to every markdown file. Close this tab when you are done.",
    appearance: "Appearance",
    theme: "Theme",
    themeHint: "Auto follows the system. The others stay put.",
    font: "Font",
    fontHint: "Included faces ship with the app. The system list uses fonts that come with this computer.",
    sample: "The quick brown fox jumps over the lazy dog.",
    custom: "Custom…",
    customFont: "Custom font stack",
    smaller: "Smaller",
    larger: "Larger",
    language: "Language",
    languageHint: "Menus, settings, and labels. Markdown stays in the language you wrote it.",
    languageSystem: "System",
    editor: "Editor",
    view: "View",
    viewHint: "Write shows the marks when the cursor is in them. Read is the rendered page.",
    wordWrap: "Word wrap",
    wordWrapHint: "Wrap long lines to the window.",
    focus: "Focus",
    focusHint: "In Write, the text sits in the same column as Read.",
    fullMarkdown: "Full markdown",
    fullMarkdownHint: "Write and Split show marks, images, tables, and diagrams as typed text. Read still shows the page.",
    files: "Files",
    autoSave: "Auto save",
    autoSaveHint: "Save a file that already has a path.",
    restoreSession: "Restore session",
    restoreSessionHint: "Reopen the same tabs on the next launch.",
    recentFiles: "Recent files",
    recentFilesHint: "How many files the Open Recent menu keeps.",
    included: "Included",
    onThisMac: "On this Mac",
    onThisPc: "On this PC",
    onThisSystem: "On this system",
    systemFonts: "System",
  },
  themes: {
    auto: "Auto",
    light: "Light",
    paper: "Paper",
    fog: "Fog",
    dark: "Dark",
    ink: "Ink",
    moss: "Moss",
    dusk: "Dusk",
  },
  view: {
    write: "Write",
    split: "Split",
    read: "Read",
    splitView: "Split View",
    cycle: "Cycle View",
    cycleWith: "Cycle with {shortcut}",
    label: "View",
  },
  commands: {
    placeholder: "Type a command...",
    empty: "No matches",
    newTab: "New Tab",
    openFile: "Open File...",
    openUrl: "Open from URL...",
    save: "Save",
    saveAs: "Save As...",
    closeTab: "Close Tab",
    reopenTab: "Reopen Closed Tab",
    checkUpdates: "Check for Updates...",
    settings: "Settings",
    wordWrap: "Word Wrap",
    focus: "Focus",
    fullMarkdown: "Full Markdown",
    autoSave: "Auto Save",
    restoreSession: "Restore Session",
    colorTheme: "Color Theme",
    chooseFont: "Font",
    chooseLanguage: "Language",
    handoff: "Handoff",
    fontLarger: "Increase Font Size",
    fontSmaller: "Decrease Font Size",
    fontReset: "Reset Font Size",
    back: "Back",
    groups: {
      file: "File",
      view: "View",
      editor: "Editor",
      preferences: "Preferences",
      files: "Files",
      app: "mdplus",
    },
  },
  welcome: {
    slogan: "A calm place to write markdown.",
    newFile: "New file",
    open: "Open...",
    openUrl: "Open from URL...",
    recent: "Recent",
    tipBefore: "Tip: drop a ",
    tipAfter: " file onto the window to open it.",
  },
  status: {
    lineCol: "Ln {line}, Col {col}",
    words: { one: "{count} word", other: "{count} words" },
  },
  tabs: {
    settings: "Settings",
    untitled: "Untitled",
    untitledN: "Untitled-{n}",
    deleted: "(deleted)",
    close: "Close",
    scrollLeft: "Scroll tabs left",
    scrollRight: "Scroll tabs right",
    showAll: "Show all tabs",
    newTab: "New tab ({shortcut})",
    closeOthers: "Close Others",
    closeLeft: "Close Tabs to the Left",
    closeRight: "Close Tabs to the Right",
    closeAll: "Close All",
    copyPath: "Copy Full Path",
    copyLink: "Copy Link",
    copyFileName: "Copy File Name",
  },
  menu: {
    file: "File",
    edit: "Edit",
    view: "View",
    noRecent: "No Recent Files",
    openRecent: "Open Recent",
    newTab: "New Tab",
    open: "Open...",
    openUrl: "Open from URL...",
    save: "Save",
    saveAs: "Save As...",
    closeTab: "Close Tab",
    reopenTab: "Reopen Closed Tab",
    preferences: "Preferences...",
    checkUpdates: "Check for Updates...",
    quit: "Quit",
    commandPalette: "Command Palette...",
    handoff: "Handoff",
    write: "Write",
    splitView: "Split View",
    read: "Read",
  },
  dialog: {
    unsavedTitle: "Unsaved Changes",
    quit: "You have unsaved changes. Quit anyway?",
    discardNamed: '"{name}" has unsaved changes. Discard them?',
    changedTitle: "File changed on disk",
    overwrite:
      '"{name}" changed on disk since you opened it. Overwrite the external changes with what you have in the editor?',
    reload: "Reload the disk version instead? Your unsaved edits will be discarded.",
    overwriteAction: "Overwrite",
    reloadAction: "Reload",
  },
  openUrl: {
    title: "Open from URL",
    hint: "Paste a link to a markdown file. GitHub, GitLab, and similar pages are fine.",
    placeholder: "https://",
    open: "Open",
    opening: "Opening…",
    empty: "Paste a link.",
    scheme: "Use an http or https link.",
    page: "That link is a web page. Open the raw markdown file.",
    large: "That file is too large to open.",
    missing: "That file isn't available. A private repository needs a public link.",
    status: "The server returned {status}.",
    network: "Couldn't reach that link.",
  },
  handoff: {
    title: "Handoff",
    hint: "Optional note for {name}. The open file goes with it.",
    placeholder: "What should it do?",
    open: "Open",
    opening: "Opening…",
    failed: "Couldn't open Terminal.",
    clipboard: "Couldn't copy the instruction.",
    noDocument: "Open a markdown file first.",
    file: "The markdown file is {path}.",
    scratch: "This is a scratch copy of an untitled markdown file. The file is {path}.",
    scratchUrl: "This is a scratch copy of a markdown file opened from {url}. The file is {path}.",
    selection: "The user selected this passage (lines {from}-{to}):\n\n{text}",
    selectionRange: "The user selected lines {from}-{to}.",
  },
  preview: {
    empty: "Nothing to read yet",
    copy: "Copy",
    copied: "Copied",
    diagramFailed: "Could not draw this diagram",
    clickToEdit: "Click to edit",
  },
  editor: {
    startWriting: "Start writing",
    startHint: "Type to begin, or drop a .md file onto the window",
  },
  updates: {
    failed: "Couldn't check for updates. The update server may not be configured yet.",
    title: "Check for Updates",
    current: "You're up to date.",
    availableTitle: "Update available",
    available: "mdplus {version} is available. Install and restart now?",
  },
  files: {
    markdown: "Markdown",
  },
  window: {
    minimize: "Minimize",
    maximize: "Maximize",
    close: "Close",
    resizePanes: "Resize panes",
  },
};

function englishPlural(count: number): PluralCategory {
  return count === 1 ? "one" : "other";
}

export const locales: readonly LocalePack[] = [{ id: "en", nativeName: "English", messages: en, plural: englishPlural }];

const byId = new Map(locales.map((pack) => [pack.id, pack]));

export function packFor(id: string): LocalePack {
  return byId.get(id) ?? locales[0];
}

export function normalizeLocale(value: unknown): string {
  if (value === "system") return "system";
  if (typeof value === "string" && byId.has(value)) return value;
  return "system";
}

export function resolveLocale(preference: string, language?: string): string {
  if (preference !== "system" && byId.has(preference)) return preference;
  const tag = (language ?? (typeof navigator === "undefined" ? "en" : navigator.language)).toLowerCase();
  if (byId.has(tag)) return tag;
  const base = tag.split("-")[0] ?? "";
  for (const pack of locales) {
    const id = pack.id.toLowerCase();
    if (id === base || id.startsWith(`${base}-`)) return pack.id;
  }
  return locales[0].id;
}

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

export function pluralText(pack: LocalePack, forms: PluralForms, count: number): string {
  const category = (pack.plural ?? englishPlural)(count);
  return fill(forms[category] ?? forms.other, { count });
}

export function themeLabel(catalog: Messages, id: Theme): string {
  return catalog.themes[id];
}
