import {
  canvasFor,
  createLyricsRenderer,
  injectRomanization as injectRendererRomanization,
  injectTranslation as injectRendererTranslation,
  isLoaded,
  type LineData,
  type LyricPart,
  type LyricsRenderer,
  type LyricsRendererOptions,
  loadSync,
  ownsLine,
  resetPlaybackClock as resetRendererPlaybackClock,
  resumeAllAutoscroll as resumeRendererAutoscroll,
  snapshotCanvas,
} from "@braccato/core";
import { parseThemeConfig, setThemeSettings } from "@braccato/core/themeSettings";
import {
  ERROR_CLASS,
  LYRICS_CLASS,
  RENDERER_UNAVAILABLE_CLASS,
  RENDERER_UNAVAILABLE_HINT_CLASS,
  RENDERER_UNAVAILABLE_LOG,
  RENDERER_WASM_LOAD_FAILED_LOG,
} from "@constants";
import { getBrowserVendor } from "@core/browser";
import { t } from "@core/i18n";
import { logCore } from "@core/logger";

// -- Loading the renderer --------------------------

let wasmBytes: (() => BufferSource) | null = null;
let loadFailed = false;

/**
 * Hands the renderer its WebAssembly. Only the contexts that hand it over can draw lyrics (see
 * webglRendererWasm.ts), so no other bundle carries the bytes. It compiles synchronously, on the
 * first call that needs it: the module is small enough for the main thread, and it means lyrics
 * never wait on it.
 */
export function provideWebglRenderer(bytes: () => BufferSource): void {
  wasmBytes ??= bytes;
  ensureLoaded();
}

function ensureLoaded(): boolean {
  if (isLoaded()) return true;
  if (wasmBytes === null || loadFailed) return false;
  try {
    loadSync(wasmBytes());
    return true;
  } catch (error) {
    // A policy that forbids WebAssembly.
    loadFailed = true;
    logCore(RENDERER_WASM_LOAD_FAILED_LOG, error);
    return false;
  }
}

// -- Browsers it cannot draw in --------------------------

const webgl2InDocument = new WeakMap<Document, boolean>();

/** Whether `doc` can make a WebGL2 context, which the renderer needs. Asked once per document. */
function hasWebgl2(doc: Document): boolean {
  let has = webgl2InDocument.get(doc);
  if (has === undefined) {
    const context = doc.createElement("canvas").getContext("webgl2");
    has = context !== null;
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    webgl2InDocument.set(doc, has);
  }
  return has;
}

/** Where to turn hardware acceleration back on, in this browser's own words. */
function hardwareAccelerationHint(): string {
  switch (getBrowserVendor()) {
    case "firefox":
      return t("lyrics_rendererUnavailableHintFirefox");
    case "edge":
      return t("lyrics_rendererUnavailableHintEdge");
    default:
      return t("lyrics_rendererUnavailableHintChromium");
  }
}

/**
 * What a view shows where the renderer cannot draw: without WebGL2, which in practice means
 * hardware acceleration is off. Drawing lyrics without it is not supported, so the view says how to
 * turn it on and shows nothing else.
 */
function createUnavailableView(doc: Document): LyricsRenderer {
  let container: HTMLElement | null = null;
  return {
    setLyrics(_lyrics, lyricsOptions) {
      const mount = lyricsOptions?.mount;
      if (!mount) return;
      container = doc.createElement("div");
      container.className = LYRICS_CLASS;
      const message = doc.createElement("div");
      message.className = `${ERROR_CLASS} ${RENDERER_UNAVAILABLE_CLASS}`;
      message.textContent = t("lyrics_rendererUnavailable");
      const hint = doc.createElement("p");
      hint.className = RENDERER_UNAVAILABLE_HINT_CLASS;
      hint.textContent = hardwareAccelerationHint();
      container.replaceChildren(message, hint);
      mount.replaceChildren(container);
    },
    setLanguage() {},
    setTheme: () => false,
    tick: () => "ok",
    relayout() {},
    clear() {
      container?.remove();
      container = null;
    },
    destroy() {
      container?.remove();
      container = null;
    },
    noteUserScroll() {},
    noteVisibilityChange() {},
    resumeAutoscroll() {},
    clearOnScreenLyrics: () => false,
    scheduleLyricPositionUpdate() {},
    retickFromPlaybackClock: () => "ok",
    get container() {
      return container;
    },
    lines: [],
    syncType: "none",
    renderer: null,
  };
}

// -- The view --------------------------

/**
 * A lyrics view drawn by braccato's renderer, or, where the browser has no WebGL2, one that says how
 * to turn hardware acceleration on.
 *
 * The renderer's `lines` are records over its own song: they carry what this extension reads and
 * writes (`lyricElement`, `time`, `duration`, `parts`), which is why they are handed out as
 * `LineData`.
 */
export function createLyricsView(options: LyricsRendererOptions): LyricsRenderer {
  let active: LyricsRenderer | null = null;
  let themeCss: string | null = null;

  function current(): LyricsRenderer {
    if (active !== null) return active;
    if (ensureLoaded() && hasWebgl2(options.document)) {
      active = createLyricsRenderer(options);
    } else {
      logCore(RENDERER_UNAVAILABLE_LOG);
      active = createUnavailableView(options.document);
    }
    if (themeCss !== null) active.setTheme(themeCss);
    return active;
  }

  return {
    setLyrics(lyrics, lyricsOptions) {
      try {
        current().setLyrics(lyrics, lyricsOptions);
      } catch (error) {
        // The renderer could not make its context after all; anything else is a bug.
        if (!String(error).toLowerCase().includes("webgl2")) throw error;
        logCore(RENDERER_UNAVAILABLE_LOG, error);
        active?.destroy();
        active = createUnavailableView(options.document);
        active.setLyrics(lyrics, { ...lyricsOptions, mount: lyricsOptions?.mount ?? options.mount });
      }
    },
    setTheme(css) {
      themeCss = css;
      // The settings registry is this extension's, and the renderer reads its own copy of the
      // comments, so it is filled here.
      const settingsChanged = setThemeSettings(parseThemeConfig(css));
      const rendererChanged = active?.setTheme(css) ?? false;
      return settingsChanged || rendererChanged;
    },
    setLanguage: language => active?.setLanguage(language),
    tick: (currentTimeS, tickOptions) => active?.tick(currentTimeS, tickOptions) ?? "lyrics-missing",
    relayout: measureLines => active?.relayout(measureLines),
    clear: () => active?.clear(),
    destroy: () => active?.destroy(),
    noteUserScroll: () => active?.noteUserScroll(),
    noteVisibilityChange: () => active?.noteVisibilityChange(),
    resumeAutoscroll: () => active?.resumeAutoscroll(),
    clearOnScreenLyrics: () => active?.clearOnScreenLyrics() ?? false,
    scheduleLyricPositionUpdate: (isTicking, retick) => active?.scheduleLyricPositionUpdate(isTicking, retick),
    retickFromPlaybackClock: buildOptions => active?.retickFromPlaybackClock(buildOptions) ?? "lyrics-missing",
    get container() {
      return active?.container ?? null;
    },
    get lines() {
      return active?.lines ?? [];
    },
    get syncType() {
      return active?.syncType ?? "none";
    },
    get renderer() {
      return active?.renderer ?? null;
    },
  };
}

// -- Song-wide operations --------------------------

/** Clears the renderer's playback history, as a new song should. */
export function resetPlaybackClock(): void {
  if (isLoaded()) resetRendererPlaybackClock();
}

/** Resumes autoscroll in every view. */
export function resumeAllAutoscroll(): void {
  if (isLoaded()) resumeRendererAutoscroll();
}

// -- Decorations --------------------------

/** Hangs a translation on a line the renderer built. */
export function injectTranslation(doc: Document, lyricElement: HTMLElement, text: string, language?: string | null) {
  if (isLoaded() && ownsLine(lyricElement)) injectRendererTranslation(doc, lyricElement, text, language);
}

/** Hangs a romanization on a line the renderer built. */
export function injectRomanization(
  doc: Document,
  lyricElement: HTMLElement,
  lineData: LineData,
  text: string,
  timedRomanization: LyricPart[] | null = null
) {
  if (isLoaded() && ownsLine(lyricElement)) {
    injectRendererRomanization(doc, lyricElement, lineData, text, timedRomanization);
  }
}

// -- What a view shows --------------------------

/** The canvas a view draws `container`'s lines on, or null where it draws none. */
export function rendererCanvas(container: HTMLElement): HTMLCanvasElement | null {
  return isLoaded() ? canvasFor(container) : null;
}

/**
 * Copies what the views inside `source` show onto the matching canvases of `clone`, a deep clone of
 * it: a WebGL canvas clones blank.
 */
export function copyRendererCanvases(source: HTMLElement, clone: HTMLElement): void {
  if (!isLoaded()) return;
  const originals = source.querySelectorAll("canvas");
  const copies = clone.querySelectorAll("canvas");
  originals.forEach((canvas, index) => {
    const snapshot = snapshotCanvas(canvas);
    if (snapshot) copies[index]?.replaceWith(snapshot);
  });
}
