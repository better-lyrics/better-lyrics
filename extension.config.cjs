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
