import rendererWasm from "@braccato/core/wasm";
import { provideRendererWasm } from "@modules/ui/lyricsRenderer";

// -- The lyrics renderer's wasm --------------------------

/**
 * Hands the lyrics renderer its WebAssembly, which the build inlines into whatever imports this
 * module as a data URL (see extension.config.js). Imported only by the contexts that draw lyrics,
 * the content script and the options page, so no other bundle carries the bytes.
 */
export function loadWebglRenderer(): void {
  provideRendererWasm(rendererWasm);
}

/** The wasm as a data URL, for the page world, which draws Firefox's Picture-in-Picture. */
export function rendererWasmDataUrl(): string {
  return rendererWasm;
}
