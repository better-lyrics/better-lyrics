// The build inlines @braccato/core's WebAssembly as a data URL (see extension.config.js).
declare module "@braccato/core/wasm" {
  const dataUrl: string;
  export default dataUrl;
}
