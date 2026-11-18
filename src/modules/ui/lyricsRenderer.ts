import {
  createLyricsRenderer as createDomRenderer,
  injectRomanization as injectDomRomanization,
  injectTranslation as injectDomTranslation,
  type LineData,
  type LyricPart,
  type LyricsRenderer,
  type LyricsRendererOptions,
  resetPlaybackClock as resetDomPlaybackClock,
  resumeAllAutoscroll as resumeDomAutoscroll,
} from "@braccato/core";
import { parseThemeConfig, registerThemeSetting, setThemeSettings } from "@braccato/core/themeSettings";
import {
  canvasFor as webglCanvasFor,
  createLyricsRenderer as createWebglRenderer,
  injectRomanization as injectWebglRomanization,
  injectTranslation as injectWebglTranslation,
  isLoaded as isWebglLoaded,
  load as loadWebgl,
  ownsLine as webglOwnsLine,
  resetPlaybackClock as resetWebglPlaybackClock,
  resumeAllAutoscroll as resumeWebglAutoscroll,
  snapshotCanvas as snapshotWebglCanvas,
} from "@braccato/core-rs";
import { RENDERER_FALLBACK_LOG, RENDERER_SETTING, RENDERER_WASM_LOAD_FAILED_LOG } from "@constants";
import { logCore } from "@core/logger";

// -- Which renderer --------------------------

/**
 * Lyrics are drawn by `@braccato/core-rs` (WebGL2) unless the theme asks for the DOM renderer with
 * `blyrics-renderer = dom;`. That renderer styles the lyrics through `--blyrics-*` custom properties
 * only, so a theme whose rules restyle the line elements themselves (filters, keyframes, per-line
 * opacity) needs the DOM renderer, and says so this way. Changing it rebuilds the lyrics.
 */
const rendererSetting = registerThemeSetting(RENDERER_SETTING, "webgl", true);

type RendererKind = "dom" | "webgl";

function wantsWebgl(): boolean {
  return rendererSetting.getStringValue().trim().toLowerCase() !== "dom";
}

// -- Loading the WebGL renderer --------------------------

let loading: Promise<void> | null = null;
let unavailable = false;

/**
 * Starts compiling the WebGL renderer from `bytes`, once. Only the contexts that hand it over can draw
 * with it (see webglRendererWasm.ts), so the page world, which never does, keeps the DOM renderer and
 * its bundle stays free of the wasm. Compiling takes milliseconds, well before the first lyrics
 * arrive; lyrics handed over before it is done, or where it failed (a policy that forbids
 * WebAssembly), are drawn by the DOM renderer.
 */
export function provideWebglRenderer(bytes: () => BufferSource): Promise<void> {
  if (loading !== null) return loading;
  loading = Promise.resolve()
    .then(() => loadWebgl(bytes()))
    .catch(error => {
      unavailable = true;
      logCore(RENDERER_WASM_LOAD_FAILED_LOG, error);
    });
  return loading;
}

function chooseKind(): RendererKind {
  return wantsWebgl() && !unavailable && isWebglLoaded() ? "webgl" : "dom";
}

// -- The view --------------------------

/**
 * A lyrics view that draws with whichever renderer the theme and the browser allow, behind the
 * `LyricsRenderer` interface both share. The renderer is chosen when lyrics are handed over, so a
 * change of theme takes effect with the next build, which a renderer change asks for.
 *
 * The WebGL renderer's `lines` are records over its own song rather than the DOM renderer's render
 * state. They carry what this extension reads and writes (`lyricElement`, `time`, `duration`,
 * `parts`), which is why they are handed out as `LineData`.
 */
export function createLyricsView(options: LyricsRendererOptions): LyricsRenderer {
  let kind: RendererKind = "dom";
  let active: LyricsRenderer = createDomRenderer(options);
  let mount = options.mount;
  let themeCss: string | null = null;

  function createRenderer(next: RendererKind): LyricsRenderer {
    const created =
      next === "webgl"
        ? (createWebglRenderer({ ...options, mount }) as unknown as LyricsRenderer)
        : createDomRenderer({ ...options, mount });
    if (themeCss !== null) created.setTheme(themeCss);
    return created;
  }

  function switchTo(next: RendererKind): void {
    if (next === kind) return;
    active.destroy();
    kind = next;
    active = createRenderer(next);
  }

  return {
    setLyrics(lyrics, lyricsOptions) {
      mount = lyricsOptions?.mount ?? mount;
      switchTo(chooseKind());
      try {
        active.setLyrics(lyrics, lyricsOptions);
      } catch (error) {
        if (kind !== "webgl") throw error;
        // No WebGL2 in this document, or the context was refused: the DOM renderer draws instead.
        logCore(RENDERER_FALLBACK_LOG, error);
        unavailable = true;
        switchTo("dom");
        active.setLyrics(lyrics, lyricsOptions);
      }
    },
    setTheme(css) {
      themeCss = css;
      // The settings registry is this extension's as well as the DOM renderer's, and the WebGL
      // renderer reads its own copy of the comments, so it is filled here whichever is drawing.
      const settingsChanged = setThemeSettings(parseThemeConfig(css));
      const rendererChanged = active.setTheme(css);
      return settingsChanged || rendererChanged;
    },
    setLanguage: language => active.setLanguage(language),
    tick: (currentTimeS, tickOptions) => active.tick(currentTimeS, tickOptions),
    relayout: measureLines => active.relayout(measureLines),
    clear: () => active.clear(),
    destroy: () => active.destroy(),
    noteUserScroll: () => active.noteUserScroll(),
    noteVisibilityChange: () => active.noteVisibilityChange(),
    resumeAutoscroll: () => active.resumeAutoscroll(),
    clearOnScreenLyrics: () => active.clearOnScreenLyrics(),
    scheduleLyricPositionUpdate: (isTicking, retick) => active.scheduleLyricPositionUpdate(isTicking, retick),
    retickFromPlaybackClock: buildOptions => active.retickFromPlaybackClock(buildOptions),
    get container() {
      return active.container;
    },
    get lines() {
      return active.lines;
    },
    get syncType() {
      return active.syncType;
    },
  };
}

// -- Song-wide operations --------------------------

/** Clears the playback history both renderers keep, as a new song should. */
export function resetPlaybackClock(): void {
  resetDomPlaybackClock();
  if (isWebglLoaded()) resetWebglPlaybackClock();
}

/** Resumes autoscroll in every view of either renderer. */
export function resumeAllAutoscroll(): void {
  resumeDomAutoscroll();
  if (isWebglLoaded()) resumeWebglAutoscroll();
}

// -- Decorations --------------------------

function isWebglLine(lyricElement: HTMLElement): boolean {
  return isWebglLoaded() && webglOwnsLine(lyricElement);
}

/** Hangs a translation on a line built by either renderer. */
export function injectTranslation(doc: Document, lyricElement: HTMLElement, text: string, language?: string | null) {
  if (isWebglLine(lyricElement)) injectWebglTranslation(doc, lyricElement, text, language);
  else injectDomTranslation(doc, lyricElement, text, language);
}

/** Hangs a romanization on a line built by either renderer. */
export function injectRomanization(
  doc: Document,
  lyricElement: HTMLElement,
  lineData: LineData,
  text: string,
  timedRomanization: LyricPart[] | null = null
) {
  if (isWebglLine(lyricElement)) injectWebglRomanization(doc, lyricElement, lineData, text, timedRomanization);
  else injectDomRomanization(doc, lyricElement, lineData, text, timedRomanization);
}

// -- What a WebGL view shows --------------------------

/** The canvas a WebGL view draws `container`'s lines on, or null for a DOM view. */
export function rendererCanvas(container: HTMLElement): HTMLCanvasElement | null {
  return isWebglLoaded() ? webglCanvasFor(container) : null;
}

/**
 * Copies what the WebGL views inside `source` show onto the matching canvases of `clone`, a deep
 * clone of it: a WebGL canvas clones blank.
 */
export function copyRendererCanvases(source: HTMLElement, clone: HTMLElement): void {
  if (!isWebglLoaded()) return;
  const originals = source.querySelectorAll("canvas");
  const copies = clone.querySelectorAll("canvas");
  originals.forEach((canvas, index) => {
    const snapshot = snapshotWebglCanvas(canvas);
    if (snapshot) copies[index]?.replaceWith(snapshot);
  });
}
