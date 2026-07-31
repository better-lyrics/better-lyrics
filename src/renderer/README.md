# Lyrics renderer

Builds and animates a synchronized lyrics view. One instance per rendered surface: the YouTube Music
side panel runs one, the floating Picture-in-Picture window runs another, and the two share nothing
but parsed lyric data and a playback clock.

This directory is a package boundary. It is meant to be lifted out into `../braccato` later, so it is
written as though it already had been.

## Rules

Nothing here may import from `@core/*`, `@modules/*`, `@constants`, `@utils`, `@options` or `@/`,
reach outside this directory with a relative path, reference `chrome.`, or import a package.
`boundary.selfcheck.ts` enforces all of that and runs as part of `npm run selfcheck`. If a change
makes it fail, the change is wrong, not the check.

The one exemption: `*.selfcheck.ts` files may import `node:*` builtins and `typescript`. They are
repo infrastructure, never bundled, and `typescript` is a devDependency here and in braccato.

The `chrome.` rule is not stylistic. On Firefox this module runs in the PAGE world, because Gecko
hands content scripts a cross-origin wrapper on the Picture-in-Picture window. A single `chrome.`
reference drags the webext polyfill into that bundle and kills it silently. See
`.claude/rules/pitfalls.md`.

## Public API

The index publishes the renderer, the leaves publish the standalone pieces. `constants.ts`,
`text.ts`, `themeSettings.ts` and `util.ts` are the leaves: they import nothing, so a consumer that
needs one class name, one script test or one pure helper does not pull the engine into its bundle
with it. Importing `./engine`, `./inject`, `./view` or anything else from outside this directory is a
violation in the other direction and is checked too, as is a published leaf growing an import.

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

The DOM and the CSS that styles it are one artifact. These belong to the module and move with it:

- `public/css/blyrics/lyrics.css`
- `public/css/blyrics/instrumental.css`
- the `--blyrics-*` declarations in `public/css/blyrics/variables.css`

These belong to the extension, because they style the host rather than the lyrics:
`components.css`, `misc.css`, `modal.css`, `responsive.css`, `picture-in-picture.css`.

They stay physically in `public/css/blyrics/` for now. Moving them under `src/renderer/` means
teaching the build to emit them from a new location, which is deferred to the lift.

One misfiling to fix when they are split: `responsive.css` paints
`.blyrics-container::before/::after` below 615px, which is a host decoration living in a lyric
selector. The floating window is always narrower than that, so it currently has to neutralise the
rule.

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
