const startingUrl = "https://music.youtube.com/watch?v=D_3nlLlPMxA&list=RDAMVMEmq17wn71jA";

module.exports = {
  commands: {
    dev: {
      browser: "chromium",
      polyfill: true,
      startingUrl,
    },
    start: {
      browser: "chromium",
      polyfill: true,
      startingUrl,
    },
    preview: {
      browser: "chromium",
      polyfill: true,
      startingUrl,
    },
    build: {
      browser: "chrome,edge,firefox",
      polyfill: true,
    },
  },
  browser: {
    chrome: {
      preferences: { theme: "dark" },
      excludeBrowserFlags: [
        "--hide-scrollbars",
        "--mute-audio",
        "--disable-component-extensions-with-background-pages",
      ],
      browserFlags: ["--remote-debugging-port", "9222"],
      profile: "dist/chrome-profile",
    },
    firefox: {
      preferences: { theme: "dark" },
      excludeBrowserFlags: [
        "--hide-scrollbars",
        "--disable-component-extensions-with-background-pages",
      ],
      profile: "dist/firefox-profile",
    },
  },
  config: (config) => {
    const isCanaryRelease = process.env.RELEASE_TYPE === "canary";
    const shouldBuildSourcemaps = process.env.BUILD_SOURCEMAPS === "true";
    const isDevelopment = config.mode !== "production";

    if (!isDevelopment) {
      console.log(
        "\x1b[31m[BetterLyrics]\x1b[0m Building for",
        isCanaryRelease ? "canary release" : "standard release",
      );

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
    config.devtool = isDevelopment || shouldBuildSourcemaps || isCanaryRelease ? "source-map" : false;

    return config;
  },
};
