# Lyrics renderer

Builds and animates a synchronized lyrics view. One instance per rendered surface: the YouTube Music
side panel runs one, the floating Picture-in-Picture window runs another, and the two share nothing
but parsed lyric data and a playback clock.

This directory is a package boundary. It is meant to be lifted out into `../braccato` later, so it is
written as though it already had been.

It is licensed MIT, in the `LICENSE` beside this file. The rest of the repository is GPL-3.0, and
`@braccato/core` is published from here.

## Rules

Nothing here may import from `@core/*`, `@modules/*`, `@constants`, `@utils`, `@options` or `@/`,
reach outside this directory with a relative path, reference `chrome.`, or import a package. Nothing
under `styles/` may name a YouTube Music selector, or read a custom property the module neither owns
nor declares. `boundary.selfcheck.ts` enforces all of that and runs as part of `npm run selfcheck`.
If a change makes it fail, the change is wrong, not the check.

The one exemption: `*.selfcheck.ts` files may import `node:*` builtins and `typescript`. They are
repo infrastructure, never bundled, and `typescript` is a devDependency here and in braccato.

The `chrome.` rule is not stylistic. On Firefox this module runs in the PAGE world, because Gecko
hands content scripts a cross-origin wrapper on the Picture-in-Picture window. A single `chrome.`
reference drags the webext polyfill into that bundle and kills it silently. See
`.claude/rules/pitfalls.md`.

## Public API

`index.ts` and `element.ts` are the two entry points. The index publishes the renderer, the element
wraps it in a tag, and the leaves publish the standalone pieces. Importing the element registers
custom element names, which is a side effect nothing that only wants the renderer should pay for, so
it is entered separately and the extension never imports it. See The custom element below.

`constants.ts`, `text.ts`, `themeSettings.ts` and `util.ts` are the leaves: they import nothing, so a
consumer that needs one class name, one script test or one pure helper does not pull the engine into
its bundle with it. Importing `./engine`, `./inject`, `./view` or anything else from outside this
directory is a violation in the other direction and is checked too, as is a published leaf growing an
import.

`createLyricsRenderer(options)` is the way in. It returns one `LyricsRenderer`: give it lyrics, tick
it, and it owns the DOM it builds and every re-measurement that DOM needs. `renderer.setTheme(css)`
is where a theme reaches it, described under Theme settings below. The four values published beside
it are what one instance cannot answer for on its own. `resetPlaybackClock` and
`resumeAllAutoscroll` describe the song rather than one view, so no caller gets to name a particular
one, but they reach the views differently: `resumeAllAutoscroll` walks the registry of live
instances, while `resetPlaybackClock` forgets a snapshot the module keeps once for all of them, which
each view then reads on its next tick. `injectRomanization` and `injectTranslation` decorate lines
that are already built, for text that arrives after the song does.

Only the `LyricsRenderer` members with something to say beyond their signature are described below.
The interface in `types.ts` is the full list, and documents the rest where they need it.

`LyricsRendererOptions` still carries everything the module needs from its surroundings, but only the
document to build in and the window to schedule against are required. The mount may be given here or
to `setLyrics` later, for a consumer whose mount does not exist until there is something to put in
it, and the scroll element is not an option here at all: it is one of the host's answers, because
YouTube Music swaps its scroll container out under a view that already exists.

Every member of the `LyricsRendererHost` but `debug` has a default, so a consumer with nothing to say
about its surroundings says nothing at all:

- `isViewVisible` answers that the view is on screen, `isLoaderActive` that nothing is covering it,
  and `syncAdState` that no ad is playing
- `getScrollElement` starts at the mount itself and walks up to the nearest element that scrolls, so
  a consumer that mounts straight into its own scroll container means that container rather than
  whatever else scrolls above it, and falls back to the document's own scrolling element. Memoised,
  and re-walked whenever the layout moves, because it is resolved per tick
- `setResumeAffordanceVisible` and `log` do nothing
- `seek` dispatches a bubbling `braccato:seek` at the mount, carrying the time in seconds as its
  detail, so a consumer that gave the renderer no way to reach its player can listen for that instead
- `debug` is the one with nothing to default to: it is optional on the host and handed through as it
  was given, so a consumer that wants the diagnostic overlay supplies the sink and one that says
  nothing draws nothing

The host is still the extension point, and the defaults are what a consumer overrides one at a time
rather than a substitute for writing one. It answers questions the module cannot (is this view on
screen, is a loader up) and performs actions it must not own (seek the player).

`host.seek(timeS)` deliberately takes a number, not a document. How a seek reaches the player is the
host's business: this extension dispatches `blyrics-seek-to` at the page world, and the custom
element sets `currentTime` on the media element it is bound to.

## The DOM is a contract

`constants.ts` holds the class names and element ids this module emits. Every theme in the theme
marketplace selects on them, and the `--blyrics-*` custom properties it reads are how themes
configure it. Renaming one is a breaking change for every published theme, with a migration cost, not
a refactor. Treat that file as published API.

`LyricSyncType` is not called `SyncType` because `@constants` already uses that name for provider
sync quality (`"syllable" | "word" | "line" | "unsynced"`), which is a different axis from the loaded
lyrics' timing.

## Stylesheets

The DOM and the CSS that styles it are one artifact, so the CSS lives inside the boundary too, under
`styles/`: `lyrics.css`, `instrumental.css` and `variables.css`. These stay with the extension,
because they style the host rather than the lyrics: `components.css`, `misc.css`, `modal.css`,
`responsive.css`, `picture-in-picture.css`.

`index.css` stays with them, and it is the one worth naming, because it is not a stylesheet: it is
the `@import` list both injection sites load, and it names the module's three sheets alongside the
extension's own. It is where the two halves are stitched together, so a sheet added or renamed on
either side is a change to that file.

The build emits `styles/*.css` at `css/blyrics/<name>`, the paths `css/blyrics/index.css` already
imports, so nothing outside the module knows the sources moved: the two injection sites and the
manifest's web accessible resources are untouched. `emitRendererStyles` in `extension.config.cjs`
does it, from the emit hook rather than a processAssets stage, so the CSS minimizer leaves them
exactly as authored, the way the copies under `public/` arrive.

`boundary.selfcheck.ts` holds the stylesheets to the same rule as the code, and reports a violation
with its file, its line and the name it reached for. Two rules:

- **No host selectors.** `HOST_SELECTORS` is the list, drawn from `public/css/ytmusic/`, which is
  where the extension styles the page around the lyrics: YouTube Music's own element names, ids and
  attributes, plus the attributes the extension sets on them. Identifier escapes are undone and the
  text is lower cased first, because `#tab\-renderer`, `#\74 ab-renderer` and `#TAB-RENDERER` all
  select what `#tab-renderer` selects
- **No undeclared custom properties.** A `var()` under `styles/` has to name a `--blyrics-*`
  property, or one declared under `styles/`, or carry a fallback. The first is the module's own
  namespace, the second is a declaration the module ships, and the third is a dependency written
  down rather than assumed

The second rule exists because a host selector is visible in a rule's text and a dependency on an
outside declaration is not, which is how `--blyrics-font-family` went on reading the extension's
`--noto-sans-universal` for a while with nothing in the rule to say so.

What neither rule catches, so nobody reads them as more than they are: a rule that reaches the host
without naming it (`body > *`, an inherited property, or a host name the extension never styled and
so never put on the list), an `@import` pulling in a stylesheet the scan never opens, and a selector
built as a string in TypeScript rather than written in CSS.

`--noto-sans-universal` is still declared extension side, in `misc.css`, because the extension is
what loads those 32 families and two published themes select on the stack by name. What changed is
that `--blyrics-font-family` names a fallback now, so a standalone consumer gets one real family and
the rest of the stack behind it rather than a `font-family` that is invalid at computed value time
and silently inherits the host page's font. Inside the extension the fallback is unreachable.

The misfiling this section used to record is fixed: the album art backdrop `responsive.css` paints
below 615px is anchored on `ytmusic-app-layout` now, wrapped in `:where()` so it weighs what the bare
`.blyrics-container:before` a theme overrides weighs. The floating window no longer needs its
`display: none` counter-rule and no longer carries one.

## Theme settings

A theme is a stylesheet, and it configures this module through comments inside it, in the form
`blyrics-some-key = value;`. Only inside comments: everything else is CSS the browser is going to
read, and a stylesheet must not be able to configure the module by accident.

`renderer.setTheme(css)` is the whole of getting one in. It parses that configuration out of the
comments, applies it to the registry, puts the stylesheet in the head of the document the renderer
builds in, and drops what the engine had resolved off the old one. It returns whether a setting the
lines are built out of changed, which is the one part it cannot do itself: the consumer holds the
lyrics, so the consumer is the one that can hand them back.

The stylesheet goes in as a `<style>` element carrying `CUSTOM_THEME_STYLE_ID` rather than into
`document.adoptedStyleSheets`, because adopted sheets are ordered after every sheet the document
loaded, which is not the cascade position a consumer writing the element itself would get, and
because an element is findable: this extension's floating window is handed the side panel's theme by
reading it off that id.

One renderer per document owns that element, which is the constraint the next section states once
for everything it covers.

The CSS is compiled CSS, not theme source. Better Lyrics themes are written in RICS and compiled
with the `rics` package first, which is the consumer's dependency rather than this module's: the
module ships with none. `parseThemeConfig` is published on the `themeSettings.ts` leaf for a
consumer that wants the configuration out of a stylesheet somewhere no renderer is running.

`themeSettings.ts` owns the registry. `registerThemeSetting` runs at module scope, which evaluates
once per bundle regardless of how many instances exist, so the values are global rather than per
instance: one theme means one set of values for every view.

### One renderer per document

Two renderers in one document write over each other, so the module supports one. It is a constraint
rather than a configuration to support, and it is stated rather than enforced: the behaviour is
defined at every point where two of them would collide, and none of those points is a crash.

Two things are written per document, and each belongs to whichever renderer wrote it last:

- **The theme's `<style>` element.** A renderer that finds `CUSTOM_THEME_STYLE_ID` already in its
  document writes into the element it finds rather than adding a rival under the same id, and
  `destroy` removes the element only if that renderer is the one that created it
- **The scroll padding.** `--blyrics-padding-top` and `--blyrics-padding-bottom` reserve the room the
  first and last lines need to reach the view's target scroll position, so they are sized against the
  viewport the view is in, and they are written on the document's root element. A second view with a
  taller viewport rewrites them, and the first view is then padded for a viewport it is not in. They
  are written on the root rather than on the container because they are published names a theme may
  read anywhere, and the extension's own `mobile.css` already reads one from outside this module:
  narrowing where they resolve would break such a theme silently

Two more are per realm, which is wider still, because a realm is a bundle rather than a document: the
settings registry above, so one theme means one set of values for every view, and the playback clock
that `retickFromPlaybackClock` replays and `resetPlaybackClock` forgets, which is written by whichever
view ticked last. Two renderers in one realm therefore replay each other's clock, whatever documents
they are in.

The module is bundled into both the isolated and the page-world bundles, which are separate realms
with separate registries and separate clocks. Each needs its own `setTheme` call, or one view renders
against defaults while the other renders against the theme.

## Ticking

The module does not own a clock. `renderer.tick(currentTimeS, options)` is called by whoever has one.
In this extension that is the interpolated player snapshot from `blyrics-send-player-time`; in the
floating window it is a second interpolation of the same snapshot. Neither is a media element, which
is why this stays true: the custom element owns an animation frame loop over a media element's clock,
described under Following a media element below, and the renderer underneath it still owns none.

`options.isPlaying` is the one thing a tick cannot be given a sensible default for. The rest of
`TickOptions` describes a setting the consumer may not have, so all of it may be left out.

Three doors move the lyrics without the song moving, and they differ in what they measure.
`renderer.retickFromPlaybackClock` renders again against the last snapshot the module saw, which is
the realm's rather than that renderer's, described under One renderer per document above, and
measures nothing, which is what an offset nudge needs. `relayout` measures and renders nothing,
leaving the lines it just re-read to the next tick. `scheduleLyricPositionUpdate` does both, on the
next frame, and is the busiest of the three: `types.ts` calls it out as the one a streamed
translation or romanization comes through, once each. `resetPlaybackClock` forgets that snapshot, so
the next tick reads as the first of a new song rather than as a jump away from the end of the last
one.

## The custom element

`element.ts` is the second entry point, and the way in for a page that would rather write a tag than
a facade. Importing it registers `<braccato-lyrics>`, and `<better-lyrics>` beside it, because a
constructor may only be registered once and the extension's own name is worth keeping. Registration
is a side effect, so nothing in the extension imports this file and `boundary.selfcheck.ts` reports
it as `no-side-effect-entry-point` if anything starts to.

Registration is also silent about a name that is already taken, which is worth knowing rather than
discovering. Two copies of this package on one page means the first to load takes both names and the
second's `customElements.define` never runs, so every element on the page is an instance of the first
copy's class and `instanceof` against the second copy's is false. There is nobody to report that to
at module scope, which is why it is written down here instead: load one copy.

The other thing worth knowing before importing it: **this entry point requires the main world.** A
browser extension's isolated world has no custom element registry at all, so `window.customElements`
is null there, and importing this file throws where it registers rather than degrading. An extension
that wants the tag has to run this module in the page's own world; one that stays in its isolated
world calls `createLyricsRenderer` directly, which is what this extension does and why nothing in it
imports this file.

```html
<!-- The module's own stylesheets, in this order, however the build serves a package's CSS. -->
<link rel="stylesheet" href="@braccato/core/styles/variables.css" />
<link rel="stylesheet" href="@braccato/core/styles/lyrics.css" />
<link rel="stylesheet" href="@braccato/core/styles/instrumental.css" />

<audio id="player" src="song.mp3" controls></audio>
<braccato-lyrics source="#player"></braccato-lyrics>
<script type="module">
  import "@braccato/core/element";

  const view = document.querySelector("braccato-lyrics");
  // A Lyric[], which is the consumer's to produce: nothing here parses a lyrics format, so a real
  // page builds this out of its own LRC, TTML or API response. See Properties below.
  view.lyrics = [
    { startTimeMs: 0, durationMs: 4200, words: "The first line" },
    { startTimeMs: 4200, durationMs: 3800, words: "The second" },
    { startTimeMs: 8000, durationMs: 4000, words: "And the third" },
  ];
  // A compiled stylesheet, which may be nothing but the module's own settings. See Theme settings.
  view.theme = "/* blyrics-line-synced-animation-delay = 0.2; */";
  view.addEventListener("braccato:error", event => {
    console.warn(event.detail.phase, event.detail.error);
  });
</script>
```

That quickstart runs. `npm run demo` emits the package, synthesizes a track for it to follow, and
serves `demo/` against the emitted artifact, with a control for most of what this section describes.
The page's own API reference is held to the emitted types by `tooling/check-demo-api.ts`, so renaming
something here fails the build that emitted it rather than leaving a wrong page up.

`source` is the whole of following a player: the element reads the clock, drives itself while the
audio plays, and sends a click on a lyric line back to `audio.currentTime`. A consumer whose clock is
not a media element leaves it out and writes `currentTime` and `playing` instead, which is what this
extension does.

The stylesheets are the consumer's to load, the way any package's CSS is, and leaving them out gives
lines that are in the document and unstyled rather than lines that are missing. Stylesheets above
says what each of the three carries.

### Properties

`lyrics`, `lyricsOptions`, `currentTime`, `playing`, `tickOptions`, `theme`, `host` and `source` are
writable, `renderer` and `mediaElement` are not. All of them may be written before the element is in
a document: the renderer is built when it connects, and everything it was handed by then is applied
at once. That includes properties a page wrote before this module even loaded, which land on the
instance and would shadow the accessors forever if `connectedCallback` did not run them through
again.

`currentTime` is in **seconds**, not the milliseconds braccato's component took. The module ticks in
seconds, and an element that converted would leave itself and the renderer underneath it disagreeing
about what a number means. Writing it renders the view again, so whoever owns the clock drives the
lyrics by writing it. Writing `playing` renders again too, since a paused view animates differently
from a playing one. Both become outputs the moment a `source` is bound, described below.

`tickOptions` is the rest of a tick: everything in `TickOptions` except `isPlaying`, which `playing`
already answers. The user offsets (`globalLyricOffset`, `lyricOffset`, `richsyncOffsetTrim`,
`lineOffsetTrim`) are subtracted from the clock before it is matched against the lines,
`passiveScrollEnabled` is what lets unsynced lyrics drift with the song rather than sitting still,
and `eventCreationTime` is the wall clock timestamp of the player snapshot the time came from.

Writing it stores and nothing more: it is read by the next tick rather than causing one, so a
consumer that writes options and the clock on the same frame renders once. Writing `lyricsOptions` is
the same bargain against the next build.

`eventCreationTime` is worth a sentence of its own, because it reaches past this element. The
playback clock a tick is compared against is module scope, shared by every view in the realm, and it
defaults here to the sentinel that means the time was not sampled from a live player. An element
sharing a realm with a view that does pass real timestamps has to pass them too, or the difference
between the two reads as a jump on every tick and neither view keeps a scroll.

`source` is the media element the lyrics follow, and `mediaElement` is what it resolved to. Following
a media element says what they do.

`lyrics` is null until it is given a song, which is not the same as being given none: an element that
was never handed lyrics leaves whatever it is mounted over alone, and an empty array clears the view,
so a consumer between songs has a way to say so.

`Lyric[]` is the shape `types.ts` publishes and the index re-exports: one
`{ startTimeMs, durationMs, words }` per line, with an optional `parts` array of the same three
fields for syllable or word timing, and optional `translation`, `romanization` and
`timedRomanization` beside them. Nothing in this module parses a lyrics format. Turning LRC, TTML or
an API's own JSON into that array is the consumer's job, the way this extension's providers do it,
and it is the piece the component this replaces hid behind a `src` property.

`lyricsOptions` is how the lines are built, beyond the lines themselves: `loaderVisible`, which
records on the container that something is still covering the view, and `noLyrics`, which says these
lyrics are a "not found" message rather than a song. The second one matters more than it reads.
Without it a one line placeholder is an unsynced song as far as the module can tell, so passive
scrolling drifts the message across the view for the length of the track. The mount is not among the
options the renderer takes here: the element is the mount.

`theme` is a compiled stylesheet, the same string `renderer.setTheme` takes, described under Theme
settings above. If the theme changes a setting the lines are built out of, the element rebuilds them,
because it is holding them. An empty theme puts every setting back to its default, and an element
that was never given one applies exactly that when it builds rather than applying nothing: the
settings registry is module scope, so an element that applied nothing would inherit whatever the last
theme in that bundle left in it. The cost is that connecting an element with no theme empties an
existing `CUSTOM_THEME_STYLE_ID` element in that document, because the element's `theme` is the
document's theme and an empty one is still one.

`host` is `Partial<LyricsRendererHost>`, and every member of it still has a default, so a consumer
with nothing to say about its surroundings says nothing. Writing it while connected rebuilds the
view: the renderer is handed its host once, when it is created. The element wraps two of its members
rather than replacing them, so a consumer who wrote `seek` or `setResumeAffordanceVisible` is still
called and the matching event still fires.

`renderer` is the `LyricsRenderer` underneath, for a consumer who outgrows the element: null while
disconnected, and a different one after every reconnection.

`status` is what the element is doing, asked rather than listened for, and it is the answer for a
consumer who was not holding a listener when something went wrong. It reads `idle` when the element
is not rendering and has nothing to report, `rendering` when it is, `no-browsing-context` when it is
in a document with no window to schedule against, and `theme-conflict` when it is rendering but
another element in the same document was given a different theme, described under More than one
element in a document below. The last two are dispatched as `braccato:error` as well.

A `source` that named nothing to follow is not one of its values, and that is deliberate: the element
is still rendering, so a status that said otherwise would trade one true answer for another. What a
consumer who was not listening reads instead is `mediaElement`, which is null while `source` still
holds the selector it could not resolve.

`dir` is deliberately not among them. `HTMLElement` already reflects it, and the lines this module
builds carry `dir="auto"` and resolve their own direction from their own text, so the element's `dir`
is the base direction everything under it inherits and nothing here has to reimplement that.

There is no `longWordThreshold`, `lineSyncedDelay` or `disableRichsync` either. Those are theme
settings (`blyrics-long-word-threshold`, `blyrics-line-synced-animation-delay`,
`blyrics-disable-richsync`), read from the stylesheet the consumer already hands over, and a theme
that set one while an attribute said otherwise would leave the module with two answers and no rule
for picking between them. Configure them in the theme.

### Following a media element

`source` takes either a CSS selector, resolved with `querySelector` in the element's own document, or
an `HTMLMediaElement` itself. The selector is the attribute form and both are the property form.
Setting it binds, setting it to null unbinds, and setting it to a second media element moves the
whole binding across.

While it is bound the element drives itself. It reads `currentTime` and `paused` off the media
element and ticks the renderer with them, so **`currentTime` and `playing` become outputs**: a write
to either is dropped and the getter keeps reporting what the binding last read. Dropped rather than
reported, because a consumer who bound a `source` and left their own frame loop running would
otherwise be told about it sixty times a second. Attributes are the same write by another road, so
`current-time` and `playing` are dropped too. Unbind and the clock goes back to whoever asked for it.

A click on a lyric line sets `currentTime` on the bound media element. The element wraps `host.seek`
rather than replacing it, so a consumer who wrote their own is still called and
`braccato:line-click` still fires; the seek reaches the media element between the two.

The loop is `requestAnimationFrame` on the element's own window, running only while the media element
is playing, so a paused or ended song costs nothing. Every frame reads the clock afresh. A reading
the media element has not refreshed yet is carried forward at the `playbackRate` it was taken at:
`currentTime` is only as fresh as the media element chose to make it, once per presented frame for
video, so a view rendering the raw reading steps where the song runs, and a carry that assumed 1x
would drift on anything else. The frame also asks whether the media element is still playing, so a
clock that stopped without an event still stops the loop.

The carry is capped at 100ms **of frame time, not of song time**, and both halves of that are worth
knowing. Frame time is where the cap belongs because the gap it fills is spaced there: the media
element refreshes its clock about once per presented frame whatever the rate is, so a cap measured
in song time would shrink below one frame at a high rate and the carry would stop doing its job on
exactly the songs that need it most. What that costs is the other half. A clock that stalls
overshoots by up to 100ms times the playback rate, and when it starts moving again the view steps
back by however far it overshot: 100ms at 1x, 400ms at 4x. Nothing is lost, but the step backwards
is real and it is visible, and it scales with the rate.

Five events are listened to on the media element, and they all mean one thing to the element, that
the clock moved or changed speed while no frame of its own was looking, so they share a handler that
re-reads it. `play` and `pause` are the loop's start and stop. `seeking` moves the view as a scrub
happens, since the position is already the requested one when it fires, and `seeked` corrects it to
where the media element actually landed, which is not always the same number. `ratechange` retakes
the reading with the rate it will be carried at.

The rest are deliberately not listened to, and the frame loop is what covers most of them: it asks
the media element whether its clock is still going rather than trusting that something said so.

- `ended` is covered by `pause`, which a non-looping media element fires first, and by that same
  check
- `emptied` says the resource went away rather than that the clock moved, and it leaves the media
  element paused at zero, which the check reports on the next frame. The gap is `emptied` **while
  already paused**: no loop is running to notice, no `pause` follows, so an element whose consumer
  swaps `audio.src` between songs without playing goes on reporting the old song's position until
  the next `play`. Write `currentTime` on the media element, or start playback, and it corrects
  itself
- `error` is the one that would otherwise spin. A fatal decode or network failure mid-song sets
  `error` and fires it and **never touches `paused`**, and never runs the pause steps, so a loop
  whose only stop condition was `paused` would tick against a frozen clock for the life of the
  element. The frame reads `media.error` alongside `media.paused` for exactly that, and a media
  element in that state reports `playing === false`
- `waiting` and `stalled` are what the carry cap is for. Both say the clock has stopped advancing
  without stopping, and a capped carry means the view runs at most 100ms of frame time past the last
  real reading and then waits with it
- `loadedmetadata` carries `duration` and the intrinsic dimensions, none of which this element reads
- `timeupdate` is a coarser copy of the frame loop while playing, and a 4Hz version of the seek
  events while paused

The binding lives exactly as long as the renderer does, so `mediaElement` is null while the element
is disconnected, the way `renderer` is, and a selector is resolved again every time it is written and
every time the element connects. Disconnecting, unbinding, rebinding and reconnecting each leave no
listener on a media element and no frame queued.

A selector that matches nothing, matches something that is not a media element, or is not a selector
at all leaves `mediaElement` null and dispatches `braccato:error` with `phase: "source"`. So does a
`source` written as an object that is not a media element, which is a thing a consumer writing plain
JavaScript can do and which would otherwise bind without complaint and feed `undefined` to every tick
for the length of the song. Nothing is
bound, so `currentTime` and `playing` still work: the element falls back to being told rather than
going quiet. Because the selector is resolved when the element connects, a media element that the
parser has not reached yet will not be found, which is why the quickstart puts the `<audio>` first; a
page that cannot promise that order writes the property from script instead.

### Attributes

`current-time`, `playing`, `source` and `theme` are read as attributes as well, in one direction only:
an attribute writes its property, and a property never writes back. Reflecting `current-time` would
put the playback clock into the DOM sixty times a second, and one attribute reflecting while the
others do not is worse than none of them doing it. `playing` is an ordinary boolean attribute, so its
presence is what counts and `playing="false"` is playing. A `current-time` that does not parse as a
number is ignored rather than read as zero, because a half written attribute must not send the lyrics
back to the top of the song. `source` is the selector form only, and changing it resolves again:
setting it to another selector moves the binding and removing it unbinds.

### Events

Every one of these bubbles and is composed, so an element a consumer put inside their own shadow root
still reaches their listener.

| Event                    | Detail                       | When                                                     |
| ------------------------ | ---------------------------- | -------------------------------------------------------- |
| `braccato:line-click`    | `{ timeS }`                  | A lyric line was clicked, and it asked to seek there      |
| `braccato:lyrics-loaded` | `{ lineCount, syncType }`    | The element applied lyrics, including an empty array      |
| `braccato:scroll-state`  | `{ userScrolling }`          | Autoscroll stopped following the song, or started again   |
| `braccato:error`         | `{ phase, error }`           | Connecting, resolving a source, or applying lyrics or a theme, went wrong |

`braccato:lyrics-loaded` says the element applied lyrics, not that it was given new ones. A theme
that changes a setting the lines are built out of rebuilds the song the element is holding, and the
rebuild reports itself the same way, so a consumer counting songs counts a theme edit as one too.

`braccato:word-click` is **not** implemented, and this is the honest reason: the renderer tells its
host `seek(timeS)` and nothing else, so the element cannot tell a word seek from a line seek without
re-deriving the module's own click branch off the DOM, which would be a second source of truth for
one number. The DOM is light and its class names are published, so a consumer who wants word clicks
listens for `click` on the element and reads `.blyrics--word` themselves, which is where that
knowledge belongs.

`braccato:seek`, which the renderer's own default host dispatches, is not dispatched by the element:
the element supplies its own `seek`, and `braccato:line-click` is what it dispatches instead.

`braccato:error` covers connecting to a document with no browsing context, a theme that disagrees
with another element's in the same document, a `source` that named nothing to follow, and anything
thrown while lyrics or a theme are being applied. Its `phase` is `connect`, `conflict`, `source`,
`lyrics` or `theme`. Nothing thrown by a tick is reported there: a tick runs sixty times a second,
and an error event per frame would bury the one that mattered, so a bug in the tick loop still
surfaces as an exception where it happened. A write to `currentTime` or `playing` while a source is
bound is not reported either, for the same reason and described under Following a media element.

It is dispatched a microtask after the error rather than where it happened, and that is the whole
reason it is receivable. `connectedCallback` runs before any listener a page could have added, and
for an element the parser built it runs before any script on the page has run at all, so a `connect`
or `conflict` error dispatched where it happens is one nobody could ever hear: querying the element
and then adding a listener, which is what the quickstart above does, would miss both by construction.
A microtask still misses a listener added later than that, so `status` is the other half of the
answer and needs no listener at all.

A throw from inside the module while the element is being built is the one thing `braccato:error`
does not cover, and deliberately: it comes out of `connectedCallback`, where the page reports it as
an uncaught error with the stack it happened on. The element counts itself among its document's
views only once the renderer exists, so a build that threw leaves nothing behind claiming to be one.

### Light DOM, not shadow DOM

The element builds into itself rather than into a shadow root, which is a deliberate break from the
component this replaces. Three reasons, all of them the same reason: the theme marketplace selects on
`.blyrics-*` at document level and a shadow root would put every published theme out of reach;
`@property` registrations do not apply to a stylesheet inside a shadow root, which is what the
component this replaces says in its own source; and the extension and a third party should be running
identical code rather than one encapsulated build and one not.

So the theme is adopted into the element's document rather than encapsulated: `setTheme` puts it in
the head under `CUSTOM_THEME_STYLE_ID`, exactly as it does for the renderer. The module's own
stylesheets under `styles/` are the consumer's to load, the way any package's CSS is; inside this
extension they are already there.

### More than one element in a document

Two renderers in one realm render against whichever theme either of them was applied last, and two in
one document write the same theme element and the same scroll padding as well. That constraint is the
module's, described under One renderer per document above.

What it is not is a constraint on the number of elements. Two views handed the **same** theme are not
affected by any of it: the settings they share are the ones both of them asked for, and the renderer
adopts an existing `CUSTOM_THEME_STYLE_ID` element rather than adding a rival under the same id. So
the line is drawn where the problem actually is. A second element builds, and what is reported is the
disagreement rather than the company.

When an element applies a theme that another element in its document was not given, both of them
dispatch `braccato:error` with `phase: "conflict"` and both read `status === "theme-conflict"`. Both,
because the element that diverged is not the one now rendering against a theme it never asked for.
The views keep rendering: a blank view with a reason is worse than a themed one with a warning, and
the reason is readable off `status` by a consumer who was not listening.

An element that leaves a document takes its stylesheet with it if it is the one that created it, so
whatever is still rendering there writes its own theme back into the head as it goes. Replacing one
element with another therefore works whichever order the page does it in, and two elements in two
documents are unaffected either way, which is the arrangement this extension already runs.
