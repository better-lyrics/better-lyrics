// The registry itself lives in the renderer, which is what defines these settings. This file keeps
// the extension-side import path stable until the call sites move into the module.

export { registerThemeSetting, setThemeSettings } from "@renderer/index";
