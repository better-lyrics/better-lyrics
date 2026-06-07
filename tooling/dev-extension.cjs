const { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } = require("fs");
const { join, resolve } = require("path");
const { spawn, spawnSync } = require("child_process");
const os = require("os");
const { launchBrowser } = require("extension/browsers");

const projectRoot = process.cwd();
const startingUrl = "https://music.youtube.com/watch?v=D_3nlLlPMxA&list=RDAMVMEmq17wn71jA";
const extensionBin = join(projectRoot, "node_modules", "extension", "bin", "extension.cjs");
const distPath = join(projectRoot, "dist", "chromium");
const extensionJsDevtoolsPath = join(
  projectRoot,
  "node_modules",
  "extension-develop",
  "dist",
  "extension-js-devtools",
  "chromium",
);
const extensionJsThemePath = join(
  projectRoot,
  "node_modules",
  "extension-develop",
  "dist",
  "extension-js-theme",
  "chromium",
);
const devBeforeUnloadGuardPath = join(projectRoot, "dist", "extension-js", "dev-beforeunload-guard");
const readyPath = join(projectRoot, "dist", "extension-js", "chromium", "ready.json");
const profilePath =
  process.env.EXTENSION_DEV_PROFILE ||
  join(projectRoot, "dist", "extension-js", "profiles", "chromium-profile", "better-lyrics-dev");
const extraExtensionArgs = process.argv.slice(2);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function findFiles(dir, fileName, depth = 8) {
  if (depth < 0 || !existsSync(dir)) return [];

  const results = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);

    if (entry.isFile() && entry.name === fileName) {
      results.push(fullPath);
    } else if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, fileName, depth - 1));
    }
  }

  return results;
}

function findManagedChromium() {
  if (process.env.EXTENSION_CHROMIUM_BINARY && existsSync(process.env.EXTENSION_CHROMIUM_BINARY)) {
    return process.env.EXTENSION_CHROMIUM_BINARY;
  }

  const localAppData = process.env.LOCALAPPDATA || join(os.homedir(), "AppData", "Local");
  const cacheRoot = join(localAppData, "extension.js", "browsers", "chromium");
  const executableName = process.platform === "win32" ? "chrome.exe" : process.platform === "darwin" ? "Chromium" : "chrome";
  const candidates = findFiles(cacheRoot, executableName)
    .filter((filePath) => /chrome-win|Chromium\.app|chrome-linux/.test(filePath))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  return candidates[0];
}

function ensureChromium() {
  const chromiumBinary = findManagedChromium();
  if (chromiumBinary) return chromiumBinary;

  console.log("[BetterLyrics] Installing Extension.js managed Chromium...");
  run(process.execPath, [extensionBin, "install", "chromium"]);

  const installedBinary = findManagedChromium();
  if (!installedBinary) {
    throw new Error("Could not find Extension.js managed Chromium after installation.");
  }

  return installedBinary;
}

function ensureDevBeforeUnloadGuard() {
  mkdirSync(devBeforeUnloadGuardPath, { recursive: true });

  writeFileSync(
    join(devBeforeUnloadGuardPath, "manifest.json"),
    `${JSON.stringify(
      {
        manifest_version: 3,
        name: "Extension.js built-in developer tools: beforeunload guard",
        version: "1.0.0",
        description: "Disables YouTube Music beforeunload prompts during Better Lyrics development.",
        content_scripts: [
          {
            matches: ["https://music.youtube.com/*"],
            js: ["disable-beforeunload.js"],
            run_at: "document_start",
            world: "MAIN",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    join(devBeforeUnloadGuardPath, "disable-beforeunload.js"),
    `(() => {
  if (globalThis.__betterLyricsDevBeforeUnloadDisabled) return;

  Object.defineProperty(globalThis, "__betterLyricsDevBeforeUnloadDisabled", {
    value: true,
    configurable: false,
    enumerable: false,
  });

  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  const nativePreventDefault = Event.prototype.preventDefault;
  const returnValueDescriptor = Object.getOwnPropertyDescriptor(Event.prototype, "returnValue");

  nativeAddEventListener.call(
    window,
    "beforeunload",
    (event) => {
      event.stopImmediatePropagation();
    },
    true,
  );

  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (String(type).toLowerCase() === "beforeunload") return;
    return nativeAddEventListener.call(this, type, listener, options);
  };

  Event.prototype.preventDefault = function () {
    if (this.type === "beforeunload") return;
    return nativePreventDefault.call(this);
  };

  if (returnValueDescriptor?.configurable) {
    Object.defineProperty(Event.prototype, "returnValue", {
      configurable: true,
      enumerable: returnValueDescriptor.enumerable,
      get() {
        return returnValueDescriptor.get?.call(this);
      },
      set(value) {
        if (this.type === "beforeunload") return;
        returnValueDescriptor.set?.call(this, value);
      },
    });
  }

  try {
    Object.defineProperty(window, "onbeforeunload", {
      configurable: true,
      enumerable: true,
      get: () => null,
      set: () => {},
    });
  } catch {
    window.onbeforeunload = null;
  }
})();
`,
  );
}

function waitForReady(devProcess) {
  const startedAt = Date.now();
  const timeoutMs = 60_000;

  return new Promise((resolveReady, rejectReady) => {
    const timer = setInterval(() => {
      if (devProcess.exitCode != null) {
        clearInterval(timer);
        rejectReady(new Error(`Extension.js dev exited with code ${devProcess.exitCode}.`));
        return;
      }

      if (existsSync(readyPath)) {
        try {
          const ready = JSON.parse(readFileSync(readyPath, "utf8"));
          if (ready.status === "ready" && ready.browser === "chromium") {
            clearInterval(timer);
            resolveReady(ready);
            return;
          }
        } catch {}
      }

      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        rejectReady(new Error("Timed out waiting for Extension.js dev to become ready."));
      }
    }, 250);
  });
}

async function launchChromium(chromiumBinary) {
  mkdirSync(profilePath, { recursive: true });

  const extensionsToLoad = [extensionJsDevtoolsPath, extensionJsThemePath, devBeforeUnloadGuardPath, distPath];
  for (const extensionPath of extensionsToLoad) {
    if (!existsSync(join(extensionPath, "manifest.json"))) {
      throw new Error(`Could not find unpacked extension: ${extensionPath}`);
    }
  }

  console.log(`[BetterLyrics] Opening Chromium: ${chromiumBinary}`);
  console.log("[BetterLyrics] Loading Extension.js devtools, theme, dev beforeunload guard, and Better Lyrics.");

  return launchBrowser({
    browser: "chromium",
    mode: "development",
    outputPath: distPath,
    contextDir: projectRoot,
    extensionsToLoad,
    profile: profilePath,
    persistProfile: true,
    startingUrl,
    chromiumBinary,
    browserFlags: ["--remote-debugging-port=9222"],
    excludeBrowserFlags: [
      "--hide-scrollbars",
      "--mute-audio",
      "--disable-component-extensions-with-background-pages",
    ],
  });
}

function getContentScriptEntries() {
  try {
    const manifest = JSON.parse(readFileSync(join(distPath, "manifest.json"), "utf8"));
    return (manifest.content_scripts || []).map((_entry, index) => `content_scripts/content-${index}`);
  } catch {
    return [];
  }
}

function snapshotWatchedFiles() {
  const snapshot = new Map();
  const roots = ["manifest.json", "extension.config.cjs", "src", "public", "pages", "_locales"];

  const visit = (filePath) => {
    if (!existsSync(filePath)) return;
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(filePath)) visit(join(filePath, entry));
      return;
    }
    snapshot.set(filePath, `${stat.mtimeMs}:${stat.size}`);
  };

  for (const root of roots) visit(join(projectRoot, root));
  return snapshot;
}

function getChangedSources(previousSnapshot) {
  const nextSnapshot = snapshotWatchedFiles();
  const changedSources = [];
  const allPaths = new Set([...previousSnapshot.keys(), ...nextSnapshot.keys()]);

  for (const filePath of allPaths) {
    if (previousSnapshot.get(filePath) === nextSnapshot.get(filePath)) continue;
    changedSources.push(filePath.slice(projectRoot.length + 1).replace(/\\/g, "/"));
  }

  return { changedSources, nextSnapshot };
}

async function reloadAfterCompile(browserController, changedAssets) {
  const requiresFullReload = changedAssets.some(
    (asset) => asset === "manifest.json" || asset === "extension.config.cjs" || asset.startsWith("_locales/"),
  );
  const hasBackgroundChange = changedAssets.some(
    (asset) => /(^|\/)background(\.|\/)/i.test(asset) || /service[-_.]?worker/i.test(asset),
  );

  if (requiresFullReload || hasBackgroundChange) {
    const type = requiresFullReload ? "full" : "service-worker";
    await browserController.reload({ type, changedAssets });
    console.log(`[BetterLyrics] Reloaded the extension after a ${type} change.`);
    return;
  }

  const entries = getContentScriptEntries();
  if (!entries.length) throw new Error("Could not find compiled content-script entries.");

  await browserController.reload({
    type: "content-scripts",
    changedContentScriptEntries: entries,
    changedAssets,
  });
  console.log("[BetterLyrics] Hot-reinjected content scripts without refreshing YouTube Music.");
}

function watchForRecompiles(devProcess, browserController, initialCompiledAt) {
  let lastCompiledAt = initialCompiledAt;
  let sourceSnapshot = snapshotWatchedFiles();
  let reloadQueue = Promise.resolve();

  const timer = setInterval(() => {
    if (devProcess.exitCode != null) {
      clearInterval(timer);
      return;
    }

    try {
      const ready = JSON.parse(readFileSync(readyPath, "utf8"));
      if (ready.status !== "ready" || !ready.compiledAt || ready.compiledAt === lastCompiledAt) return;

      lastCompiledAt = ready.compiledAt;
      const { changedSources, nextSnapshot } = getChangedSources(sourceSnapshot);
      sourceSnapshot = nextSnapshot;
      reloadQueue = reloadQueue
        .then(() => reloadAfterCompile(browserController, changedSources))
        .catch((error) => console.warn(`[BetterLyrics] Hot reinjection failed: ${error.message}`));
    } catch {}
  }, 300);

  return timer;
}

async function main() {
  run(process.execPath, [join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs"), "tooling/generate-locales.ts"]);
  run(process.execPath, [join(projectRoot, "tooling", "patch-extension-dev-server.cjs")]);
  ensureDevBeforeUnloadGuard();
  rmSync(readyPath, { force: true });

  const chromiumBinary = ensureChromium();
  const devProcess = spawn(process.execPath, [extensionBin, "dev", "--no-browser", "--allow-control", ...extraExtensionArgs], {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: false,
  });

  let browserController;
  let recompileWatcher;

  const stop = () => {
    if (recompileWatcher) clearInterval(recompileWatcher);
    if (devProcess.exitCode == null) devProcess.kill();
  };

  process.on("SIGINT", () => {
    stop();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    stop();
    process.exit(143);
  });

  try {
    const ready = await waitForReady(devProcess);
    browserController = await launchChromium(chromiumBinary);
    recompileWatcher = watchForRecompiles(devProcess, browserController, ready.compiledAt);
  } catch (error) {
    console.error(`[BetterLyrics] ${error.message}`);
    stop();
    process.exit(1);
  }
}

main();
