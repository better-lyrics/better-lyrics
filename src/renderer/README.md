# Lyrics renderer

Builds and animates a synchronized lyrics view. One instance per rendered surface: the YouTube Music
side panel runs one, the floating Picture-in-Picture window runs another, and the two share nothing
but parsed lyric data and a playback clock.

This directory is a package boundary. It is meant to be lifted out into `../braccato` later, so it is
written as though it already had been.

## Rules

Nothing here may import from `@core/*`, `@modules/*`, `@constants`, `@utils`, `@options` or `@/`,
reach outside this directory with a relative path, reference `chrome.`, or import a package. Nothing
under `styles/` may name a YouTube Music selector. `boundary.selfcheck.ts` enforces all of that and
runs as part of `npm run selfcheck`. If a change makes it fail, the change is wrong, not the check.

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
host's business: this extension dispatches `blyrics-seek-to` at the page world, another consumer
would set `currentTime` on a media element.

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

The build emits `styles/*.css` at `css/blyrics/<name>`, the paths `css/blyrics/index.css` already
imports, so nothing outside the module knows the sources moved: the two injection sites and the
manifest's web accessible resources are untouched. `emitRendererStyles` in `extension.config.cjs`
does it, from the emit hook rather than a processAssets stage, so the CSS minimizer leaves them
exactly as authored, the way the copies under `public/` arrive.

`boundary.selfcheck.ts` holds the stylesheets to the same rule as the code: none of them may name
`ytmusic`, `#tab-renderer`, `#main-panel`, `player-fullscreened`, `#layout` or `blyrics-dfs`. A
violation is reported with its file, its line and the name it reached for.

One tie remains. `--blyrics-font-family` reads `var(--noto-sans-universal)`, and that stack stays
with the extension, in `misc.css`, because the extension is what loads those families and two
published themes select on it by name. Inside the extension it resolves as it always did; a
standalone consumer would need to define it or the declaration resolves to nothing.

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

One renderer per document owns that element. Two renderers in one document render against one theme
whatever either of them is given, because the settings registry below is module scope, so this is a
constraint rather than a configuration to support. It is stated rather than enforced, and the
behaviour is defined either way: a renderer that finds the id already in its document writes into
the element it finds rather than adding a rival under the same id, and `destroy` removes the element
only if that renderer is the one that created it.

The CSS is compiled CSS, not theme source. Better Lyrics themes are written in RICS and compiled
with the `rics` package first, which is the consumer's dependency rather than this module's: the
module ships with none. `parseThemeConfig` is published on the `themeSettings.ts` leaf for a
consumer that wants the configuration out of a stylesheet somewhere no renderer is running.

`themeSettings.ts` owns the registry. `registerThemeSetting` runs at module scope, which evaluates
once per bundle regardless of how many instances exist, so the values are global rather than per
instance: one theme means one set of values for every view. The stylesheet is the other way round,
one per document, so two views in two documents are each given their own.

The module is bundled into both the isolated and the page-world bundles, which are separate realms
with separate registries. Each needs its own `setTheme` call, or one view renders against defaults
while the other renders against the theme.

## Ticking

The module does not own a clock. `renderer.tick(currentTimeS, options)` is called by whoever has one.
In this extension that is the interpolated player snapshot from `blyrics-send-player-time`; in
braccato it would be an audio element's `currentTime`. A wrapper that owns its own animation frame
loop can be added on top later without touching this.

`options.isPlaying` is the one thing a tick cannot be given a sensible default for. The rest of
`TickOptions` describes a setting the consumer may not have, so all of it may be left out.

Three doors move the lyrics without the song moving, and they differ in what they measure.
`renderer.retickFromPlaybackClock` renders again against the last snapshot the module saw and
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

```html
<braccato-lyrics></braccato-lyrics>
<script type="module">
  import "@braccato/core/element";

  const view = document.querySelector("braccato-lyrics");
  view.lyrics = lyrics;
  view.theme = compiledCss;
  view.addEventListener("braccato:line-click", event => {
    audio.currentTime = event.detail.timeS;
  });

  const followPlayer = () => {
    view.currentTime = audio.currentTime;
    view.playing = !audio.paused;
    requestAnimationFrame(followPlayer);
  };
  followPlayer();
</script>
```

### Properties

`lyrics`, `currentTime`, `playing`, `theme` and `host` are writable, `renderer` is not. All of them
may be written before the element is in a document: the renderer is built when it connects, and
everything it was handed by then is applied at once. That includes properties a page wrote before
this module even loaded, which land on the instance and would shadow the accessors forever if
`connectedCallback` did not run them through again.

`currentTime` is in **seconds**, not the milliseconds braccato's component took. The module ticks in
seconds, and an element that converted would leave itself and the renderer underneath it disagreeing
about what a number means. Writing it renders the view again, so whoever owns the clock drives the
lyrics by writing it. Writing `playing` renders again too, since a paused view animates differently
from a playing one.

`lyrics` is null until it is given a song, which is not the same as being given none: an element that
was never handed lyrics leaves whatever it is mounted over alone, and an empty array clears the view,
so a consumer between songs has a way to say so.

`theme` is a compiled stylesheet, the same string `renderer.setTheme` takes, described under Theme
settings above. If the theme changes a setting the lines are built out of, the element rebuilds them,
because it is holding them. An empty theme puts every setting back to its default, so an element that
was never given one does not apply one.

`host` is `Partial<LyricsRendererHost>`, and every member of it still has a default, so a consumer
with nothing to say about its surroundings says nothing. Writing it while connected rebuilds the
view: the renderer is handed its host once, when it is created. The element wraps two of its members
rather than replacing them, so a consumer who wrote `seek` or `setResumeAffordanceVisible` is still
called and the matching event still fires.

`renderer` is the `LyricsRenderer` underneath, for a consumer who outgrows the element: null while
disconnected, and a different one after every reconnection.

`dir` is deliberately not among them. `HTMLElement` already reflects it, and the lines this module
builds carry `dir="auto"` and resolve their own direction from their own text, so the element's `dir`
is the base direction everything under it inherits and nothing here has to reimplement that.

There is no `longWordThreshold`, `lineSyncedDelay` or `disableRichsync` either. Those are theme
settings (`blyrics-long-word-threshold`, `blyrics-line-synced-animation-delay`,
`blyrics-disable-richsync`), read from the stylesheet the consumer already hands over, and a theme
that set one while an attribute said otherwise would leave the module with two answers and no rule
for picking between them. Configure them in the theme.

### Attributes

`current-time`, `playing` and `theme` are read as attributes as well, in one direction only: an
attribute writes its property, and a property never writes back. Reflecting `current-time` would put
the playback clock into the DOM sixty times a second, and one attribute reflecting while the others
do not is worse than none of them doing it. `playing` is an ordinary boolean attribute, so its
presence is what counts and `playing="false"` is playing. A `current-time` that does not parse as a
number is ignored rather than read as zero, because a half written attribute must not send the lyrics
back to the top of the song.

### Events

Every one of these bubbles and is composed, so an element a consumer put inside their own shadow root
still reaches their listener.

| Event                    | Detail                       | When                                                     |
| ------------------------ | ---------------------------- | -------------------------------------------------------- |
| `braccato:line-click`    | `{ timeS }`                  | A lyric line was clicked, and it asked to seek there      |
| `braccato:lyrics-loaded` | `{ lineCount, syncType }`    | The element applied lyrics, including an empty array      |
| `braccato:scroll-state`  | `{ userScrolling }`          | Autoscroll stopped following the song, or started again   |
| `braccato:error`         | `{ phase, error }`           | Connecting, or applying lyrics or a theme, went wrong     |

`braccato:word-click` is **not** implemented, and this is the honest reason: the renderer tells its
host `seek(timeS)` and nothing else, so the element cannot tell a word seek from a line seek without
re-deriving the module's own click branch off the DOM, which would be a second source of truth for
one number. The DOM is light and its class names are published, so a consumer who wants word clicks
listens for `click` on the element and reads `.blyrics--word` themselves, which is where that
knowledge belongs.

`braccato:seek`, which the renderer's own default host dispatches, is not dispatched by the element:
the element supplies its own `seek`, and `braccato:line-click` is what it dispatches instead.

`braccato:error` covers connecting to a document with no browsing context, a second element in a
document that already has one, and anything thrown while lyrics or a theme are being applied. Nothing
thrown by a tick is reported there: a tick runs sixty times a second, and an error event per frame
would bury the one that mattered, so a bug in the tick loop still surfaces as an exception where it
happened.

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

### One element per document

Two renderers in one realm render against whichever theme either of them was given last, because the
settings registry is module scope, and two in one document would be writing the same theme element as
well. That constraint is the module's, described under Theme settings above; the element is what
makes it easy to break, so it is the element that holds the line.

The first element to connect to a document owns it. A second one builds nothing, dispatches
`braccato:error` with `phase: "conflict"`, and waits. When the owner disconnects, the element that
has been waiting longest takes the document over and builds, so replacing one element with another
works whichever order the page does it in. Two elements in two documents are unaffected, which is the
arrangement this extension already runs.
