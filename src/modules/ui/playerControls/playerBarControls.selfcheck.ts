import { strict as assert } from "node:assert";
import {
  canSwitchPlaybackMode,
  getControlLabel,
  getRatingState,
  getVolume,
  getSelectedPlaybackMode,
  isVideoModeShown,
  isAdPlaying,
  type RatingState,
  seekTo,
  sendTransport,
  setVolume,
  switchPlaybackMode,
  toggleDislike,
  toggleLike,
  toggleMute,
  type TransportAction,
} from "@modules/ui/playerControls/playerBarControls";

interface FakeEl {
  attrs: Record<string, string>;
  clicks: number;
  child?: FakeEl;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  querySelector(sel: string): FakeEl | null;
  click(): void;
}

function el(attrs: Record<string, string> = {}, child?: FakeEl): FakeEl {
  return {
    attrs,
    clicks: 0,
    child,
    getAttribute(name) {
      return name in this.attrs ? this.attrs[name] : null;
    },
    hasAttribute(name) {
      return name in this.attrs;
    },
    querySelector() {
      return this.child ?? null;
    },
    click() {
      this.clicks += 1;
    },
  };
}

function fakeDoc(map: Record<string, FakeEl | null>): Document {
  const events: { type: string; detail: unknown }[] = [];
  const doc = {
    events,
    querySelector(sel: string): FakeEl | null {
      return sel in map ? map[sel] : null;
    },
    dispatchEvent(event: { type: string; detail?: unknown }): boolean {
      events.push({ type: event.type, detail: (event as { detail?: unknown }).detail });
      return true;
    },
  };
  return doc as unknown as Document;
}

const t = fakeDoc({});
const action: TransportAction = "next";
sendTransport(t, action);
assert.deepEqual(
  (t as unknown as { events: { type: string; detail: unknown }[] }).events,
  [{ type: "blyrics-player-control", detail: "next" }],
  "sendTransport dispatches blyrics-player-control with the action"
);

const s = fakeDoc({});
seekTo(s, 42);
assert.deepEqual(
  (s as unknown as { events: { type: string; detail: unknown }[] }).events,
  [{ type: "blyrics-seek-to", detail: 42 }],
  "seekTo dispatches blyrics-seek-to with the seconds"
);

const liked = fakeDoc({
  "ytmusic-player-bar ytmusic-like-button-renderer#like-button-renderer": el({ "like-status": "LIKE" }),
});
const rating: RatingState | null = getRatingState(liked);
assert.equal(rating, "LIKE", "reads like-status when liked");
assert.equal(getRatingState(fakeDoc({})), null, "returns null when the renderer is absent");

const likeBtn = el({});
const withLike = fakeDoc({ "ytmusic-player-bar #button-shape-like button": likeBtn });
toggleLike(withLike);
assert.equal(likeBtn.clicks, 1, "toggleLike clicks the inner like button");

const dislikeBtn = el({});
const withDislike = fakeDoc({ "ytmusic-player-bar #button-shape-dislike button": dislikeBtn });
toggleDislike(withDislike);
assert.equal(dislikeBtn.clicks, 1, "toggleDislike clicks the inner dislike button");

assert.equal(isAdPlaying(fakeDoc({ "ytmusic-player-bar[is-advertisement]": el({}) })), true, "detects ad state");
assert.equal(isAdPlaying(fakeDoc({})), false, "no ad state when the attribute is absent");

const AV_TOGGLE = "#av-id > ytmusic-av-toggle";

function avToggle(attrs: Record<string, string>): { toggle: FakeEl; song: FakeEl; video: FakeEl; doc: Document } {
  const song = el({});
  const video = el({});
  const toggle = el(attrs);
  toggle.querySelector = (sel: string) => (sel === ".song-button" ? song : sel === ".video-button" ? video : null);
  return { toggle, song, video, doc: fakeDoc({ [AV_TOGGLE]: toggle }) };
}

const songSelected = avToggle({ "selected-item-has-video": "", "is-video-playback-mode-selected": "false" });
assert.equal(getSelectedPlaybackMode(songSelected.doc), "song", "reads song when video is not selected");
assert.equal(canSwitchPlaybackMode(songSelected.doc), true, "switchable when the track has a video");
assert.equal(switchPlaybackMode(songSelected.doc, "video"), true, "switching to video reports the click");
assert.equal(songSelected.video.clicks, 1, "switching to video clicks the video button");
assert.equal(songSelected.song.clicks, 0, "switching to video leaves the song button alone");
assert.equal(switchPlaybackMode(songSelected.doc, "song"), false, "switching to the selected mode is a no-op");
assert.equal(songSelected.song.clicks, 0, "the selected mode is never clicked again");

const videoSelected = avToggle({ "selected-item-has-video": "", "is-video-playback-mode-selected": "true" });
assert.equal(getSelectedPlaybackMode(videoSelected.doc), "video", "reads video when video is selected");
assert.equal(switchPlaybackMode(videoSelected.doc, "song"), true, "switching back to song reports the click");
assert.equal(videoSelected.song.clicks, 1, "switching to song clicks the song button");

const disabled = avToggle({ "selected-item-has-video": "", "toggle-disabled": "" });
assert.equal(canSwitchPlaybackMode(disabled.doc), false, "a disabled toggle cannot switch");
assert.equal(switchPlaybackMode(disabled.doc, "video"), false, "a disabled toggle is never clicked");
assert.equal(disabled.video.clicks, 0, "regression: a disabled toggle keeps its video button untouched");

const noVideo = avToggle({});
assert.equal(canSwitchPlaybackMode(noVideo.doc), false, "a track without a video cannot switch");
assert.equal(switchPlaybackMode(noVideo.doc, "video"), false, "a track without a video is never switched");

assert.equal(getSelectedPlaybackMode(fakeDoc({})), null, "no mode without the toggle");
assert.equal(canSwitchPlaybackMode(fakeDoc({})), false, "no switching without the toggle");
assert.equal(switchPlaybackMode(fakeDoc({}), "video"), false, "no switch without the toggle");

assert.equal(isVideoModeShown(fakeDoc({ "ytmusic-player-page": el({ "video-mode": "" }) })), true, "reads video-mode");
assert.equal(isVideoModeShown(fakeDoc({ "ytmusic-player-page": el({}) })), false, "song mode without video-mode");
assert.equal(isVideoModeShown(fakeDoc({})), false, "no player page is song mode");
assert.equal(
  isVideoModeShown(
    fakeDoc({ "ytmusic-player-page": el({}), [AV_TOGGLE]: el({ "is-video-playback-mode-selected": "true" }) })
  ),
  false,
  "regression: the toggle's selection never stands in for a video on screen"
);

const VOLUME_SLIDER = "ytmusic-player-bar #volume-slider";
const MUTE_BUTTON = "ytmusic-player-bar yt-icon-button.volume button";
const withSlider = (value: string): Document => fakeDoc({ [VOLUME_SLIDER]: el({ value }) });

assert.deepEqual(getVolume(withSlider("62")), { level: 62, muted: false }, "reads the slider value attribute");
assert.deepEqual(getVolume(withSlider("0")), { level: 0, muted: true }, "slider zero is muted");
assert.deepEqual(getVolume(withSlider("140")), { level: 100, muted: false }, "clamps an out-of-range value");
assert.equal(getVolume(withSlider("loud")), null, "a non-numeric value is unknown, not silent");
assert.equal(getVolume(withSlider("")), null, "an empty value is unknown, not muted");
assert.equal(getVolume(fakeDoc({})), null, "no slider is unknown");

const volumeEvents = fakeDoc({});
setVolume(volumeEvents, 37.6);
setVolume(volumeEvents, -5);
assert.deepEqual(
  (volumeEvents as unknown as { events: { type: string; detail: unknown }[] }).events,
  [
    { type: "blyrics-set-volume", detail: 38 },
    { type: "blyrics-set-volume", detail: 0 },
  ],
  "setVolume dispatches blyrics-set-volume with a clamped whole level"
);

const muteBtn = el({});
toggleMute(fakeDoc({ [MUTE_BUTTON]: muteBtn }));
assert.equal(muteBtn.clicks, 1, "toggleMute clicks the native mute button");
toggleMute(fakeDoc({}));

assert.equal(
  getControlLabel(fakeDoc({ [MUTE_BUTTON]: el({ "aria-label": "Stummschalten" }) }), "mute"),
  "Stummschalten",
  "reads the native, localized label"
);
assert.equal(
  getControlLabel(fakeDoc({ [VOLUME_SLIDER]: el({ "aria-label": "" }) }), "volume"),
  null,
  "an empty label is missing"
);
assert.equal(getControlLabel(fakeDoc({}), "like"), null, "no native control means no label");

console.log("playerBarControls selfcheck passed");
