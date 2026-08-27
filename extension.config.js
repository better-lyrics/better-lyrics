import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = dirname(fileURLToPath(import.meta.url));

// The renderer's stylesheets ship inside @braccato/core, but they emit at the paths
// css/blyrics/index.css already imports, so the manifest and the two injection sites never learn
// that the sources moved.
//
// Copied rather than imported, because both injection sites fetch them by extension URL at runtime
// and css/blyrics/index.css imports them by name. A bundler import would inline them into a chunk,
// where nothing that consumes them can reach them.
// Resolved through the package's own `./styles/*.css` subpath rather than by appending `dist/styles`
// to its root, so this reads the contract the package publishes instead of the layout behind it.
const rendererStylesDir = dirname(require.resolve("@braccato/core/styles/lyrics.css"));
const rendererStylesOutputDir = "css/blyrics";
const extensionStylesDir = join(projectRoot, "public", "css", "blyrics");

// Asserted flat because the emit is flat and css/blyrics/index.css imports by bare name. A subpath
// pattern matches across a slash, so the package may legally nest a stylesheet; this reads one level,
// so nesting one would drop it from the build. Failing loudly beats shipping lyrics with no styles.
const rendererStylesheets = () => {
  const entries = readdirSync(rendererStylesDir, { withFileTypes: true });

  const nested = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
  if (nested.length > 0) {
    throw new Error(
      `[BetterLyrics] @braccato/core/dist/styles/ ships flat at ${rendererStylesOutputDir}/, so nothing may nest under it: ${nested.join(", ")}`
    );
  }

  const stylesheets = entries
    .filter(entry => entry.isFile() && entry.name.endsWith(".css"))
    .map(entry => ({ name: entry.name, path: join(rendererStylesDir, entry.name) }));

  // Both halves emit into one flat directory, so a shared basename is one asset overwriting the
  // other: the build report describes the file that lost and the artifact is the file that won.
  const shadowed = stylesheets.filter(({ name }) => existsSync(join(extensionStylesDir, name))).map(({ name }) => name);
  if (shadowed.length > 0) {
    throw new Error(
      `[BetterLyrics] ${shadowed.join(", ")} exists in both @braccato/core/dist/styles/ and public/${rendererStylesOutputDir}/, and both emit to ${rendererStylesOutputDir}/; rename one`
    );
  }

  return stylesheets;
};

// Emitted from the emit hook rather than from a processAssets stage so the CSS minimizer leaves
// them byte for byte as authored, which is how the copies under public/ arrive too.
const emitRendererStyles = {
  apply: compiler => {
    compiler.hooks.thisCompilation.tap("EmitRendererStyles", compilation => {
      // A stylesheet added or removed is a change to the directory, not to any file watch already
      // holds, so without this a new one never reaches a running watch.
      compilation.contextDependencies.add(rendererStylesDir);
      for (const { path } of rendererStylesheets()) {
        compilation.fileDependencies.add(path);
      }
    });

    compiler.hooks.emit.tap("EmitRendererStyles", compilation => {
      for (const { name, path } of rendererStylesheets()) {
        const contents = readFileSync(path);
        compilation.emitAsset(`${rendererStylesOutputDir}/${name}`, {
          source: () => contents,
          size: () => contents.length,
        });
      }
    });
  },
};

const linuxChromeSandbox = "/opt/google/chrome/chrome-sandbox";
if (process.platform === "linux" && existsSync(linuxChromeSandbox)) {
  process.env.CHROME_DEVEL_SANDBOX ??= linuxChromeSandbox;
}

const chromiumDevelopmentProfile = "dist/extension-js/profiles/chrome-profile/dev";

const chromiumBrowser = {
  preferences: { theme: "dark" },
  persistProfile: true,
  excludeBrowserFlags: ["--hide-scrollbars", "--mute-audio", "--disable-component-extensions-with-background-pages"],
  startingUrl: "https://music.youtube.com/",
};

/** @type {import("extension").FileConfig} */
const config = {
  browser: {
    chrome: chromiumBrowser,
    // `--chromium-binary` selects this target, including the Brave development script.
    chromium: chromiumBrowser,
    firefox: {
      preferences: { theme: "dark" },
      persistProfile: true,
      excludeBrowserFlags: ["--hide-scrollbars", "--disable-component-extensions-with-background-pages"],
      startingUrl: "https://music.youtube.com/",
    },
  },
  commands: {
    dev: {
      browser: "chrome",
      polyfill: true,
    },
    start: {
      // Google rejects new sign-ins while `dev` has Chrome's remote-debugging transport enabled.
      // `start` has no CDP transport, so use it once to authenticate this same persistent profile.
      browser: "chrome",
      profile: chromiumDevelopmentProfile,
      polyfill: true,
    },
    build: {
      polyfill: true,
    },
  },
  config: rspackConfig => {
    const isCanaryRelease = process.env.RELEASE_TYPE === "canary";
    const isDevelopment = rspackConfig.mode !== "production";

    rspackConfig.plugins.push(emitRendererStyles);

    if (!isDevelopment) {
      console.log(
        "\x1b[31m[BetterLyrics]\x1b[0m Building for",
        isCanaryRelease ? "canary release" : "standard release"
      );

      // Minify locale JSON files for production builds.
      rspackConfig.plugins.push({
        apply: compiler => {
          compiler.hooks.emit.tap("MinifyLocales", compilation => {
            for (const [name, asset] of Object.entries(compilation.assets)) {
              if (name.startsWith("_locales/") && name.endsWith(".json")) {
                const minified = JSON.stringify(JSON.parse(asset.source()));
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

    rspackConfig.devtool = isDevelopment || isCanaryRelease ? "source-map" : false;
    return rspackConfig;
  },
};

export default config;
