import { strict as assert } from "node:assert";
import {
  type KaraokeConditions,
  shouldShowKaraoke,
  shouldShowWindowStage,
  type WindowStageConditions,
  wantsKaraokeLyrics,
} from "@modules/karaoke/gate";

const all: KaraokeConditions = {
  enabled: true,
  fullscreen: true,
  fullscreenDisabled: false,
  videoMode: true,
  synced: true,
  adPlaying: false,
};

assert.equal(shouldShowKaraoke(all), true);
for (const key of ["enabled", "fullscreen", "videoMode", "synced"] as const) {
  assert.equal(shouldShowKaraoke({ ...all, [key]: false }), false, `${key} off hides karaoke`);
}
assert.equal(shouldShowKaraoke({ ...all, adPlaying: true }), false, "an ad hides karaoke");
assert.equal(shouldShowKaraoke({ ...all, fullscreenDisabled: true }), false, "disabled fullscreen hides karaoke");
assert.equal(
  wantsKaraokeLyrics({ ...all, fullscreenDisabled: true }),
  false,
  "disabled fullscreen wants no karaoke lyrics"
);

assert.equal(wantsKaraokeLyrics({ ...all, synced: false }), true, "lyrics load before the sync type is known");
assert.equal(wantsKaraokeLyrics({ ...all, adPlaying: true }), true, "an ad does not stop the fetch");
for (const key of ["enabled", "fullscreen", "videoMode"] as const) {
  assert.equal(wantsKaraokeLyrics({ ...all, [key]: false }), false, `${key} off wants no karaoke lyrics`);
}

const windowAll: WindowStageConditions = { enabled: true, videoState: "on", synced: true };
assert.equal(shouldShowWindowStage(windowAll), true);
assert.equal(shouldShowWindowStage({ ...windowAll, enabled: false }), false, "karaoke off");
assert.equal(shouldShowWindowStage({ ...windowAll, synced: false }), false, "unsynced lyrics");
assert.equal(shouldShowWindowStage({ ...windowAll, videoState: "off" }), false, "song mode or setting off");
assert.equal(shouldShowWindowStage({ ...windowAll, videoState: "ad" }), false, "ad shows the intermission");

console.log("karaoke gate self-check passed");
