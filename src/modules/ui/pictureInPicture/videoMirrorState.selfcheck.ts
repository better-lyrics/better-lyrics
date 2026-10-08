import { strict as assert } from "node:assert";
import {
  pickVideoTrack,
  type VideoMirrorInputs,
  videoMirrorState,
  wantsQualityBoost,
} from "@modules/ui/pictureInPicture/videoMirrorState";

const playing: VideoMirrorInputs = { enabled: true, videoMode: true, adPlaying: false, hasVideoTrack: true };

assert.equal(videoMirrorState(playing), "on");
assert.equal(videoMirrorState({ ...playing, enabled: false }), "off", "setting off");
assert.equal(videoMirrorState({ ...playing, videoMode: false }), "off", "song mode");
assert.equal(videoMirrorState({ ...playing, hasVideoTrack: false }), "off", "no video track yet");
assert.equal(videoMirrorState({ ...playing, adPlaying: true }), "ad", "ad wins over video");
assert.equal(videoMirrorState({ ...playing, adPlaying: true, videoMode: false }), "ad", "ad in song mode");
assert.equal(videoMirrorState({ ...playing, adPlaying: true, hasVideoTrack: false }), "ad", "ad before a track");
assert.equal(videoMirrorState({ ...playing, adPlaying: true, enabled: false }), "off", "setting off hides ads too");

assert.equal(wantsQualityBoost({ enabled: true, videoMode: true, state: "on" }), true, "video showing");
assert.equal(wantsQualityBoost({ enabled: true, videoMode: true, state: "off" }), true, "gap between songs");
assert.equal(wantsQualityBoost({ enabled: true, videoMode: false, state: "off" }), false, "song mode");
assert.equal(wantsQualityBoost({ enabled: false, videoMode: true, state: "off" }), false, "setting off");
assert.equal(wantsQualityBoost({ enabled: true, videoMode: true, state: "ad" }), true, "ad in video mode");
assert.equal(wantsQualityBoost({ enabled: true, videoMode: false, state: "ad" }), true, "ad in song mode");

const audio = { kind: "audio" };
const videoA = { kind: "video" };
const videoB = { kind: "video" };
assert.equal(pickVideoTrack([]), null);
assert.equal(pickVideoTrack([audio]), null, "audio only");
assert.equal(pickVideoTrack([videoA, audio, videoB, audio]), videoB, "newest video track");

console.log("video mirror state self-check passed");
