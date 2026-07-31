const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

// The renderer's stylesheets live inside its package boundary, but they ship at the paths
// css/blyrics/index.css already imports, so the manifest and the two injection sites never learn
// that the sources moved.
const RENDERER_STYLES_DIR = join(__dirname, "src", "renderer", "styles");
const RENDERER_STYLES_OUTPUT_DIR = "css/blyrics";

const rendererStylesheets = () =>
  readdirSync(RENDERER_STYLES_DIR)
    .filter((name) => name.endsWith(".css"))
    .map((name) => ({ name, path: join(RENDERER_STYLES_DIR, name) }));

// Emitted from the emit hook rather than from a processAssets stage so the CSS minimizer leaves
// them byte for byte as authored, which is how the copies under public/ arrive too.
const emitRendererStyles = {
  apply: (compiler) => {
    compiler.hooks.thisCompilation.tap("EmitRendererStyles", (compilation) => {
      for (const { path } of rendererStylesheets()) {
        compilation.fileDependencies.add(path);
      }
    });

    compiler.hooks.emit.tap("EmitRendererStyles", (compilation) => {
      for (const { name, path } of rendererStylesheets()) {
        const contents = readFileSync(path);
        compilation.emitAsset(`${RENDERER_STYLES_OUTPUT_DIR}/${name}`, {
          source: () => contents,
          size: () => contents.length,
        });
      }
    });
  },
};

module.exports = {
  dev: {
    browser: "chrome",
  },
  config: (config) => {
    config.devtool = "source-map";
    return config;
  },
  browser: {
    chrome: {
      preferences: { theme: "dark" },
      excludeBrowserFlags: [ // this appears to not work
        '--hide-scrollbars', // Allow scrollbars to be visible
        '--mute-audio', // Allow audio to play
        '--disable-component-extensions-with-background-pages' // Allow component extensions to load
      ],
      browserFlags: [
        "--remote-debugging-port",
        "9222",
        "https://music.youtube.com/watch?v=D_3nlLlPMxA&list=RDAMVMEmq17wn71jA",
      ],
      profile: "dist/chrome-profile",
    },
    firefox: {
      preferences: { theme: "dark" },
      excludeBrowserFlags: [
        '--hide-scrollbars', // Allow scrollbars to be visible
        '--disable-component-extensions-with-background-pages' // Allow component extensions to load
      ],
      browserFlags: [
        "https://music.youtube.com/watch?v=Emq17wn71jA&list=RDAMVMxe9j9hPn6Bc",
      ],
      profile: "dist/firefox-profile",
    },
  },
  config: (config) => {
    const isCanaryRelease = process.env.RELEASE_TYPE === "canary";
    const isDevelopment = config.mode !== "production";

    config.plugins.push(emitRendererStyles);

    if (!isDevelopment) {
      console.log("\x1b[31m[BetterLyrics]\x1b[0m Building for", isCanaryRelease ? "canary release" : "standard release");

      // Minify locale JSON files for prod builds
      config.plugins.push({
        apply: (compiler) => {
          compiler.hooks.emit.tap("MinifyLocales", (compilation) => {
            for (const [name, asset] of Object.entries(compilation.assets)) {
              if (name.startsWith("_locales/") && name.endsWith(".json")) {
                const source = asset.source();
                const minified = JSON.stringify(JSON.parse(source));
                compilation.assets[name] = {
                  source: () => minified,
                  size: () => minified.length,
                };
              }
            }
          });
        },
      });
    }
    config.devtool = (isDevelopment || isCanaryRelease) ? "source-map" : false;
    config.output = {
      ...config.output,
      publicPath: "chrome-extension://effdbpeggelllpfkjppbokhmmiinhlmg/",
    };
    return config;
  }
};
