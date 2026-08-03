# @braccato/core

A custom element that renders synchronized lyrics and lights each syllable up as it is sung. No
dependencies. The lines go into light DOM rather than a shadow root, so the CSS already on your page
reaches them.

Extracted from the [Better Lyrics](https://better-lyrics.boidu.dev) rendering engine, which is still
where it runs.

## Install

```bash
npm i @braccato/core
```

## Usage

```html
<audio id="player" src="song.mp3" controls></audio>
<braccato-lyrics source="#player"></braccato-lyrics>

<script type="module">
  import "@braccato/core/element";
  import "@braccato/core/styles/variables.css";
  import "@braccato/core/styles/lyrics.css";
  import "@braccato/core/styles/instrumental.css";

  document.querySelector("braccato-lyrics").lyrics = [
    { startTimeMs: 0, durationMs: 4200, words: "The first line" },
    { startTimeMs: 4200, durationMs: 3800, words: "The second" },
  ];
</script>
```

`source` takes a CSS selector or a media element. It is resolved when the element connects, so put
the `<audio>` before the tag, or write the property from script. Without a source, drive the view
yourself by writing `currentTime` and `playing`.

Two things catch everybody once. The element has no `display` of its own:

```css
braccato-lyrics {
  display: block;
}
```

And autoscroll writes `scrollTop` on the nearest ancestor that scrolls, falling through to the
document when nothing does. If the element is not inside its own scroller, say which one it is:

```js
view.host = { getScrollElement: () => yourFrame };
```

## Lyrics

The array is the whole input, and nothing in this package produces one.
[`@braccato/parsers`](https://www.npmjs.com/package/@braccato/parsers) reads TTML, LRC, SRT, QRC and
plain text, and picks between them by looking at the file.

```js
import { detectParser } from "@braccato/parsers";

const text = await fetch("song.ttml").then(response => response.text());
view.lyrics = detectParser(text).parse(text, player.duration * 1000);
```

A `Lyric` is `{ startTimeMs, durationMs, words }`, with an optional `parts` array of the same three
fields for syllable or word timing, and optional `translation`, `romanization` and
`timedRomanization` beside them.

## Properties

Every one of these may be written before the element is in a document. The renderer is built when it
connects, and everything it was handed by then is applied at once.

| Property        | Attribute      | Type                                | Default  | Description                                                                                                                              |
| --------------- | -------------- | ----------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `lyrics`        |                | `Lyric[] \| null`                   | `null`   | The song. Null means it was never given one, and an empty array clears the view, so there is a way to say both.                            |
| `lyricsOptions` |                | `{ loaderVisible?, noLyrics? }`     | `{}`     | How the lines are built. `noLyrics` marks a message as a placeholder rather than a song, which keeps passive scrolling from drifting it.   |
| `source`        | `source`       | `string \| HTMLMediaElement \| null` | `null`  | A selector or the media element itself. See Following a media element.                                                                     |
| `mediaElement`  |                | `HTMLMediaElement \| null` (get)    | `null`   | What `source` resolved to. Null while disconnected, and null for a selector that missed.                                                   |
| `currentTime`   | `current-time` | `number`                            | `0`      | Playback position in **seconds**. Writing it renders the view again, so whoever holds the clock drives the lyrics by writing this.        |
| `playing`       | `playing`      | `boolean`                           | `false`  | A paused view animates differently from a playing one.                                                                                     |
| `tickOptions`   |                | `ElementTickOptions`                | `{}`     | The rest of a tick: four offsets taken off the clock before it is matched, whether passive scrolling is on, and when the clock was sampled. |
| `theme`         | `theme`        | `string`                            | `""`     | A compiled stylesheet. See Theming.                                                                                                        |
| `host`          |                | `Partial<LyricsRendererHost>`       | `{}`     | Overrides for what the renderer asks of its surroundings. Every member has a default. Writing it while connected rebuilds the view.        |
| `renderer`      |                | `LyricsRenderer \| null` (get)      | `null`   | The renderer underneath, for the day the tag runs out. A different one after every reconnection.                                            |
| `status`        |                | `ElementStatus` (get)               | `"idle"` | `idle`, `rendering`, `theme-conflict` or `no-browsing-context`.                                                                            |

`tickOptions` and `lyricsOptions` are stored on write and read by the next tick or the next build, so
writing options and the clock on the same frame renders once.

## Attributes

An attribute writes its property, and a property never writes back. Reflecting `current-time` would
put the playback clock into the DOM sixty times a second, and one attribute reflecting while the rest
do not is worse than none of them doing it.

| Attribute      | Writes        | Notes                                                                                              |
| -------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| `source`       | `source`      | The selector form only. Another selector moves the binding, and removing it unbinds.                |
| `theme`        | `theme`       | A whole stylesheet in an attribute value. It works, but nobody would ship a theme this way.          |
| `current-time` | `currentTime` | Seconds. A value that does not parse as a number is ignored rather than read as zero.               |
| `playing`      | `playing`     | An ordinary boolean attribute: its presence is what counts, so `playing="false"` is playing.         |

## Events

All four bubble and are composed, so an element you put inside your own shadow root still reaches
your listener.

| Event                    | Detail                    | When                                                                            |
| ------------------------ | ------------------------- | --------------------------------------------------------------------------------- |
| `braccato:lyrics-loaded` | `{ lineCount, syncType }` | Lyrics were applied, including an empty array. A theme change that rebuilds the lines reports itself the same way. |
| `braccato:line-click`    | `{ timeS }`               | A line was clicked. The seek has already reached the bound media element by the time you hear about it.            |
| `braccato:scroll-state`  | `{ userScrolling }`       | Autoscroll stopped following the song, or started again.                                                           |
| `braccato:error`         | `{ phase, error }`        | Connecting, resolving a source, or applying lyrics or a theme went wrong. `phase` is `connect`, `conflict`, `source`, `lyrics` or `theme`. |

Errors are dispatched a microtask after they happen rather than where they happen, which is what
makes them receivable at all: `connectedCallback` runs before any listener a page could have added.
A listener added later than that still misses them, so `status` answers the same question and needs
no listener. Nothing thrown by a tick lands here, because sixty error events a second would bury the
one that mattered.

There is no `braccato:word-click`. The renderer tells its host `seek(timeS)` and nothing else, so the
element cannot tell a word seek from a line seek without re-deriving the click branch off the DOM.
The DOM is light and the class names are published, so listen for `click` on the element and read
`.blyrics--word` yourself.

## Theming

A theme is a stylesheet. Write CSS against the class names below and the module stays out of it. What
it does read is the `blyrics-*` lines inside the comments, which is how a theme changes behaviour
without a second configuration format.

```js
view.theme = `
  /* blyrics-target-scroll-pos-ratio = 0.5; */
  /* blyrics-long-word-threshold = 900; */

  .blyrics-container {
    --blyrics-font-size: 3.5rem;
    --blyrics-lyric-active-color: white;
    --blyrics-lyric-inactive-color: rgb(255 255 255 / 0.25);
  }
`;
```

Settings are read from comments only. Everything else is CSS the browser is going to read, and a
stylesheet must not be able to configure the module by accident. An empty theme puts every setting
back to its default. The stylesheet itself goes into the document head under the
`blyrics-custom-style` id.

There is no `longWordThreshold`, `lineSyncedDelay` or `disableRichsync` property. Those are theme
settings (`blyrics-long-word-threshold`, `blyrics-line-synced-animation-delay`,
`blyrics-disable-richsync`), read from the stylesheet you already hand over. A theme that set one
while a property said otherwise would leave the module with two answers and no rule for picking.

`parseThemeConfig` is published on `@braccato/core/themeSettings` for reading the settings out of a
stylesheet somewhere no renderer is running.

### Custom properties

The ones a theme reaches for first. `variables.css` declares the rest.

```css
.blyrics-container {
  --blyrics-font-family: system-ui, sans-serif;
  --blyrics-font-size: 3rem;
  --blyrics-line-height: 1.333;
  --blyrics-padding: 2rem;
  --blyrics-lyric-active-color: white;
  --blyrics-lyric-inactive-color: rgb(255 255 255 / 0.3);
  --blyrics-glow-color: rgb(255 255 255 / 0.5);
}
```

`--blyrics-font-size` is what everything else is sized off, including the instrumental dots.
`--blyrics-padding` is the vertical room around each line, and the one to reach for before
`line-height`. Every word is given the glow, so a theme that wants it to mean something selects on
`data-long-word`, which the module sets on any part held past `blyrics-long-word-threshold`.

### Class names

These are published API rather than implementation. Renaming one costs a migration rather than a
refactor. Import them from `@braccato/core/constants` instead of typing them out.

| Constant                  | Class                       | What it is                                                |
| ------------------------- | --------------------------- | ----------------------------------------------------------- |
| `LYRICS_CLASS`            | `blyrics-container`         | The view. One per renderer.                                  |
| `LINE_CLASS`              | `blyrics--line`             | One line, carrying its own `dir="auto"`.                     |
| `CURRENT_LYRICS_CLASS`    | `blyrics--active`           | The line the song is on right now.                           |
| `WORD_CLASS`              | `blyrics--word`             | One word, and the unit the sweep animates.                   |
| `BACKGROUND_LYRIC_CLASS`  | `blyrics-background-lyric`  | A background vocal, sung over the line it answers.           |
| `USER_SCROLLING_CLASS`    | `blyrics-user-scrolling`    | Set while a reader has scrolled away and autoscroll waits.   |
| `TRANSLATED_LYRICS_CLASS` | `blyrics--translated`       | A translation hung off a line that was already built.        |
| `CUSTOM_THEME_STYLE_ID`   | `blyrics-custom-style`      | The id of the `<style>` the theme lands in.                  |

## Stylesheets

Three sheets ship with the package, and loading them is yours, the way any package's CSS is. Leave
them out and you get lines that are in the document and unstyled, rather than lines that are missing.

| File                                     | What it carries                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `@braccato/core/styles/variables.css`    | Every `--blyrics-*` default. It goes first, because the other two read from it.                                           |
| `@braccato/core/styles/lyrics.css`       | The container, the lines, the words and the sweep, plus two `@property` registrations the word animation interpolates through. |
| `@braccato/core/styles/instrumental.css` | The waveform that fills a bar nobody sings over, and the animation that walks it.                                          |

One thing they do not do for you. The module measures the room the first and last lines need to reach
the view's target scroll position and writes it on the root as `--blyrics-padding-top` and
`--blyrics-padding-bottom`, but `lyrics.css` only spends the bottom one. Supply the top rule:

```css
.blyrics-container {
  padding-top: var(--blyrics-padding-top, 2rem);
}
```

## Light DOM, not shadow DOM

The element builds into itself. That is what lets a stylesheet at document level select the lines,
and what lets the package's own `@property` registrations apply to them, which they would not inside
a shadow root. The theme is adopted into the element's document rather than encapsulated, and the
package's stylesheets are yours to load for the same reason.

## Entry points

`@braccato/core` is the facade and registers nothing. `createLyricsRenderer(options)` returns one
`LyricsRenderer`: give it lyrics, tick it, and it owns the DOM it builds and every re-measurement
that DOM needs. `resetPlaybackClock`, `resumeAllAutoscroll`, `injectRomanization` and
`injectTranslation` are published beside it, for what one instance cannot answer for on its own.

`@braccato/core/element` registers `<braccato-lyrics>`, and `<better-lyrics>` beside it, on import.
Registration is a side effect, which is why it is entered separately.

Four leaves import nothing at all, so taking one does not pull the engine into your bundle with it:

- `@braccato/core/constants` for the class names and element ids above
- `@braccato/core/text` for script detection: `testRtl`, `containsNonLatin`, `detectNonLatinLanguage`
- `@braccato/core/themeSettings` for `parseThemeConfig`
- `@braccato/core/util` for pure helpers such as `clamp` and `toMs`

Two notes on the element entry point. A browser extension's isolated world has no custom element
registry, so `window.customElements` is null there and importing this file throws where it registers.
An extension that wants the tag has to run in the page's own world; one that stays isolated calls
`createLyricsRenderer` directly. And registration is silent about a name already taken, so two copies
of this package on one page means the first to load takes both names and `instanceof` against the
second copy's class is false for every element on the page. Load one copy.

## Following a media element

While a `source` is bound, the element drives itself. It reads `currentTime` and `paused` off the
media element on a `requestAnimationFrame` loop that runs only while the song plays, and a click on a
lyric line sets `currentTime` back on it. So `currentTime` and `playing` become outputs: a write to
either is dropped and the getter keeps reporting what the binding last read. Dropped rather than
reported, because a consumer who bound a source and left their own frame loop running would otherwise
be told about it sixty times a second. Unbind and the clock goes back to whoever asked for it.

A reading the media element has not refreshed yet is carried forward at the playback rate it was
taken at, capped at 100ms of frame time. That cap is what covers a stall: the view runs at most 100ms
past the last real reading and then waits with it. What it costs is a step backwards when the clock
moves again, scaled by the rate. 100ms at 1x, 400ms at 4x.

`play`, `pause`, `seeking`, `seeked` and `ratechange` are listened to. The frame loop covers the rest
by asking the media element whether its clock is still going rather than trusting that something said
so. One gap is worth knowing: `emptied` while already paused leaves no loop running to notice, so
swapping `audio.src` between songs without playing goes on reporting the old position until the next
`play`.

## One renderer per document

Two renderers in one document write over each other, so the module supports one. It is a constraint
rather than a setting, and it is stated rather than enforced: none of the points where two of them
collide is a crash.

Two things are written per document and belong to whichever renderer wrote them last: the theme's
`<style>` element, and the scroll padding on the root. Two more are per bundle, because a settings
registry and the playback clock both live at module scope: one theme means one set of values for
every view in that bundle, and whichever view ticked last is the one whose clock the others replay.

None of that is a limit on how many elements you may have. Two views handed the **same** theme share
only the settings both of them asked for, and the renderer adopts an existing theme element rather
than adding a rival under the same id. The line is drawn at the disagreement: when an element applies
a theme another element in its document was not given, both dispatch `braccato:error` with
`phase: "conflict"` and both read `status === "theme-conflict"`. Neither stops rendering, because a
blank view with a reason is worse than a themed one with a warning.

## Docs and demo

Full documentation is at [braccato.boidu.dev](https://braccato.boidu.dev).

The demo page lives at [`demo/`](https://github.com/better-lyrics/better-lyrics/tree/master/demo) in
the repository and runs against the emitted package, with a control for most of what is above. Clone
the repository and run `npm run demo`, then open `http://127.0.0.1:4319/demo/`.

## Licence

MIT. See `LICENSE`.
