import { strict as assert } from "node:assert";
import {
  canFlipStartModeSwitch,
  counterpartPair,
  FLIP_TRAILS_TRACK_CHANGE_MS,
  IDLE_MODE_SWITCH,
  isCounterpartChange,
  isModeSwitchSettled,
  type ModeSwitchProgress,
  type ModeSwitchSurface,
  recordFlip,
  recordTrackChange,
} from "./modeSwitch";

// -- Counterpart pairs --------------------------

const song = "songId";
const video = "videoId";
const pair = counterpartPair(song, video);

assert.deepEqual(pair, [song, video]);
assert.equal(counterpartPair(song, null), null, "no counterpart in the queue");
assert.equal(counterpartPair(song, undefined), null, "metadata without the field");
assert.equal(counterpartPair(song, ""), null, "empty id");
assert.equal(counterpartPair(song, song), null, "a track is not its own counterpart");

// -- Classifying a videoId change ----------------

assert.equal(isCounterpartChange(pair, song, video), true, "song to video is a mode switch");
assert.equal(isCounterpartChange(pair, video, song), true, "video to song is a mode switch");
assert.equal(isCounterpartChange(pair, song, "nextTrack"), false, "next track is a track change");
assert.equal(isCounterpartChange(pair, video, "nextTrack"), false, "next track from the video too");
assert.equal(isCounterpartChange(null, song, video), false, "unknown pair counts as a track change");
assert.equal(isCounterpartChange(pair, null, video), false, "first song in a window");
assert.equal(isCounterpartChange(pair, song, song), false, "no change at all");
assert.equal(isCounterpartChange(pair, "otherTrack", video), false, "pair belongs to another track");

// -- A flip ahead of the id change ---------------

const settledOnSong = { pair, currentVideoId: song, msSinceTrackChange: Number.POSITIVE_INFINITY };
assert.equal(canFlipStartModeSwitch(settledOnSong), true, "flip on a track with a counterpart");
assert.equal(canFlipStartModeSwitch({ ...settledOnSong, currentVideoId: video }), true, "from the video side too");
assert.equal(canFlipStartModeSwitch({ ...settledOnSong, pair: null }), false, "no counterpart, so a track change");
assert.equal(canFlipStartModeSwitch({ ...settledOnSong, currentVideoId: null }), false, "nothing playing yet");
assert.equal(
  canFlipStartModeSwitch({ ...settledOnSong, currentVideoId: "nextTrack" }),
  false,
  "pair belongs to the previous track"
);
assert.equal(
  canFlipStartModeSwitch({ ...settledOnSong, msSinceTrackChange: FLIP_TRAILS_TRACK_CHANGE_MS - 1 }),
  false,
  "a flip just after a track change belongs to that change"
);
assert.equal(
  canFlipStartModeSwitch({ ...settledOnSong, msSinceTrackChange: FLIP_TRAILS_TRACK_CHANGE_MS }),
  true,
  "past the trailing window"
);

// -- Either signal can arrive first --------------

const flipThenId = recordTrackChange(recordFlip(null, true));
const idThenFlip = recordFlip(recordTrackChange(null), true);
assert.deepEqual(flipThenId, idThenFlip, "the order of the two signals does not matter");
assert.deepEqual(flipThenId, { sawFlip: true, sawTrackChange: true, expectsVideo: true });
assert.deepEqual(recordFlip(null, false), { ...IDLE_MODE_SWITCH, sawFlip: true });
assert.deepEqual(recordTrackChange(null), { ...IDLE_MODE_SWITCH, sawTrackChange: true });
assert.equal(recordFlip(recordFlip(null, true), false).expectsVideo, false, "the latest flip wins");

// -- Settling -----------------------------------

const showingVideo: ModeSwitchSurface = { showsVideo: true, isArtworkPending: false, isVideoPending: false };
const showingCover: ModeSwitchSurface = { ...showingVideo, showsVideo: false };
const toVideo: ModeSwitchProgress = flipThenId;
const toSong: ModeSwitchProgress = recordTrackChange(recordFlip(null, false));

assert.equal(isModeSwitchSettled(toVideo, showingVideo), true, "video face is up");
assert.equal(isModeSwitchSettled(toSong, showingCover), true, "cover is up");
assert.equal(isModeSwitchSettled(toVideo, showingCover), false, "still waiting for the first video frame");
assert.equal(isModeSwitchSettled(toSong, showingVideo), false, "video face not retired yet");
assert.equal(isModeSwitchSettled(toVideo, { ...showingVideo, isVideoPending: true }), false, "swap in flight");
assert.equal(isModeSwitchSettled(toSong, { ...showingCover, isArtworkPending: true }), false, "cover not committed");
assert.equal(
  isModeSwitchSettled(recordFlip(null, false), showingCover),
  false,
  "flip alone: the id change may still follow"
);
assert.equal(
  isModeSwitchSettled(recordTrackChange(null), showingCover),
  false,
  "id change alone: the flip may still follow"
);
assert.equal(isModeSwitchSettled(IDLE_MODE_SWITCH, showingCover), false);

// -- Invariants ---------------------------------

const frozen = Object.freeze(recordFlip(null, true));
assert.doesNotThrow(() => recordTrackChange(frozen), "records never mutate their input");
assert.equal(frozen.sawTrackChange, false);

console.log("mode switch self-check passed");
