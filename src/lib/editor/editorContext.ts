import { Compartment, Facet, StateEffect, type Extension } from "@codemirror/state";

// The open file, so relative image paths can be resolved against its folder.
export const documentPathFacet = Facet.define<string | null, string | null>({
  combine: (values) => (values.length ? values[values.length - 1] : null),
});

// Resolved light/dark, not the "auto" setting. Mermaid reads this when it draws.
export const mermaidDarkFacet = Facet.define<boolean, boolean>({
  combine: (values) => (values.length ? values[values.length - 1] : false),
});

// Source mode draws a diagram in place of a ```mermaid fence. Split mode leaves
// the fence as text, because the preview beside it is already showing the picture.
export const mermaidLiveFacet = Facet.define<boolean, boolean>({
  combine: (values) => (values.length ? values[values.length - 1] : true),
});

// When this is off, Write and Split keep marks, images, tables, and diagrams
// as typed text. Syntax colors stay. Read does not use this facet.
export const sourceRenderFacet = Facet.define<boolean, boolean>({
  combine: (values) => (values.length ? values[values.length - 1] : true),
});

// Write draws images, tables, and task boxes in the editor. Split leaves
// them as text, because the preview beside it is already showing them.
// Drawing them as they scroll into view is what hitches the first pass.
export const liveBlocksFacet = Facet.define<boolean, boolean>({
  combine: (values) => (values.length ? values[values.length - 1] : true),
});

export const editorContextCompartment = new Compartment();

// The syntax tree is lazy. The viewport plugin parses what's on screen, then
// dispatches this so block widgets (tables, diagrams) rebuild.
export const viewportParsed = StateEffect.define<void>();

export function editorContext(options: {
  path: string | null;
  dark: boolean;
  liveMermaid: boolean;
  renderSource?: boolean;
  liveBlocks?: boolean;
}): Extension {
  return [
    documentPathFacet.of(options.path),
    mermaidDarkFacet.of(options.dark),
    mermaidLiveFacet.of(options.liveMermaid),
    sourceRenderFacet.of(options.renderSource !== false),
    liveBlocksFacet.of(options.liveBlocks !== false),
  ];
}
