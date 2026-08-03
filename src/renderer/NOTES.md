# Renderer notes

Why this module is shaped the way it is, and what a contributor to this repository has to know that a
consumer of the package does not.

`README.md` beside this file is the package page: it is copied into the npm artifact by
`tooling/build-package.ts`, so it carries every fact a consumer needs to write code, and nothing that
only makes sense from inside this repository. This file carries the reasoning and the repo-internal
mechanics, and never restates a signature, a type or a default. When the two disagree, the README is
the one that has to be right.

`demo/api.js` is the third document, and the only one held to the code mechanically:
`tooling/check-demo-api.ts` looks every name in it up in what `npm run package` just emitted, so a
renamed property fails the build rather than leaving a wrong page on the screen.

## What this directory is

A package boundary. `src/renderer/` is published as `@braccato/core`, and it is written as though it
already lived on its own. It is MIT licensed, in the `LICENSE` beside this file; the rest of the
repository is GPL-3.0.

One instance per rendered surface. The YouTube Music side panel runs one, the floating
Picture-in-Picture window runs another, and the two share nothing but parsed lyric data and a
playback clock.

The rules that keep the boundary intact live in `boundary.selfcheck.ts`, which is the file that
enforces them. Read the header there before changing anything under this directory. If a change makes
that check fail, the change is wrong, not the check.

## The public API

`index.ts` and `element.ts` are the two entry points, and the four leaves are published beside them.
Importing the element registers custom element names, which is a side effect nothing that only wants
the renderer should pay for, so it is entered separately and the extension never imports it.
`boundary.selfcheck.ts` reports `no-side-effect-entry-point` if anything in the extension starts to.

The leaves exist for bundle size rather than tidiness: `@constants` is imported by page world code,
and routing it through `index` grew every bundle. A published leaf that grows an import stops being
safe to publish, so the check holds all four to importing nothing.

`LyricsRendererOptions` carries everything the module needs from its surroundings, but only the
document to build in and the window to schedule against are required. The scroll element is not an
option there at all: it is one of the host's answers, because YouTube Music swaps its scroll
container out under a view that already exists, so it has to be resolved per tick rather than handed
over once.

Every host member but `debug` has a default, so the host is an extension point a consumer overrides
one member at a time rather than a cost of entry. It answers questions the module cannot (is this
view on screen, is a loader up) and performs actions it must not own (seek the player). `debug` is
the one with nothing to default to: a consumer that wants the diagnostic overlay supplies the sink,
and one that says nothing draws nothing.

`host.seek(timeS)` deliberately takes a number rather than a document. How a seek reaches the player
is the host's business: this extension dispatches `blyrics-seek-to` at the page world, and the custom
element sets `currentTime` on the media element it is bound to. The renderer's own default host
dispatches a bubbling `braccato:seek` at the mount, for a consumer that gave the renderer no other
way to reach its player.

`types.ts` is the full list of `LyricsRenderer` members and documents the ones that need it.

## The DOM is a contract

`constants.ts` holds the class names and element ids this module emits. Every theme in the theme
marketplace selects on them, and the `--blyrics-*` custom properties it reads are how themes
configure it. Renaming one is a breaking change for every published theme, with a migration cost
rather than a refactor. Treat that file as published API.

`LyricSyncType` is not called `SyncType` because `@constants` already uses that name for provider
sync quality (`"syllable" | "word" | "line" | "unsynced"`), which is a different axis from the loaded
lyrics' timing.

## Stylesheets

The DOM and the CSS that styles it are one artifact, so the CSS lives inside the boundary too, under
`styles/`. These stay with the extension, because they style the host rather than the lyrics:
`components.css`, `misc.css`, `modal.css`, `responsive.css`, `picture-in-picture.css`.

`index.css` stays with them, and it is the one worth naming, because it is not a stylesheet: it is
the `@import` list both injection sites load, and it names the module's three sheets alongside the
extension's own. It is where the two halves are stitched together, so a sheet added or renamed on
either side is a change to that file.

The build emits `styles/*.css` at `css/blyrics/<name>`, the paths `css/blyrics/index.css` already
imports, so nothing outside the module knows the sources moved: the two injection sites and the
manifest's web accessible resources are untouched. `emitRendererStyles` in `extension.config.cjs`
does it, from the emit hook rather than a processAssets stage, so the CSS minimizer leaves the sheets
exactly as authored, the way the copies under `public/` arrive.

`--noto-sans-universal` is declared extension side, in `misc.css`, because the extension is what
loads those 32 families and two published themes select on the stack by name. `--blyrics-font-family`
names a fallback so that a standalone consumer gets one real family and the rest of the stack behind
it, rather than a `font-family` that is invalid at computed value time and silently inherits the host
page's font. Inside the extension the fallback is unreachable.

The misfiling this section used to record is fixed: the album art backdrop `responsive.css` paints
below 615px is anchored on `ytmusic-app-layout` now, wrapped in `:where()` so it weighs what the bare
`.blyrics-container:before` a theme overrides weighs. The floating window no longer needs its
`display: none` counter-rule and no longer carries one.

## Theme settings

A theme configures this module through comments inside the stylesheet, in the form
`blyrics-some-key = value;`. Only inside comments, because everything else is CSS the browser is
going to read, and a stylesheet must not be able to configure the module by accident.

The stylesheet goes in as a `<style>` element carrying `CUSTOM_THEME_STYLE_ID` rather than into
`document.adoptedStyleSheets`, for two reasons. Adopted sheets are ordered after every sheet the
document loaded, which is not the cascade position a consumer writing the element itself would get.
And an element is findable: this extension's floating window is handed the side panel's theme by
reading it off that id.

`setTheme` returns whether a setting the lines are built out of changed, which is the one part it
cannot do itself. The consumer holds the lyrics, so the consumer is the one that can hand them back.

The CSS is compiled CSS, not theme source. Better Lyrics themes are written in RICS and compiled with
the `rics` package first, which is the consumer's dependency rather than this module's: the module
ships with none.

`themeSettings.ts` owns the registry. `registerThemeSetting` runs at module scope, which evaluates
once per bundle however many instances exist, so the values are global rather than per instance.

## Realms

The constraint the README states as "one renderer per document" has a second half that only matters
in here. A realm is a bundle rather than a document, and two things are per realm: the settings
registry, and the playback clock that `retickFromPlaybackClock` replays and `resetPlaybackClock`
forgets. Two renderers in one realm therefore replay each other's clock, whatever documents they are
in.

This module is bundled into both the isolated and the page world bundles, which are separate realms
with separate registries and separate clocks. Each needs its own `setTheme` call, or one view renders
against defaults while the other renders against the theme.

The scroll padding is written on the document's root element rather than on the container because
`--blyrics-padding-top` and `--blyrics-padding-bottom` are published names a theme may read anywhere,
and the extension's own `mobile.css` already reads one from outside this module. Narrowing where they
resolve would break such a theme silently.

## Ticking

The module owns no clock. In this extension the tick is the interpolated player snapshot from
`blyrics-send-player-time`; in the floating window it is a second interpolation of the same snapshot.
Neither is a media element, which is why the custom element can own an animation frame loop over one
while the renderer underneath it still owns none.

Three doors move the lyrics without the song moving, and they differ in what they measure.
`retickFromPlaybackClock` renders again against the last snapshot the module saw, measuring nothing,
which is what an offset nudge needs. `relayout` measures and renders nothing, leaving the lines it
just re-read to the next tick. `scheduleLyricPositionUpdate` does both, on the next frame, and is the
busiest of the three: it is the one a streamed translation or romanization comes through, once each.
`resetPlaybackClock` forgets the snapshot, so the next tick reads as the first of a new song rather
than as a jump away from the end of the last one.

## The custom element

Properties may be written before the element is in a document, including before this module has
loaded at all. Those land on the instance and would shadow the accessors forever if
`connectedCallback` did not run them through again.

`currentTime` is in seconds rather than the milliseconds braccato's 0.1.x component took. The module
ticks in seconds, and an element that converted would leave itself and the renderer underneath it
disagreeing about what a number means.

`eventCreationTime` reaches past the element. The playback clock a tick is compared against is module
scope, shared by every view in the realm, and it defaults on the element to the sentinel that means
the time was not sampled from a live player. An element sharing a realm with a view that does pass
real timestamps has to pass them too, or the difference between the two reads as a jump on every tick
and neither view keeps a scroll.

`dir` is deliberately not a property. `HTMLElement` already reflects it, and the lines this module
builds carry `dir="auto"` and resolve their own direction from their own text, so the element's `dir`
is the base direction everything under it inherits.

An element that was never given a theme applies an empty one when it builds rather than applying
nothing, because the settings registry is module scope and an element that applied nothing would
inherit whatever the last theme in that bundle left in it. The cost is that connecting a themeless
element empties an existing `CUSTOM_THEME_STYLE_ID` element in that document.

A `source` that named nothing to follow is deliberately not a `status` value. The element is still
rendering, so a status that said otherwise would trade one true answer for another. What a consumer
who was not listening reads instead is `mediaElement`, which is null while `source` still holds the
selector it could not resolve.

A throw from inside the module while the element is being built is the one thing `braccato:error`
does not cover. It comes out of `connectedCallback`, where the page reports it as an uncaught error
with the stack it happened on. The element counts itself among its document's views only once the
renderer exists, so a build that threw leaves nothing behind claiming to be one.

### The media element loop

Every frame reads the clock afresh, because `currentTime` is only as fresh as the media element chose
to make it, once per presented frame for video. A view rendering the raw reading steps where the song
runs, and a carry that assumed 1x would drift on anything else.

The carry cap is 100ms of frame time rather than of song time, and that choice is the interesting
one. Frame time is where the cap belongs because the gap it fills is spaced there: the media element
refreshes its clock about once per presented frame whatever the rate is, so a cap measured in song
time would shrink below one frame at a high rate and stop doing its job on exactly the songs that
need it most.

Five events share one handler, because they all mean the same thing: the clock moved or changed speed
while no frame of its own was looking. `play` and `pause` are the loop's start and stop. `seeking`
moves the view as a scrub happens, since the position is already the requested one when it fires, and
`seeked` corrects it to where the media element actually landed, which is not always the same number.
`ratechange` retakes the reading with the rate it will be carried at.

The rest are deliberately not listened to, and the frame loop covers most of them by asking the media
element whether its clock is still going rather than trusting that something said so.

- `ended` is covered by `pause`, which a non-looping media element fires first, and by that same check
- `emptied` says the resource went away rather than that the clock moved, and it leaves the media
  element paused at zero, which the check reports on the next frame. The gap is `emptied` while
  already paused, described in the README
- `error` is the one that would otherwise spin. A fatal decode or network failure mid-song sets
  `error` and fires it and never touches `paused`, and never runs the pause steps, so a loop whose
  only stop condition was `paused` would tick against a frozen clock for the life of the element. The
  frame reads `media.error` alongside `media.paused` for exactly that
- `waiting` and `stalled` are what the carry cap is for. Both say the clock has stopped advancing
  without stopping
- `loadedmetadata` carries `duration` and the intrinsic dimensions, none of which this element reads
- `timeupdate` is a coarser copy of the frame loop while playing, and a 4Hz version of the seek events
  while paused

### Light DOM

The break from the 0.1.x component. Three reasons, all of them the same reason: the theme marketplace
selects on `.blyrics-*` at document level and a shadow root would put every published theme out of
reach; `@property` registrations do not apply to a stylesheet inside a shadow root, which is what that
component says in its own source; and the extension and a third party should be running identical
code rather than one encapsulated build and one not.
