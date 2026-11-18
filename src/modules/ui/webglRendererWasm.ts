import rendererWasm from "@braccato/core-rs/wasm";
import { provideWebglRenderer } from "@modules/ui/lyricsRenderer";

// -- The WebGL renderer's wasm --------------------------

/**
 * Hands the WebGL lyrics renderer its WebAssembly, which the build inlines into whatever imports this
 * module (see extension.config.js). Imported only by the contexts that draw with it, the content
 * script and the options page, so no other bundle carries the bytes.
 */
export function loadWebglRenderer(): Promise<void> {
  return provideWebglRenderer(() => {
    const binary = atob(rendererWasm.slice(rendererWasm.indexOf(",") + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  });
}
