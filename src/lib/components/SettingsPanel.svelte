<script lang="ts">
  import {
    RECENT_FILES_MAX,
    RECENT_FILES_MIN,
    normalizeRecentFilesLimit,
    settings,
    updateSettings,
    clampNumber,
  } from "../stores/settings";
  import { APPEARANCES } from "../themes";
  import { currentFontOs, fontsForOs, type FontGroup } from "../fonts";
  import { locales, messages, themeLabel } from "../i18n";
  import type { ViewMode } from "../ipc/settings";

  const fontOs = currentFontOs();
  const fontChoices = fontsForOs(fontOs);
  const includedFonts = fontChoices.filter((font) => font.group === "included");
  const osFonts = fontChoices.filter((font) => font.group === fontOs);
  const systemFonts = fontChoices.filter((font) => font.group === "system");
  let forceCustom = $state(false);

  const matchedFontId = $derived(fontChoices.find((font) => font.stack === $settings.fontFamily)?.id ?? "");
  const customFont = $derived(forceCustom || matchedFontId === "");

  const views: { value: ViewMode; label: "write" | "split" | "read" }[] = [
    { value: "source", label: "write" },
    { value: "split", label: "split" },
    { value: "preview", label: "read" },
  ];

  function pickFont(id: string) {
    if (id === "custom") {
      forceCustom = true;
      return;
    }
    forceCustom = false;
    const font = fontChoices.find((item) => item.id === id);
    if (font) updateSettings({ fontFamily: font.stack });
  }

  function setFontSize(value: number) {
    updateSettings({ fontSize: clampNumber(value, 10, 28, $settings.fontSize) });
  }

  function setRecentLimit(value: number) {
    updateSettings({
      recentFilesLimit: clampNumber(
        value,
        RECENT_FILES_MIN,
        RECENT_FILES_MAX,
        normalizeRecentFilesLimit($settings.recentFilesLimit),
      ),
    });
  }

  function groupLabel(group: FontGroup): string {
    if (group === "included") return $messages.settings.included;
    if (group === "system") return $messages.settings.systemFonts;
    if (group === "mac") return $messages.settings.onThisMac;
    if (group === "windows") return $messages.settings.onThisPc;
    return $messages.settings.onThisSystem;
  }
</script>

{#snippet stepper(value: number, min: number, max: number, set: (next: number) => void)}
  <div class="stepper">
    <button type="button" aria-label={$messages.settings.smaller} disabled={value <= min} onclick={() => set(value - 1)}>
      −
    </button>
    <input type="number" {min} {max} {value} onchange={(e) => set(Number(e.currentTarget.value))} />
    <button type="button" aria-label={$messages.settings.larger} disabled={value >= max} onclick={() => set(value + 1)}>
      +
    </button>
  </div>
{/snippet}

{#snippet toggle(on: boolean, labelId: string, set: (next: boolean) => void)}
  <button
    type="button"
    class="switch"
    role="switch"
    aria-checked={on}
    aria-labelledby={labelId}
    onclick={() => set(!on)}
  >
    <span class="knob"></span>
  </button>
{/snippet}

<div class="settings-page">
  <div class="settings-column">
    <header>
      <h1>{$messages.settings.title}</h1>
      <p>{$messages.settings.lead}</p>
    </header>

    <section>
      <h2>{$messages.settings.appearance}</h2>
      <div class="row">
        <div class="copy">
          <span class="name">{$messages.settings.theme}</span>
          <span class="hint">{$messages.settings.themeHint}</span>
        </div>
        <div class="themes" role="group" aria-label={$messages.settings.theme}>
          <button
            type="button"
            class="chip"
            aria-pressed={$settings.theme === "auto"}
            onclick={() => updateSettings({ theme: "auto" })}
          >
            <span class="swatch swatch-auto" aria-hidden="true"></span>
            {$messages.themes.auto}
          </button>
          {#each APPEARANCES as item (item.id)}
            <button
              type="button"
              class="chip"
              aria-pressed={$settings.theme === item.id}
              onclick={() => updateSettings({ theme: item.id })}
            >
              <span class="swatch" style="background: {item.paper}; color: {item.ink}" aria-hidden="true"></span>
              {themeLabel($messages, item.id)}
            </button>
          {/each}
        </div>
      </div>

      <div class="row">
        <div class="copy">
          <span class="name">{$messages.settings.font}</span>
          <span class="hint">{$messages.settings.fontHint}</span>
        </div>
        <div class="controls controls-font">
          <span class="select font-select">
            <select
              class="control"
              aria-label={$messages.settings.font}
              style="font-family: {$settings.fontFamily}"
              value={customFont ? "custom" : matchedFontId}
              onchange={(e) => pickFont(e.currentTarget.value)}
            >
              <optgroup label={groupLabel("included")}>
                {#each includedFonts as font (font.id)}
                  <option value={font.id}>{font.label}</option>
                {/each}
              </optgroup>
              <optgroup label={groupLabel(fontOs)}>
                {#each osFonts as font (font.id)}
                  <option value={font.id}>{font.label}</option>
                {/each}
              </optgroup>
              <optgroup label={groupLabel("system")}>
                {#each systemFonts as font (font.id)}
                  <option value={font.id}>{font.label}</option>
                {/each}
              </optgroup>
              <option value="custom">{$messages.settings.custom}</option>
            </select>
          </span>
          {@render stepper($settings.fontSize, 10, 28, setFontSize)}
          {#if customFont}
            <input
              type="text"
              class="control custom-font"
              aria-label={$messages.settings.customFont}
              value={$settings.fontFamily}
              spellcheck="false"
              onchange={(e) => updateSettings({ fontFamily: e.currentTarget.value })}
            />
          {/if}
        </div>
      </div>

      <div class="row">
        <div class="copy">
          <span class="name" id="language-label">{$messages.settings.language}</span>
          <span class="hint">{$messages.settings.languageHint}</span>
        </div>
        <span class="select">
          <select
            class="control"
            aria-labelledby="language-label"
            value={$settings.locale}
            onchange={(e) => updateSettings({ locale: e.currentTarget.value })}
          >
            <option value="system">{$messages.settings.languageSystem}</option>
            {#each locales as pack (pack.id)}
              <option value={pack.id}>{pack.nativeName}</option>
            {/each}
          </select>
        </span>
      </div>
    </section>

    <section>
      <h2>{$messages.settings.editor}</h2>
      <div class="row">
        <div class="copy">
          <span class="name">{$messages.settings.view}</span>
          <span class="hint">{$messages.settings.viewHint}</span>
        </div>
        <div class="segmented" role="group" aria-label={$messages.view.label}>
          {#each views as item (item.value)}
            <button
              type="button"
              aria-pressed={$settings.viewMode === item.value}
              onclick={() => updateSettings({ viewMode: item.value })}
            >
              {$messages.view[item.label]}
            </button>
          {/each}
        </div>
      </div>
      <div class="row">
        <div class="copy">
          <span class="name" id="wrap-label">{$messages.settings.wordWrap}</span>
          <span class="hint">{$messages.settings.wordWrapHint}</span>
        </div>
        {@render toggle($settings.wordWrap, "wrap-label", (on) => updateSettings({ wordWrap: on }))}
      </div>
      <div class="row">
        <div class="copy">
          <span class="name" id="focus-label">{$messages.settings.focus}</span>
          <span class="hint">{$messages.settings.focusHint}</span>
        </div>
        {@render toggle($settings.focusMode, "focus-label", (on) => updateSettings({ focusMode: on }))}
      </div>
      <div class="row">
        <div class="copy">
          <span class="name" id="full-md-label">{$messages.settings.fullMarkdown}</span>
          <span class="hint">{$messages.settings.fullMarkdownHint}</span>
        </div>
        {@render toggle($settings.fullMarkdown, "full-md-label", (on) => updateSettings({ fullMarkdown: on }))}
      </div>
    </section>

    <section>
      <h2>{$messages.settings.files}</h2>
      <div class="row">
        <div class="copy">
          <span class="name" id="autosave-label">{$messages.settings.autoSave}</span>
          <span class="hint">{$messages.settings.autoSaveHint}</span>
        </div>
        {@render toggle($settings.autoSave, "autosave-label", (on) => updateSettings({ autoSave: on }))}
      </div>
      <div class="row">
        <div class="copy">
          <span class="name" id="restore-label">{$messages.settings.restoreSession}</span>
          <span class="hint">{$messages.settings.restoreSessionHint}</span>
        </div>
        {@render toggle($settings.restoreSession, "restore-label", (on) => updateSettings({ restoreSession: on }))}
      </div>
      <div class="row">
        <div class="copy">
          <span class="name">{$messages.settings.recentFiles}</span>
          <span class="hint">{$messages.settings.recentFilesHint}</span>
        </div>
        {@render stepper(normalizeRecentFilesLimit($settings.recentFilesLimit), RECENT_FILES_MIN, RECENT_FILES_MAX, setRecentLimit)}
      </div>
    </section>
  </div>
</div>

<style>
  .settings-page {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--mdplus-card-bg);
  }

  .settings-column {
    max-width: 640px;
    margin: 0 auto;
    padding: 22px 28px 48px;
  }

  h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--mdplus-text);
  }

  header p {
    margin: 4px 0 0;
    color: var(--mdplus-text-muted);
    font-size: 13px;
    line-height: 1.4;
  }

  h2 {
    margin: 22px 0 0;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--mdplus-border);
    font-size: 13px;
    font-weight: 600;
    color: var(--mdplus-text);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px 24px;
    padding: 10px 0;
    border-bottom: 1px solid var(--mdplus-border);
  }

  section .row:last-child {
    border-bottom: none;
  }

  .copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1 1 180px;
  }

  .name {
    font-size: 13px;
    color: var(--mdplus-text);
  }

  .hint {
    font-size: 12px;
    line-height: 1.4;
    color: var(--mdplus-text-muted);
  }

  .themes {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: nowrap;
    align-items: center;
    gap: 6px;
    height: 26px;
    min-width: 0;
    max-width: 420px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .themes::-webkit-scrollbar {
    display: none;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    box-sizing: border-box;
    margin: 0;
    padding: 0 8px 0 6px;
    border: 1px solid var(--mdplus-border);
    border-radius: 4px;
    background: var(--mdplus-bg-subtle);
    color: var(--mdplus-text);
    font: inherit;
    font-size: 12.5px;
    line-height: 1;
    cursor: pointer;
  }

  .chip:hover {
    background: var(--mdplus-hover);
  }

  .chip[aria-pressed="true"] {
    border-color: var(--mdplus-accent);
    box-shadow: inset 0 0 0 1px var(--mdplus-accent);
  }

  .swatch {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    border-radius: 2px;
    background: var(--mdplus-bg);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 45%, transparent);
  }

  .swatch-auto {
    background: linear-gradient(135deg, #ffffff 50%, #1e1e1e 50%);
    color: #3a3a3a;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .controls-font {
    flex-wrap: wrap;
    justify-content: flex-end;
    width: min(100%, 348px);
  }

  .select {
    position: relative;
    display: inline-flex;
    align-items: center;
    height: 26px;
    flex-shrink: 0;
  }

  .select select {
    width: 180px;
  }

  .font-select,
  .font-select select {
    width: 240px;
  }

  .control {
    box-sizing: border-box;
    height: 26px;
    margin: 0;
    padding: 0 8px;
    border: 1px solid var(--mdplus-border);
    border-radius: 4px;
    background: var(--mdplus-bg-subtle);
    color: var(--mdplus-text);
    font: inherit;
    font-size: 13px;
    line-height: 24px;
    outline: none;
  }

  select.control {
    padding-right: 24px;
    appearance: none;
    -webkit-appearance: none;
  }

  .select::after {
    content: "";
    position: absolute;
    right: 9px;
    top: 9px;
    width: 6px;
    height: 6px;
    border-right: 1.5px solid var(--mdplus-text-muted);
    border-bottom: 1.5px solid var(--mdplus-text-muted);
    transform: rotate(45deg);
    pointer-events: none;
  }

  .custom-font {
    flex: 1 0 100%;
    min-width: 0;
    width: 100%;
  }

  .control:focus {
    border-color: var(--mdplus-accent);
  }

  .stepper {
    display: flex;
    flex-shrink: 0;
    align-items: stretch;
    box-sizing: border-box;
    height: 26px;
    border: 1px solid var(--mdplus-border);
    border-radius: 4px;
    overflow: hidden;
    background: var(--mdplus-bg-subtle);
  }

  .stepper button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: auto;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--mdplus-text);
    font: inherit;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
  }

  .stepper button:hover:not(:disabled) {
    background: var(--mdplus-hover);
  }

  .stepper button:disabled {
    color: var(--mdplus-text-muted);
    cursor: default;
  }

  .stepper input {
    width: 40px;
    height: auto;
    margin: 0;
    padding: 0;
    border: none;
    border-left: 1px solid var(--mdplus-border);
    border-right: 1px solid var(--mdplus-border);
    background: transparent;
    color: var(--mdplus-text);
    font: inherit;
    font-size: 13px;
    line-height: 24px;
    text-align: center;
    outline: none;
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .stepper input::-webkit-outer-spin-button,
  .stepper input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .switch {
    width: 36px;
    height: 20px;
    flex-shrink: 0;
    padding: 2px;
    border: none;
    border-radius: 10px;
    background: var(--mdplus-active);
    cursor: pointer;
  }

  .switch[aria-checked="true"] {
    background: var(--mdplus-accent);
  }

  .knob {
    display: block;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    transition: transform 0.15s ease;
  }

  .switch[aria-checked="true"] .knob {
    transform: translateX(16px);
  }

  .segmented {
    display: flex;
    flex-shrink: 0;
    align-items: stretch;
    box-sizing: border-box;
    height: 26px;
    border: 1px solid var(--mdplus-border);
    border-radius: 4px;
    overflow: hidden;
  }

  .segmented button {
    display: flex;
    align-items: center;
    appearance: none;
    border: none;
    background: var(--mdplus-bg-subtle);
    color: var(--mdplus-text-muted);
    font: inherit;
    font-size: 12.5px;
    line-height: 1;
    padding: 0 10px;
    cursor: pointer;
  }

  .segmented button + button {
    box-shadow: inset 1px 0 0 var(--mdplus-border);
  }

  .segmented button[aria-pressed="true"] {
    background: var(--mdplus-segment-active-bg);
    color: var(--mdplus-text);
  }

  .chip:focus-visible,
  .control:focus-visible,
  .stepper button:focus-visible,
  .segmented button:focus-visible,
  .switch:focus-visible {
    outline: 2px solid var(--mdplus-accent);
    outline-offset: 1px;
  }
</style>
