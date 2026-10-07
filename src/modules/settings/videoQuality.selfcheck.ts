import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import {
  DEFAULT_VIDEO_QUALITY_SETTINGS,
  normalizeVideoQualitySettings,
  selectVideoQuality,
  VIDEO_QUALITY_BOOST_EVENT,
  VIDEO_QUALITY_SETTINGS_EVENT,
} from "@modules/settings/videoQuality";
import type { VideoQualityPlayer } from "@modules/settings/videoQualityPlayer";
import { videoQualityControlState } from "@/options/videoQualityState";

import { VIDEO_QUALITY_REQUEST_EVENT } from "@modules/settings/videoQuality";

const warnings: unknown[][] = [];
const originalWarn = console.warn;
console.warn = (...args) => warnings.push(args);
const { patchVideoQualityPlayer, startVideoQualityPlayer } = await import("@modules/settings/videoQualityPlayer");
const { startVideoQualitySettingsBridge } = await import("@modules/settings/videoQualityBridge");
console.warn = originalWarn;
const warningCount = (context: string) =>
  warnings.filter(args => args.some(arg => String(arg).includes(context))).length;

const defaults = { ...DEFAULT_VIDEO_QUALITY_SETTINGS };
assert.deepEqual(normalizeVideoQualitySettings({}), defaults);
assert.equal(normalizeVideoQualitySettings({ preferredVideoQuality: "toString" }).preferredVideoQuality, "auto");
assert.equal(
  normalizeVideoQualitySettings({ isHighResolutionVideoEnabled: false }).isHighResolutionVideoEnabled,
  false
);
assert.equal(selectVideoQuality(defaults, ["hd2160", "hd1080"]), "auto");
assert.equal(
  selectVideoQuality({ ...defaults, preferredVideoQuality: "hd2160" }, ["hd1440", "hd1080", "auto"]),
  "hd1440"
);
assert.equal(
  selectVideoQuality({ isHighResolutionVideoEnabled: false, preferredVideoQuality: "hd4320" }, ["hd2160", "hd1080"]),
  "hd1080"
);
assert.equal(selectVideoQuality({ ...defaults, preferredVideoQuality: "tiny" }, ["hd720", "large"]), "large");
assert.equal(
  selectVideoQuality({ isHighResolutionVideoEnabled: false, preferredVideoQuality: "hd2160" }, ["hd2160"]),
  "auto",
  "never explicitly select a disabled quality"
);
assert.equal(selectVideoQuality(defaults, ["hd2160", "hd1080", "auto"], true), "hd1080", "boost stops at 1080p");
assert.equal(
  selectVideoQuality(defaults, ["hd720", "large", "auto"], true),
  "hd720",
  "boost takes the top level under 1080p"
);
assert.equal(
  selectVideoQuality(
    { isHighResolutionVideoEnabled: false, preferredVideoQuality: "auto" },
    ["hd2160", "hd1080"],
    true
  ),
  "hd1080",
  "boost stays inside the high resolution setting"
);
assert.equal(
  selectVideoQuality({ ...defaults, preferredVideoQuality: "hd720" }, ["hd2160", "hd720", "large"], true),
  "hd720",
  "an explicit choice wins over the boost"
);
assert.equal(selectVideoQuality(defaults, ["auto"], true), "auto", "boost with no levels stays on auto");

let enabled = true;
let received: unknown[] = [];
let receiver: unknown;
const result = Promise.resolve("native return");
const original = function (this: unknown, ...args: unknown[]) {
  receiver = this;
  received = args;
  return result;
};
const api = { loadVideoByPlayerVars: original, preloadVideoByPlayerVars: original, queueNextVideo: original };
const cleanup = patchVideoQualityPlayer(api, () => ({ ...defaults, isHighResolutionVideoEnabled: enabled }));
const vars = { video_id: "video", prefer_gapless: true, aac_high: true, player_params: "opaque", pause_at_start: true };
assert.equal(api.loadVideoByPlayerVars(vars, 1, "remaining args"), result);
assert.equal(receiver, api);
assert.deepEqual(received, [{ ...vars, prefer_gapless: false }, 1, "remaining args"]);
assert.equal(vars.prefer_gapless, true, "must not mutate cached Music arguments");
for (const audio_only of [true, 1, "1", "True"]) {
  const audio = { ...vars, audio_only };
  api.preloadVideoByPlayerVars(audio);
  assert.equal(received[0], audio, "album audio retains gapless and the original object");
}
enabled = false;
api.queueNextVideo(vars);
assert.equal(received[0], vars, "disabling restores native arguments without reloading the bridge");
const otherWrapper = () => {};
api.preloadVideoByPlayerVars = otherWrapper as typeof original;
cleanup();
assert.equal(api.loadVideoByPlayerVars, original);
assert.equal(api.preloadVideoByPlayerVars, otherWrapper, "cleanup must not overwrite another owner");
const frozenApi = Object.freeze({ loadVideoByPlayerVars: original });
assert.doesNotThrow(() => patchVideoQualityPlayer(frozenApi, () => defaults)());

{
  const all = ["auto", "hd2160", "hd1080"];
  const off = videoQualityControlState(false, "hd2160", all);
  assert.equal(off.value, "hd1080", "a >1080 choice falls back to 1080p when high resolution is off");
  assert.deepEqual(off.allowed, ["auto", "hd1080"], "4K is not selectable when high resolution is off");
  assert.equal(off.showLimitHint, true, "limit hint shows when high resolution is off");
  const on = videoQualityControlState(true, "hd2160", all);
  assert.equal(on.value, "hd2160", "value is kept when high resolution is on");
  assert.deepEqual(on.allowed, all, "every quality is selectable when high resolution is on");
  assert.equal(on.showLimitHint, false, "limit hint hides when high resolution is on");
  assert.equal(videoQualityControlState(false, "auto", all).value, "auto", "auto survives high resolution off");
  assert.deepEqual(videoQualityControlState(false, "hd1080", []).allowed, [], "empty list stays empty");
}

const dom = new JSDOM(`<ytmusic-player><video></video></ytmusic-player><video id="unrelated-video"></video>`);
const doc = dom.window.document;
const video = doc.querySelector("ytmusic-player video")!;
Object.assign(globalThis, { MutationObserver: dom.window.MutationObserver, Event: dom.window.Event });
let qualityCalls: string[] = [];
let qualities = ["hd2160", "hd1080", "auto"];
let nextApi: VideoQualityPlayer = {
  loadVideoByPlayerVars: original,
  cueVideoByPlayerVars: original,
  preloadVideoByPlayerVars: original,
  queueNextVideo: original,
  enqueueVideoByPlayerVars: original,
  getVideoData: () => ({ video_id: "video" }),
  getAvailableQualityLevels: () => qualities,
  setPlaybackQualityRange: quality => {
    qualityCalls.push(quality);
  },
};
const host = doc.querySelector("ytmusic-player")!;
Object.assign(host, { getPlayer: () => Promise.resolve(nextApi) });
const stop = startVideoQualityPlayer(doc, dom.window as unknown as Window);
const settle = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
};
const settings = (preferredVideoQuality: string) =>
  doc.dispatchEvent(
    new dom.window.CustomEvent(VIDEO_QUALITY_SETTINGS_EVENT, { detail: JSON.stringify({ preferredVideoQuality }) })
  );
settings("hd2160");
await settle();
assert.deepEqual(qualityCalls, ["hd2160"]);
doc.dispatchEvent(new dom.window.Event("yt-navigate-finish"));
await settle();
assert.equal(qualityCalls.length, 1, "do not force the same preference on every tick");
for (const name of ["preloadVideoByPlayerVars", "queueNextVideo", "enqueueVideoByPlayerVars"]) {
  (nextApi[name] as typeof original)(vars);
  doc.dispatchEvent(new dom.window.Event("yt-navigate-finish"));
  await settle();
  assert.equal(qualityCalls.length, 1, "preloading must not reset the current playback preference");
}
for (const name of ["loadVideoByPlayerVars", "cueVideoByPlayerVars"]) {
  const before: number = qualityCalls.length;
  (nextApi[name] as typeof original)(vars);
  doc.dispatchEvent(new dom.window.Event("yt-navigate-finish"));
  await settle();
  assert.equal(qualityCalls.length, before + 1, "replaying the same ID reapplies quality without new formats");
  assert.equal(qualityCalls.at(-1), "hd2160");
}
const beforeMetadata = qualityCalls.length;
video.dispatchEvent(new dom.window.Event("loadedmetadata"));
assert.equal(qualityCalls.length, beforeMetadata + 1, "native repeat metadata reapplies the quality preference");
doc.getElementById("unrelated-video")!.dispatchEvent(new dom.window.Event("loadedmetadata"));
assert.equal(qualityCalls.length, beforeMetadata + 1, "unrelated media must not reset player quality");
const beforeFallback = qualityCalls.length;
qualities = ["hd1080", "auto"];
video.dispatchEvent(new dom.window.Event("loadedmetadata"));
assert.equal(qualityCalls.at(-1), "hd1080");
qualities = ["auto"];
video.dispatchEvent(new dom.window.Event("loadedmetadata"));
assert.equal(qualityCalls.length, beforeFallback + 1, "audio-only playback must not be pinned");
qualities = ["hd2160", "hd1080"];
doc.querySelector("ytmusic-player")?.classList.add("ad-showing");
settings("hd1080");
await settle();
assert.equal(qualityCalls.length, beforeFallback + 1, "ads keep native quality selection");
doc.querySelector("ytmusic-player")?.classList.remove("ad-showing");
const oldApi = nextApi;
nextApi = { ...nextApi, loadVideoByPlayerVars: original };
doc.dispatchEvent(new dom.window.Event("yt-navigate-finish"));
await settle();
assert.equal(oldApi.loadVideoByPlayerVars, original, "replacement restores old API");
assert.notEqual(nextApi.loadVideoByPlayerVars, original);
settings("auto");
await settle();
assert.equal(qualityCalls.at(-1), "auto");
qualities = ["hd1080", "auto"];
let refreshes = 0;
nextApi.getPlayerResponse = () => ({ streamingData: { adaptiveFormats: [{ height: 2160 }] } });
nextApi.updateVideoData = (vars, refresh) => {
  assert.deepEqual(vars, { prefer_gapless: false }, "initial refresh preserves all other current video data");
  assert.equal(refresh, true, "request format refiltering, not a metadata-only update");
  refreshes++;
  qualities = ["hd2160", "hd1080", "auto"];
};
settings("hd2160");
await settle();
video.dispatchEvent(new dom.window.Event("loadedmetadata"));
assert.equal(refreshes, 1);
assert.equal(qualityCalls.at(-1), "hd2160", "first playback unlocks high resolution without a second load");
qualities = ["hd1080", "auto"];
video.dispatchEvent(new dom.window.Event("loadedmetadata"));
assert.equal(refreshes, 1, "a failed/filtered initial refresh must not retry forever");
(nextApi.loadVideoByPlayerVars as typeof original)(vars);
video.dispatchEvent(new dom.window.Event("loadedmetadata"));
assert.equal(refreshes, 2, "replaying also resets the one-time format refresh guard");
nextApi.getPlayerResponse = undefined;
const boost = (detail: string) => doc.dispatchEvent(new dom.window.CustomEvent(VIDEO_QUALITY_BOOST_EVENT, { detail }));
qualities = ["hd2160", "hd1080", "large", "auto"];
settings("auto");
await settle();
assert.equal(qualityCalls.at(-1), "auto");
boost("true");
await settle();
assert.equal(qualityCalls.at(-1), "hd1080", "boost on pins 1080p");
boost("false");
await settle();
assert.equal(qualityCalls.at(-1), "auto", "boost off restores the setting at once");
settings("large");
await settle();
boost("true");
await settle();
assert.equal(qualityCalls.at(-1), "large", "boost leaves an explicit choice alone");
settings("auto");
await settle();
boost("false");
await settle();
const beforeAdBoost = qualityCalls.length;
doc.querySelector("ytmusic-player")?.classList.add("ad-showing");
boost("true");
await settle();
assert.equal(qualityCalls.length, beforeAdBoost, "boost waits out an ad");
doc.querySelector("ytmusic-player")?.classList.remove("ad-showing");
video.dispatchEvent(new dom.window.Event("loadedmetadata"));
assert.equal(qualityCalls.at(-1), "hd1080", "boost lands after the ad");
const beforeMalformed = qualityCalls.length;
for (const detail of ["{", "1", '"on"']) boost(detail);
await settle();
assert.equal(qualityCalls.length, beforeMalformed, "malformed boost changes nothing");
assert.equal(warningCount("Failed to read video quality boost"), 1, "malformed boost logs once");
boost("false");
await settle();
const playbackError = new Error("player unavailable");
Object.assign(host, { getPlayer: () => Promise.reject(playbackError) });
for (let i = 0; i < 2; i++) {
  doc.dispatchEvent(new dom.window.Event("yt-navigate-finish"));
  await settle();
}
assert.equal(warningCount("Failed to connect to Music player"), 1, "polling failures log once per context");
assert(
  warnings.some(args => args.includes(playbackError)),
  "connection warning retains the cause"
);
Object.assign(host, {
  getPlayer: () => {
    throw playbackError;
  },
});
doc.dispatchEvent(new dom.window.Event("yt-navigate-finish"));
assert.equal(warningCount("Failed to connect to Music player"), 1);
nextApi.getVideoData = () => {
  throw playbackError;
};
video.dispatchEvent(new dom.window.Event("loadedmetadata"));
video.dispatchEvent(new dom.window.Event("loadedmetadata"));
assert.equal(warningCount("Failed to apply playback quality"), 1);
for (let i = 0; i < 2; i++) {
  doc.dispatchEvent(new dom.window.CustomEvent(VIDEO_QUALITY_SETTINGS_EVENT, { detail: "{" }));
}
assert.equal(warningCount("Failed to read video quality settings"), 1);
stop();
assert.equal(nextApi.loadVideoByPlayerVars, original);
qualityCalls = [];
settings("hd2160");
await settle();
assert.deepEqual(qualityCalls, [], "disposed bridges ignore settings and async callbacks");

const reads: ((value: unknown) => void)[] = [];
const storageListeners = new Set<(changes: Record<string, unknown>, area: string) => void>();
Object.assign(globalThis, {
  document: doc,
  CustomEvent: dom.window.CustomEvent,
  chrome: {
    storage: {
      sync: { get: () => new Promise(resolve => reads.push(resolve)) },
      onChanged: {
        addListener: (fn: (changes: Record<string, unknown>, area: string) => void) => storageListeners.add(fn),
        removeListener: (fn: (changes: Record<string, unknown>, area: string) => void) => storageListeners.delete(fn),
      },
    },
  },
});
const published: unknown[] = [];
doc.addEventListener(VIDEO_QUALITY_SETTINGS_EVENT, event => {
  published.push(JSON.parse((event as CustomEvent<string>).detail));
});
const stopStorage = startVideoQualitySettingsBridge();
doc.dispatchEvent(new dom.window.Event(VIDEO_QUALITY_REQUEST_EVENT));
reads[1]({ preferredVideoQuality: "hd2160" });
await settle();
reads[0]({ preferredVideoQuality: "hd720" });
await settle();
assert.deepEqual(published, [{ ...defaults, preferredVideoQuality: "hd2160" }]);
for (const fn of storageListeners) fn({ otherSetting: {} }, "sync");
assert.equal(reads.length, 2);
for (const fn of storageListeners) fn({ preferredVideoQuality: {} }, "sync");
assert.equal(reads.length, 3);
stopStorage();
reads[2]({});
await settle();
assert.equal(published.length, 1);
assert.equal(storageListeners.size, 0);
Object.assign(chrome.storage.sync, { get: () => Promise.reject(new Error("storage unavailable")) });
const stopFailedStorage = startVideoQualitySettingsBridge();
await settle();
doc.dispatchEvent(new dom.window.Event(VIDEO_QUALITY_REQUEST_EVENT));
await settle();
assert.equal(warningCount("Failed to publish stored settings"), 1);
stopFailedStorage();
dom.window.close();
console.log("videoQuality selfcheck passed");
