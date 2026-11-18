// The build inlines @braccato/core-rs's WebAssembly as a data URL (see extension.config.js).
declare module "@braccato/core-rs/wasm" {
  const dataUrl: string;
  export default dataUrl;
}
