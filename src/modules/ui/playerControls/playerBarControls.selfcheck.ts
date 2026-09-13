import { strict as assert } from "node:assert";
import {
  getRatingState,
  isAdPlaying,
  type RatingState,
  seekTo,
  sendTransport,
  toggleDislike,
  toggleLike,
  type TransportAction,
} from "./playerBarControls";

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

console.log("playerBarControls selfcheck passed");
