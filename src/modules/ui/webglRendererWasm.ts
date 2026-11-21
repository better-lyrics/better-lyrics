import rendererWasm from "@braccato/core/wasm";
import { provideWebglRenderer } from "@modules/ui/lyricsRenderer";

// -- The lyrics renderer's wasm --------------------------

/**
 * Hands the lyrics renderer its WebAssembly, which the build inlines into whatever imports this
 * module (see extension.config.js). Imported only by the contexts that draw lyrics, the content
 * script and the options page, so no other bundle carries the bytes.
 */
export function loadWebglRenderer(): void {
  provideWebglRenderer(() => {
    const binary = atob(rendererWasm.slice(rendererWasm.indexOf(",") + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  });
}
