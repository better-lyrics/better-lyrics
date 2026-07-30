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

`index.ts` is the API. `constants.ts`, `themeSettings.ts` and `util.ts` are published beside it
because they import nothing, so a consumer that needs one class name does not pull the engine into
its bundle with it. Importing `./engine`, `./inject`, `./view` or anything else from outside this
directory is a violation in the other direction and is checked too, as is a published leaf growing
an import.

Everything the module needs from its surroundings arrives through `LyricsRendererOptions`: the
document to build in, the window to schedule against, the mount, the scroll element, and a
`LyricsRendererHost`. The host is the only extension point. It answers questions the module cannot
(is this view on screen, is a loader up) and performs actions it must not own (seek the player).

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

`themeSettings.ts` owns the registry. Settings are parsed once from the compiled stylesheet, so they
are global rather than per instance: one theme means one set of values for every view.
`registerThemeSetting` runs at module scope, which evaluates once per bundle regardless of how many
instances exist.

The module is bundled into both the isolated and the page-world bundles, which are separate realms
with separate registries. Each needs the parsed config fed to it, or one view renders against
defaults while the other renders against the theme.

## Ticking

The module does not own a clock. `tick(currentTimeS, options)` is called by whoever has one. In this
extension that is the interpolated player snapshot from `blyrics-send-player-time`; in braccato it
would be an audio element's `currentTime`. A wrapper that owns its own animation frame loop can be
added on top later without touching this.
