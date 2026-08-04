const { existsSync, readdirSync, readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");

// The renderer's stylesheets ship inside @braccato/core, but they emit at the paths
// css/blyrics/index.css already imports, so the manifest and the two injection sites never learn
// that the sources moved.
//
// Copied rather than imported, because both injection sites fetch them by extension URL at runtime
// and css/blyrics/index.css imports them by name. A bundler import would inline them into a chunk,
// where nothing that consumes them can reach them.
// Resolved through the package's own `./styles/*.css` subpath rather than by appending `dist/styles`
// to its root, so this reads the contract the package publishes instead of the layout behind it.
const RENDERER_STYLES_DIR = dirname(require.resolve("@braccato/core/styles/lyrics.css"));
const RENDERER_STYLES_OUTPUT_DIR = "css/blyrics";
const EXTENSION_STYLES_DIR = join(__dirname, "public", "css", "blyrics");

// Asserted flat because the emit is flat and css/blyrics/index.css imports by bare name. A subpath
// pattern matches across a slash, so the package may legally nest a stylesheet; this reads one level,
// so nesting one would drop it from the build. Failing loudly beats shipping lyrics with no styles.
const rendererStylesheets = () => {
  const entries = readdirSync(RENDERER_STYLES_DIR, { withFileTypes: true });

  const nested = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  if (nested.length > 0) {
    throw new Error(
      `[BetterLyrics] @braccato/core/dist/styles/ ships flat at ${RENDERER_STYLES_OUTPUT_DIR}/, so nothing may nest under it: ${nested.join(", ")}`
    );
  }

  const stylesheets = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
    .map((entry) => ({ name: entry.name, path: join(RENDERER_STYLES_DIR, entry.name) }));

  // Both halves emit into one flat directory, so a shared basename is one asset overwriting the
  // other: the build report describes the file that lost and the artifact is the file that won.
  const shadowed = stylesheets
    .filter(({ name }) => existsSync(join(EXTENSION_STYLES_DIR, name)))
    .map(({ name }) => name);
  if (shadowed.length > 0) {
    throw new Error(
      `[BetterLyrics] ${shadowed.join(", ")} exists in both @braccato/core/dist/styles/ and public/${RENDERER_STYLES_OUTPUT_DIR}/, and both emit to ${RENDERER_STYLES_OUTPUT_DIR}/; rename one`
    );
  }

  return stylesheets;
};

// Emitted from the emit hook rather than from a processAssets stage so the CSS minimizer leaves
// them byte for byte as authored, which is how the copies under public/ arrive too.
const emitRendererStyles = {
  apply: (compiler) => {
    compiler.hooks.thisCompilation.tap("EmitRendererStyles", (compilation) => {
      // A stylesheet added or removed is a change to the directory, not to any file watch already
      // holds, so without this a new one never reaches a running watch.
      compilation.contextDependencies.add(RENDERER_STYLES_DIR);
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
