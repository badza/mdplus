// KaTeX lays math out with its own faces. If those faces arrive after the
// preview is on screen, the first scroll through a formula reflows it.
const FAMILIES = [
  "KaTeX_AMS",
  "KaTeX_Caligraphic",
  "KaTeX_Fraktur",
  "KaTeX_Main",
  "KaTeX_Math",
  "KaTeX_SansSerif",
  "KaTeX_Script",
  "KaTeX_Size1",
  "KaTeX_Size2",
  "KaTeX_Size3",
  "KaTeX_Size4",
  "KaTeX_Typewriter",
];

let pending: Promise<void> | null = null;

function loadAll(): Promise<void> {
  const fonts = document.fonts;
  if (!fonts) return Promise.resolve();
  const jobs: Promise<unknown>[] = [];
  for (const family of FAMILIES) {
    for (const spec of [
      `400 1em "${family}"`,
      `italic 400 1em "${family}"`,
      `700 1em "${family}"`,
      `italic 700 1em "${family}"`,
    ]) {
      jobs.push(fonts.load(spec).catch(() => []));
    }
  }
  return Promise.all(jobs).then(() => undefined);
}

export function whenKatexFontsReady(): Promise<void> {
  if (pending) return pending;
  const fonts = document.fonts;
  pending = (async () => {
    await loadAll();
    if (!fonts || fonts.check('16px "KaTeX_Main"')) return;
    // The faces were asked for before the stylesheet had applied.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await loadAll();
  })();
  return pending;
}
