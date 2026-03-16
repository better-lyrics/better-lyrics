const profile = name => `./dist/extension-profile-${name}`;

/** @type {import('extension').FileConfig} */
export default {
  polyfill: true,
  browser: {
    chrome: {
      profile: profile("chrome"),
      excludeBrowserFlags: [
        '--hide-scrollbars', // Allow scrollbars to be visible
        '--mute-audio', // Allow audio to play
      ]
    },
    chromium: {
      profile: profile("chromium"),
      excludeBrowserFlags: [
        '--hide-scrollbars', // Allow scrollbars to be visible
        '--mute-audio', // Allow audio to play
      ]
    },
    edge: { profile: profile("edge") },
    firefox: { profile: profile("firefox") },
    "chromium-based": {
      profile: profile("chromium-based"),
      excludeBrowserFlags: [
        '--hide-scrollbars', // Allow scrollbars to be visible
        '--mute-audio', // Allow audio to play
      ]
    },
    "gecko-based": { profile: profile("gecko-based") },
  },
  config: config => {
    const isCanaryRelease = process.env.RELEASE_TYPE === "canary";
    const isDevelopment = config.mode !== "production";

    if (!isDevelopment) {
      console.log(
        "\x1b[31m[BetterLyrics]\x1b[0m Building for",
        isCanaryRelease ? "canary release" : "standard release"
      );

      // Minify locale JSON files for prod builds
      config.plugins.push({
        apply: compiler => {
          compiler.hooks.emit.tap("MinifyLocales", compilation => {
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
    config.devtool = "source-map";
    return config;
  },
};
