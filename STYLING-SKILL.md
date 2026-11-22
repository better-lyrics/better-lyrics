# Better Lyrics Theme Creation Guide for AI Agents

Essential reference for creating custom themes. For deep dives, see [STYLING.md](https://github.com/better-lyrics/better-lyrics/blob/master/STYLING.md).

## Rendering: lyrics are drawn on a canvas

Better Lyrics draws lyrics with braccato's WebGL renderer (`@braccato/core` 2). The lines are still in the page, laid out by the browser but invisible, and a canvas draws them. That decides what a theme can do:

- **Works:**
  - every `--blyrics-*` variable below;
  - the comment knobs;
  - selectors that scope variables (colours resolve per element, so `[data-agent="v2"] { --blyrics-lyric-active-color: … }` colours just those lines);
  - layout properties on lines: `font-*`, `letter-spacing`, `line-height`, `text-align`.
- **Does not show:**
  - paint on lyric elements: `opacity`, `filter`, `transform`, `color`, `text-shadow`, `background`, `border`, `box-shadow`, `-webkit-text-stroke`, `mix-blend-mode`;
  - `animation`, `transition` and `@keyframes` on lyric elements;
  - `::before` / `::after` on lyric elements;
  - `:hover` on lines, except the hovered line's opacity, blur and scale (see [Effects](#effects)).
- **Never set:** `.blyrics--active`, `.blyrics--animating`, `.blyrics--paused` and `[data-word-state]`, so nothing keyed off them applies. `.blyrics-user-scrolling` is still set on the container.
- **Spacing:** the space around a line is `--blyrics-padding`. The renderer sets lines' and words' own `padding` and `margin`.

Fading and blurring lines around the sung one is done with lists (see [Effects](#effects)). Everything outside the lyrics (YouTube Music's layout, the background, the footer, the loader, the player) is ordinary DOM and styles as usual.

Some effects have no equivalent:
- hover styles beyond the hovered line's opacity, blur and scale
- shadows, strokes, backgrounds or borders on lyrics
- filters other than blur
- per-word opacity or styles keyed off a word's state
- pseudo-element decorations
- custom keyframes
- rotated text

Don't fake them. Tell the user they are not possible yet and suggest asking in the [Better Lyrics Discord](https://discord.gg/UsHE3d5fWF), so they can be added to the renderer. To move an older theme over, run `npx create-bl-theme@beta migrate --write`: it writes the distance lists from the theme's line rules and lists the rest.

## Quick Reference: CSS Variables

### Colors

```css
:root {
  --blyrics-text-color: color(display-p3 1 1 1 / 1);
  --blyrics-highlight-color: color(display-p3 1 1 1 / 0.5);
  --blyrics-active-opacity: 1;
  --blyrics-inactive-opacity: 0.3;
  --blyrics-translated-opacity: 0.6;
}
```

### Typography

Leave font-family overrides unset for language-aware CJK defaults. If adding a font, declare `--blyrics-font-family: "My Font", var(--noto-sans-universal), sans-serif` on `.blyrics--line, .blyrics--translated, .blyrics--romanized` so the fallback resolves in each element's language.

```css
:root {
  --blyrics-font-size: 3rem;
  --blyrics-font-weight: 700;
  --blyrics-line-height: 1.333;
  --blyrics-translated-font-size: 2rem;
  --blyrics-translated-font-weight: 600;
  --blyrics-translated-font-family: var(--blyrics-font-family);
}
```

### Animation

```css
:root {
  --blyrics-animate-line-scale: 1;
  --blyrics-animate-word-wobble: 1;
  --blyrics-animate-highlight-swipe: 1;
  --blyrics-animate-highlight-glow: 1;
  --blyrics-animate-highlight-fade: 1;
  --blyrics-animate-scroll: 1;
  --blyrics-animate-instrumental: 1;
  --blyrics-loader-transition-duration: 0.6s;
  --blyrics-loader-transition-easing: cubic-bezier(0.22, 1, 0.36, 1);
  --blyrics-scale-transition-duration: 0.166s;
  --blyrics-line-enter-easing: ease;
  --blyrics-line-exit-easing: ease;
  --blyrics-lyric-highlight-fade-in-duration: 0.33s;
  --blyrics-lyric-highlight-fade-out-duration: 0.5s;
  --blyrics-lyric-highlight-fade-in-easing: ease;
  --blyrics-lyric-highlight-fade-out-easing: ease;
  --blyrics-highlight-swipe-easing: linear;
  --blyrics-highlight-swipe-start-from: -0.2; /* lit edge start, in word widths */
  --blyrics-highlight-swipe-end-from: -0.1; /* not used */
  --blyrics-highlight-swipe-start-to: 1.4; /* lit edge end, in word widths */
  --blyrics-highlight-swipe-end-to: 1.5; /* soft edge width = end-to - start-to */
  --blyrics-highlight-glow-radius-from: 0.8rem; /* halo radius */
  --blyrics-highlight-glow-radius-to: 0; /* 0 fades the glow out; anything else holds it */
  --blyrics-highlight-glow-duration-ratio: 1.2;
  --blyrics-highlight-glow-min-duration: 1.2s;
  --blyrics-highlight-glow-easing: ease;
  --blyrics-wobble-duration: 1s;
  /* Word and letter transforms take translations and scales; rotations and skews are ignored. */
  --blyrics-word-wobble-transform-from: scaleX(1);
  --blyrics-word-wobble-transform-peak: translateX(0.05em) scaleX(1.025);
  --blyrics-word-wobble-transform-settle: translateX(0) scaleX(1);
  --blyrics-word-wobble-transform-to: scaleX(1);
  --blyrics-word-wobble-peak-offset: 0.125;
  --blyrics-word-wobble-settle-offset: 0.75;
  --blyrics-word-wobble-easing: ease;
  --blyrics-word-wobble-peak-easing: ease-in-out;
  /* Letter wave (experimental, on by default; disable with blyrics-letter-wave = false) */
  --blyrics-letter-wave-transform: translateY(-0.05em);
  --blyrics-letter-wave-settle: translateY(-0.02em);
  --blyrics-letter-wave-emphasis-scale: 1.11;
  --blyrics-letter-wave-duration: 0.9s;
  --blyrics-letter-wave-rise-easing: ease-in-out;
  --blyrics-letter-wave-fall-easing: ease-out;
  --blyrics-instrumental-fill-fade-duration: 150ms;
  --blyrics-instrumental-wave-oscillation-duration: 1.25s;
  --blyrics-timing-offset: 0.115s;
  --blyrics-richsync-timing-offset: 0.150s;
  --blyrics-scroll-timing-offset: 0.5s;
  --blyrics-lyric-scroll-timing-function: cubic-bezier(0.86, 0, 0.2, 1);
}
```

### Layout

```css
:root {
  --blyrics-padding: 2rem;
  --blyrics-margin: 2rem;
  --blyrics-border-radius: 1000rem;
  --blyrics-padding-top: 0px;                    /* calculated automatically */
  --blyrics-padding-bottom: 0px;                 /* calculated automatically */
  --blyrics-panel-size: 50%;                     /* lyrics container width (audio mode) */
  --blyrics-video-panel-size: 30%;               /* lyrics container width (video mode) */
  --blyrics-fullscreen-panel-size: 66%;          /* lyrics container width (fullscreen audio) */
  --blyrics-fullscreen-video-panel-size: 25%;    /* lyrics container width (fullscreen video) */
  --blyrics-album-art-size: 400px;               /* max album art width (audio mode) */
}
```

### Effects

```css
:root {
  --blyrics-scale: 0.95;        /* lines other than the sung one */
  --blyrics-active-scale: 1;    /* the sung line */
  --blyrics-blur-amount: 30px;
  --blyrics-background-blur: 100px;
  --blyrics-background-saturate: 2;
}

.blyrics-container {
  /* Opacity and blur for the sung line, then 1, 2, 3... lines away. */
  --blyrics-line-opacity-after: 1 0.88 0.72 0.52 0.28 0;   /* lines still to come */
  --blyrics-line-blur-after: 0 1.125px 2.5px 4.125px 6px;
  --blyrics-line-opacity-before: 1 0.4;                    /* lines already sung */
}
```

- `--blyrics-line-opacity` and `--blyrics-line-blur` set both sides at once.
- The last value holds beyond the end: `1 0.5` dims every other line, and a trailing `0` hides the rest.
- Blurs are `px` or `rem` and mean what `blur()` means.
- The renderer interpolates between lines as the view scrolls, and eases the effects off while the reader scrolls.

The line under the mouse can take its own opacity, blur and scale, as a `:hover` rule once gave it:

```css
.blyrics-container {
  --blyrics-line-hover-opacity: 1;      /* replaces the distance opacity */
  --blyrics-line-hover-blur: 0;         /* replaces the distance blur */
  --blyrics-line-hover-scale: 1.02;     /* replaces the line's scale */
  --blyrics-line-hover-duration: 0.2s;  /* default */
  --blyrics-line-hover-easing: ease;    /* default */
}
```

Leave one unset to keep the line's own value. Touch input has no hover.

`--blyrics-blur-amount` is the player bar's frost. On the player page it is skipped while
`--blyrics-background-blur` is exactly its 100px default (a style container query in
`general.css`): over that background the frost changes no pixel, and Chromium would otherwise re-blur
the whole bar in every frame the lyrics scroll near it. A theme that sharpens the background gets the
frost back automatically.

### Footer

```css
:root {
  --blyrics-footer-bg-color: hsla(0, 0%, 100%, 0.1);
  --blyrics-footer-border-color: hsla(0, 0%, 100%, 0.1);
  --blyrics-footer-text-color: #aaa;
  --blyrics-footer-link-color: #fff;
  --blyrics-footer-font-family: Roboto, Arial, sans-serif;
  --blyrics-footer-font-size: 14px;
}
```

Sync credits from providers that name contributors (Spicy Lyrics) render after the source link as `a.blyrics-footer__contributor` (children `-label` and `-name`, the whole phrase is the link), direct children of `.blyrics-footer__container`, and on the karaoke end card as `a.blyrics-karaoke-contributor` inside `.blyrics-karaoke-source`.

### Songwriter Credits

```css
:root {
  --blyrics-credits-label: "Written by"; /* localized by the extension */
  --blyrics-credits-font-size: max(0.4em, 12px);
  --blyrics-credits-opacity: 0.2; /* during the song */
  --blyrics-credits-focused-opacity: 0.85; /* after the last line ends */
}
```

`p.blyrics-credits` follows the last line. It is not a `div`, so `.blyrics-container > div` line rules skip it; style it through `.blyrics-credits`. Hide with `display: none` or the `blyrics-hide-credits` knob.

## Configuration Knobs

Comment-based parameters that control JS behavior. Place anywhere in your theme:

```css
/*
blyrics-disable-richsync = true;
blyrics-line-synced-animation-delay = 50;
blyrics-target-scroll-pos-ratio = 0.37;
blyrics-swipe-lead-ratio = 0.1;
blyrics-swipe-duration-ratio = 1.6;
*/
```

| Knob | Default | Description |
|------|---------|-------------|
| `blyrics-disable-richsync` | `false` | Render richsynced lyrics through the line-synced path instead, including line-synced fade-in |
| `blyrics-line-synced-animation-delay` | `50` | Per-word delay for synced lyrics (ms) |
| `blyrics-lyric-ending-threshold-s` | `0.5` | Seconds before line ends to consider it complete |
| `blyrics-early-scroll-consider-s` | `0.54` | Independent future lookahead for scroll grouping (s) |
| `blyrics-target-scroll-pos-ratio` | `0.37` | Lyric position (0=top, 0.5=center, 1=bottom) |
| `blyrics-swipe-lead-ratio` | `0.1` | Rich-sync swipe lead as a fraction of word duration |
| `blyrics-swipe-duration-ratio` | `1.6` | Rich-sync swipe duration as a multiple of word duration |
| `blyrics-long-word-threshold` | `1500` | Duration (ms) above which `data-long-word` is set |
| `blyrics-long-word-wrap-threshold` | `10` | Characters per break point; words longer than twice this get `.blyrics-word-group-long` and wrap inside |
| `blyrics-letter-wave` | `true` | Experimental, on by default. Split words into per-letter spans and float each letter as it is sung, over the word wobble. Tune with `--blyrics-letter-wave-*`; long words also get a per-letter scale swell. Disable with `blyrics-letter-wave = false` |
| `blyrics-hide-instrumental-only` | `false` | Treat "[Instrumental Only]" as no lyrics (enables fullscreen effect) |
| `blyrics-hide-credits` | `false` | Never build the songwriter credits line |
| `blyrics-passive-scroll-enabled` | `true` | Unsynced auto-scroll: enable/disable entirely (overrides user setting) |
| `blyrics-passive-scroll-seconds-per-line` | `3.5` | Unsynced auto-scroll: seconds per line (scroll speed) |
| `blyrics-passive-scroll-bottom-pause-s` | `1.5` | Unsynced auto-scroll: pause at bottom (s) |
| `blyrics-passive-scroll-reset-duration-s` | `0.6` | Unsynced auto-scroll: scroll-back-to-top duration (s) |
| `blyrics-passive-scroll-top-pause-s` | `0.8` | Unsynced auto-scroll: pause at top (s) |

**Scroll timing**: `blyrics-early-scroll-consider-s` defaults to `0.54` seconds independently of animation duration. Lookahead only affects the target when another lyric triggers a scroll; entering the window alone does not scroll. Lines included in a committed scroll cannot trigger again at their own start. Seeking, resuming autoscroll and relayout may still reposition the view. The view glides to each new target over 750ms, eased by `--blyrics-lyric-scroll-timing-function`; the DOM renderer's per-line scroll knobs and variables (`blyrics-line-scroll-*`, `--blyrics-line-scroll-*`, `--blyrics-lyric-scroll-duration`) are not read.

**PiP scroll position**: knobs are shared by the panel, fullscreen and PiP. To give PiP its own position, set `--blyrics-target-scroll-pos-ratio` under `.blyrics-pip-shell`: `.blyrics-pip-shell .blyrics-container { --blyrics-target-scroll-pos-ratio: 0.37; }`. It overrides `blyrics-target-scroll-pos-ratio` wherever it resolves. Plain number, clamped to `0` to `1`, `%` not converted, non-numbers fall back to the knob. Read once per theme apply, and panel and fullscreen share one view, so a fullscreen-only selector won't switch on toggle.

**PiP scroll timing**: PiP defaults `--blyrics-scroll-timing-offset` to `0s` (at zero specificity), so a line moves only once the next one starts. A `:root` value doesn't reach it; override under `.blyrics-pip-shell .blyrics-container`.

**PiP lyrics swap**: a new set of lyrics (new song, or another source from the dock) fades the old lines out and rises the on-screen lines in one after another. A source switch in the same song holds the old lyrics, dimmed, with `.blyrics-pip-scroller[data-held]` (default `opacity: 0.35`) until the next ones land; the loader shows only after 250ms. The fading copy is `.blyrics-pip-lyrics__exit`. The rise ends at the theme's own line opacity and adds to its `filter`, so dimmed or blurred lines don't snap. Reduced motion turns both into a short fade. PiP only. `.blyrics-pip-lyrics[data-revealing]` while lines rise. Tunable on `.blyrics-pip-lyrics`, read once per swap: `--blyrics-pip-lyrics-hold-delay` (250ms), `-exit-duration` (200ms), `-reveal-duration` (500ms), `-reveal-delay` (120ms), `-reveal-stagger` (40ms), `-reveal-lines` (all on screen, `0` = no rise), `-reveal-distance` (12px), `-reveal-blur` (3px), `-reveal-easing` (`cubic-bezier(0.22, 1, 0.36, 1)`); all prefixed `--blyrics-pip-lyrics`.

## Dynamic Properties

Properties set by JS at runtime on individual elements:

| Property | Set On | Description |
|----------|--------|-------------|
| `--blyrics-padding-top` | `:root` | Calculated top spacer for scroll positioning |
| `--blyrics-padding-bottom` | `:root` | Calculated bottom spacer for scroll positioning |

The renderer times every lyric effect itself; nothing per word or per line is published as a variable.

## DOM Structure

The lines are laid out in this DOM but drawn on a canvas beside it. Use it to scope variables and to lay lines out; paint on these elements does not show.

```
.blyrics-container.brs-layout [data-sync] [data-loader-visible] [data-no-lyrics] [data-credits-focused] [data-layout]
├── .blyrics--line (div) [data-agent] [data-line-number] [data-direction] [lang]
│   ├── .blyrics-line-main (div)
│   │   └── .blyrics-bidi-run (span)
│   │       └── .blyrics-word-group (span)
│   │           └── .blyrics--word.blyrics-word-highlight (span) [data-long-word]
│   │               └── .blyrics--letter (span, when the letter wave splits the word)
│   ├── .blyrics-background-line (div, only when primary background vocals are present)
│   │   └── … .blyrics-word-group.blyrics-background-lyric
│   ├── .blyrics--romanized.blyrics-content-line
│   └── .blyrics--translated.blyrics-content-line
├── .blyrics--instrumental.blyrics--line [data-instrumental="true"] (the note is drawn on the canvas)
├── p.blyrics-credits
└── .blyrics-footer (ordinary DOM: styles as usual)
```

### Container Data Attributes

| Attribute | Values | Description |
|-----------|--------|-------------|
| `data-sync` | `"richsync"`, `"synced"`, `"none"` | Sync type |
| `data-loader-visible` | `"true"`, `"false"`, or absent | Loader visibility |
| `data-no-lyrics` | `"true"` or absent | No lyrics available |
| `data-credits-focused` | present or absent | Songwriter credits hold the scroll focus |
| `data-layout` | `"stage"` or absent | The karaoke stage layout |

### Word Data Attributes

| Attribute | Description |
|-----------|-------------|
| `data-long-word` | `"true"` or absent - present when duration exceeds threshold |

### Loader Attributes

| Attribute | Description |
|-----------|-------------|
| `[active]` | Loader is visible |
| `[small-loader]` | Compact loader (still searching) |
| `[no-sync-available]` | Synced lyrics not found |

## Selectors Reference

| Selector | Purpose |
|----------|---------|
| `.blyrics-container` | Main lyrics wrapper |
| `.blyrics--line` | Lyric line (div) |
| `.blyrics-line-main` | Main lyric text row |
| `.blyrics-background-line` | Primary background vocal row |
| `.blyrics-bidi-run` | Inline text-flow wrapper for native browser bidi ordering |
| `.blyrics-bidi-sensitive` | Applied to rows containing RTL script |
| `.blyrics-word-group` | Word/syllable group |
| `.blyrics-word-group-long` | Word group longer than twice `blyrics-long-word-wrap-threshold`; the word wraps inside it |
| `.blyrics--word` / `.blyrics-word-highlight` | Word span (both classes on one element); scope per-word variables such as `--blyrics-glow-color` here |
| `.blyrics--letter` | A letter, when the letter wave splits a word |
| `.blyrics-user-scrolling` | User is scrolling manually |
| `.blyrics-rtl` | RTL language support |
| `.blyrics--translated` | Translation text |
| `.blyrics--romanized` | Romanization text |
| `.blyrics--error` | Error message |
| `.blyrics--instrumental` | Instrumental break |
| `[data-agent="v1"]` | Primary voice (left) |
| `[data-agent="v2"]`, `[data-agent="v3"]` | Secondary/tertiary voice (right) |
| `[data-agent="v1000"]` | Duet/chorus (centered) |
| `[data-long-word]` | Long sustained word |

Not set by the WebGL renderer, so rules keyed off them do nothing: `.blyrics--active`, `.blyrics--animating`, `.blyrics--paused`, `[data-word-state]`, `.blyrics-line-synced-word`, `.blyrics-highlight-run` and the `.blyrics-sweep-*` layers.

## Animation System

The renderer animates everything on the canvas from the variables above. What each part does:

- **Swipe:** a soft edge crosses each word from `--blyrics-lyric-inactive-color` to `--blyrics-lyric-active-color`. `--blyrics-highlight-swipe-start-from` / `-start-to` place the edge, and `-end-to` minus `-start-to` sets its width.
- **Glow:** a blur of the lit letters in `--blyrics-glow-color`. It is sized by `--blyrics-highlight-glow-radius-from` (and `-to`; `0` fades it out) and lasts `max(wordDuration * --blyrics-highlight-glow-duration-ratio, --blyrics-highlight-glow-min-duration)`.
- **Words:** they wobble through `--blyrics-word-wobble-transform-*`, letters wave through `--blyrics-letter-wave-*`, and lines scale between `--blyrics-scale` and `--blyrics-active-scale`.
- **Rich-sync timing:** a swipe starts at `wordStart - blyrics-swipe-lead-ratio * wordDuration` and lasts `blyrics-swipe-duration-ratio * wordDuration`. Line-synced words fade in at their time.
- **Switches:** `--blyrics-animate-*` turns each effect off. `prefers-reduced-motion: reduce` turns the motion off.
- **Instrumental note:** drawn by the renderer in the lyric colours. `--blyrics-instrumental-fill-fade-duration` and `--blyrics-instrumental-wave-oscillation-duration` tune it.

### Keyframes

| Animation | Description |
|-----------|-------------|
| `blyrics-spin` | Loader rotation |
| `blyrics-shimmer` | Loading text shimmer |

## Unison Submitter Card and Floating Dock

Injected on the YouTube Music page when the Unison provider is active. Themeable through your custom CSS like the rest of this surface.

### New Variables

```css
:root {
  --blyrics-vote-hover-color: hsla(0, 0%, 100%, 0.2);
  --blyrics-small-border-radius: 1rem;
  --blyrics-fullscreen-bottom-dock-shift: -24px; /* Y-shift for bottom dock in fullscreen */
}
```

### Footer Card DOM

```
.blyrics-footer__unison
└── .blyrics-footer__container.blyrics-footer__unison-card
    ├── .blyrics-footer__unison-author (only when there is a submitter)
    │   ├── .blyrics-footer__unison-author-row
    │   │   ├── strong.blyrics-footer__author-name
    │   │   └── span.blyrics-footer__trust-tier [data-tier]
    │   └── .blyrics-footer__unison-author-label
    ├── .blyrics-footer__unison-divider (only when submitter is present)
    └── .blyrics-footer__unison-actions-block
        ├── .blyrics-footer__unison-actions
        │   ├── button.blyrics-footer__vote (upvote)
        │   ├── button.blyrics-footer__vote (downvote)
        │   └── button.blyrics-footer__vote (report)
        └── .blyrics-footer__unison-score-line
```

| Selector | Purpose |
|----------|---------|
| `.blyrics-footer__unison` | Outer wrapper, full-width inside footer |
| `.blyrics-footer__unison-card` | Translucent card, hover lighten, opens unison page on click |
| `.blyrics-footer__unison-divider` | 1px vertical separator between submitter and actions |
| `.blyrics-footer__unison-author` | Submitter column |
| `.blyrics-footer__unison-author-row` | Author name + tier pill row |
| `.blyrics-footer__author-name` | Submitter handle (deterministic pet name from public key) |
| `.blyrics-footer__unison-author-label` | "submitted this" subtext |
| `.blyrics-footer__unison-actions-block` | Right column with buttons + score line |
| `.blyrics-footer__unison-actions` | Row of three vote/report buttons |
| `.blyrics-footer__unison-score-line` | "+12 score · 12 votes" line |
| `.blyrics-footer__vote` | Base button (30px square in card, 32px in dock) |
| `.blyrics-footer__vote--active` | Active vote (SVG `fill-opacity` becomes 1) |
| `.blyrics-footer__trust-tier` | Tier pill, color via `[data-tier]` |

### Trust Tier Colors

| Selector | Color family |
|----------|--------------|
| `.blyrics-footer__trust-tier[data-tier="new"]` | Blue |
| `.blyrics-footer__trust-tier[data-tier="trusted"]` | Green |
| `.blyrics-footer__trust-tier[data-tier="veteran"]` | Purple |
| `.blyrics-footer__trust-tier[data-tier="expert"]` | Gold |

### Floating Dock

```
.blyrics-unison-dock [data-position]
└── .blyrics-unison-dock__inner
    └── .blyrics-footer__vote (×3)
```

Mounted inside `#side-panel`. `pointer-events: none` on the wrapper, `auto` on `__inner`.

| Position value | Anchor |
|----------------|--------|
| `top-left` | `top: 64px; left: 0` |
| `top-center` | `top: 64px; left: 50%` (translate -50%) |
| `top-right` | `top: 64px; left: 100%` (translate -100%) |
| `bottom-left` | `top: calc(100% - 64px); left: 0` |
| `bottom-center` | `top: calc(100% - 64px); left: 50%` |
| `bottom-right` | `top: calc(100% - 64px); left: 100%` |

| Modifier | When applied |
|----------|--------------|
| `.blyrics-unison-dock--hidden` | Footer card is in viewport (avoids duplicate controls) |
| `.blyrics-unison-dock--idle-hidden` | Player is idle in fullscreen |

Animates `transform`, `opacity`, `filter: blur(8px)` over 320ms.

### Layout Adjustments

```css
/* dock shifts down 72px when autoscroll resume button is visible */
#side-panel:has(.autoscroll-resume-button:not([autoscroll-hidden="true"])) .blyrics-unison-dock[data-position="top-center"] {
  --dock-y-shift: 72px;
}

/* hide dock when side panel shows non-lyrics content */
#side-panel:has(#tab-renderer:not([page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"])) .blyrics-unison-dock { ... }

/* in fullscreen: top-anchored dock hidden, bottom-anchored pinned above player bar */
#layout[player-fullscreened]:not([blyrics-dfs]) .blyrics-unison-dock[data-position^="top-"] { ... }
#layout[player-fullscreened]:not([blyrics-dfs]) .blyrics-unison-dock[data-position^="bottom-"] {
  --dock-y-shift: var(--blyrics-fullscreen-bottom-dock-shift, -24px);
}
```

Override `--blyrics-fullscreen-bottom-dock-shift` to tune the lift.

## Fullscreen Player Controls

Injected under the album art in fullscreen (audio) mode: song info, a seekable progress bar, transport, like/dislike, and a quick-actions trigger. The progress bar and the press animations are shared with the floating window. Hidden outside fullscreen, during ads, and while the fullscreen-controls setting is off.

### DOM Structure

```
#blyrics-fs-column                          (fullscreen only, width tracks the player element)
├── #blyrics-fs-info-row .blyrics-fs-info-row
│   ├── #blyrics-song-info
│   │   ├── p#blyrics-title
│   │   └── p#blyrics-artist
│   │       ├── a.blyrics-song-link          (one per artist, links to its channel)
│   │       └── span#blyrics-album
│   │           └── a.blyrics-song-link      (album, links to the album page)
│   └── .blyrics-fs-info-actions
│       ├── .blyrics-volume                          (volume pill)
│       └── button.blyrics-fs-disc.blyrics-fs-more   (quick-actions trigger)
└── #blyrics-fs-controls
    ├── .blyrics-progress                    (see Progress Bar)
    └── .blyrics-fs-transport-slot
        ├── button.blyrics-fs-disc.blyrics-fs-like
        ├── .blyrics-fs-transport-mid
        │   ├── button.blyrics-fs-disc       (previous)
        │   ├── button.blyrics-fs-disc.blyrics-fs-play
        │   └── button.blyrics-fs-disc       (next)
        └── button.blyrics-fs-disc.blyrics-fs-dislike
```

### Selectors

| Selector | Purpose |
|----------|---------|
| `#blyrics-fs-column` | Column under the album art holding the info row and the controls strip |
| `#blyrics-fs-info-row` / `.blyrics-fs-info-row` | Song info plus the quick-actions trigger |
| `#blyrics-song-info` | Title/artist/album block, also present outside fullscreen |
| `.blyrics-song-link` | Artist and album links inside the info block; `color: inherit`, underline on hover |
| `.blyrics-fs-info-actions` | Wrapper for the volume pill and the quick-actions trigger |
| `#blyrics-fs-controls` | Controls strip: progress bar above the transport row |
| `.blyrics-fs-disc` | Round control button base, shared by transport, rating, and more |
| `.blyrics-fs-more` | Quick-actions trigger |
| `.blyrics-fs-play` | Play/pause button, sized up from the rest |
| `.blyrics-fs-like` / `.blyrics-fs-dislike` | Rating buttons |
| `.blyrics-fs-transport-slot` / `.blyrics-fs-transport-mid` | Transport row layout |
| `.blyrics-fs-rate-icon` | Holds the two rating icon layers |
| `.blyrics-fs-rate-layer--outline` / `--fill` | Outline shows by default, fill shows when the rating is active |

### State Attributes

| Attribute | When applied |
|-----------|--------------|
| `.blyrics-fs-disc[data-active]` | Like or dislike is the current rating; the fill layer shows |
| `.blyrics-fs-disc[data-menu-open]` | The quick-actions menu is open; keeps the trigger's hover background |
| `#blyrics-fs-controls[data-ad]` | An ad is playing; the controls strip is hidden |
| `html[blyrics-no-fs-controls]` | Fullscreen-controls setting is off; hides `#blyrics-fs-controls` and `.blyrics-fs-info-actions` |
| `html[blyrics-fs-controls-pinned]` | Fullscreen-controls setting is On; the controls stay visible while the player bar shows |

### Progress Bar

Shared with the floating window, which scopes it under `.blyrics-pip-progress`.

| Selector | Purpose |
|----------|---------|
| `.blyrics-progress` | Wrapper; owns `--blyrics-progress-dot-shadow` |
| `.blyrics-progress__bar` | Seek track; carries `.dragging` while scrubbing |
| `.blyrics-progress__fill-clip` / `.blyrics-progress__fill` | Elapsed fill, scaled through `transform` |
| `.blyrics-progress__knob` / `.blyrics-progress__knob-dot` | Draggable handle |
| `.blyrics-progress__times` | Row holding the elapsed and end times |
| `.blyrics-progress__elapsed` | Elapsed time |
| `.blyrics-progress__end[data-mode]` | End time; `total` shows the duration, `remaining` shows the time left, click toggles |
| `.blyrics-volume[data-open][data-muted][data-level]` | Volume pill; `data-level` is `high`, `low` or `muted` |
| `.blyrics-volume__button` / `.blyrics-volume__icon` | Speaker button and its icon; parts `[data-part]`: `wave-low`, `wave-high`, `mute` |
| `.blyrics-volume__bar` / `__fill` / `__knob` | Volume slider |

Variables on `.blyrics-volume`: `--blyrics-volume-width`, `--blyrics-volume-rest-opacity`, `--blyrics-volume-knob-size`. Better Lyrics sets `--blyrics-volume-level` at runtime, so treat it as read only.

### Press Feedback and Like Burst

Applied briefly on interaction, shared by fullscreen and the floating window.

| Class / Keyframe | Purpose |
|------------------|---------|
| `.blyrics-control-pop` | Scale pop on press (`blyrics-fs-control-pop`, `blyrics-pip-control-pop`) |
| `.blyrics-control-nudge-prev` / `-next` | Previous and next icon nudge |
| `.blyrics-control-ripple-layer` / `.blyrics-control-ripple` (`--go`) | Click ripple |
| `.blyrics-fs-rate-fire` | Runs the like pop and iris (`blyrics-fs-rate-pop`, `blyrics-fs-rate-iris`) |
| `.blyrics-fs-rate-burst` / `-ray` / `-dot` (`--go`) | Rays and dots that fly out on a like (`blyrics-fs-rate-ray`, `blyrics-fs-rate-dot`) |

## Karaoke Subtitles

With the "Karaoke subtitles" option on (the default) and a music video in fullscreen, the video fills the screen and synced lines show over it one at a time on a blurred plate. The side panel and `#blyrics-fs-column` stay hidden the whole time karaoke owns the fullscreen video, even while lyrics load or when there are none or only unsynced ones. Lines keep the theme's look; the stage only decides where they go.

### DOM Structure

```
#blyrics-karaoke                                    (fixed overlay on body)
├── .blyrics-karaoke__stage
│   ├── .blyrics-karaoke__plate.blyrics-karaoke-surface    (two plates, swapped when the line moves far)
│   ├── .blyrics-karaoke__plate.blyrics-karaoke-surface
│   └── .blyrics-karaoke__mount
│       └── .blyrics-container[data-layout="stage"]
│           ├── .blyrics--line
│           └── .blyrics-credits                    (end card)
│               └── .blyrics-karaoke-source         (provider name and sync icon)
└── .blyrics-karaoke__title                         (intro title card)
    └── .blyrics-karaoke__card.blyrics-karaoke-surface
        ├── p.blyrics-karaoke__card-title
        ├── p.blyrics-karaoke__card-artist
        └── p.blyrics-karaoke__card-credit
```

### State Attributes

| Attribute | When applied |
|-----------|--------------|
| `ytmusic-app-layout[blyrics-karaoke]` / `#player-page[blyrics-karaoke]` | Karaoke owns the fullscreen video layout |
| `#blyrics-karaoke[data-bar]` | Player bar is showing; the stage lifts above it |
| `#blyrics-karaoke[data-title-card]` | Intro title card is showing; the stage is hidden |
| `#blyrics-karaoke[data-card]` | `title` or `end` while that card shows; absent for sung lines |
| `.blyrics-karaoke__plate[data-plate]` | Plate is shown behind the current line |
| `.blyrics-karaoke__plate[data-end-card]` | Plate is behind the end card (credits and source); kept while it fades out |
| `data-stage-role` on a line | `current`, `previous`, `queued` or `gone` |
| `data-stage-visible` on the credits | The credits are on screen |
| `.blyrics-container[data-stage-duet]` | Sung lines use both sides: `v1` left, `v2`/`v3` right, `v1000` centred. A one-singer song stays centred |

### Theme Hooks

| Hook | Notes |
|------|-------|
| `.blyrics-karaoke-surface` | Backdrop shared by both plates and the title card |
| `--blyrics-karaoke-video-scale` | Unitless, default `1`; e.g. `0.94` shrinks the video and overlay relative to the screen |
| `--blyrics-karaoke-plate-padding-block` / `-inline` | Defaults `0.18em` / `0.55em`; padding of the plate around a sung line. Any unit; `em` follows the lyric size |
| `--blyrics-karaoke-card-padding-block` / `-inline` | Defaults `0.36em` / `0.8em`; padding of the plate around the end card |
| `--blyrics-karaoke-plate-radius` | Default `0.46em`; corner radius of both plates and the title card. The line clip follows it |
| `--blyrics-font-size` | Sets the karaoke lyric size, as elsewhere |
| `--blyrics-scale` / `--blyrics-active-scale` | Forced to `1` on `#blyrics-karaoke .blyrics-container`; no line scaling in karaoke |
| `--blyrics-stage-opacity` | Set by the engine; stage line `opacity` reads it with `!important` |
| `ytmusic-player-page[video-mode][blyrics-karaoke] :is(#player, .html5-video-player)` | Background is `transparent !important`, so bars around a non-matching video show the theme or album art backdrop; set `#000 !important` to restore black |

Never set `opacity` on stage lines. It is overridden, so a theme cannot show a hidden line or hold a leaving one.

```css
:root {
  --blyrics-karaoke-video-scale: 0.94;
}

#blyrics-karaoke .blyrics-karaoke-surface {
  border-radius: 0.3em;
  background: rgb(0 0 0 / 70%);
  backdrop-filter: blur(12px);
}
```

## Floating Window Music Video

With "Show music video" on and YouTube Music in video mode, the floating window plays the video in the art slot. With karaoke subtitles also on and synced lyrics, it shows a full-window karaoke stage over the video instead. Ads are never mirrored: the artwork and lyrics fade out and a countdown intermission shows.

### DOM Structure

```
.blyrics-pip-shell                                  ([data-video], [data-layout], [data-instant])
├── .blyrics-pip-art-col
│   └── .blyrics-pip-artwork                        ([data-video-face])
│       ├── .blyrics-pip-artwork__card
│       │   └── .blyrics-pip-artwork__face           (front and back)
│       │       └── video.blyrics-pip-artwork__music-video
│       └── .blyrics-pip-artwork__controls
│           ├── .blyrics-pip-artwork__chrome
│           │   ├── .blyrics-pip-mode-toggle
│           │   │   └── button.blyrics-pip-mode-toggle__option   (song, video)
│           │   └── button.blyrics-pip-artwork__control.blyrics-pip-artwork__control--close
│           ├── button.blyrics-pip-artwork__control.blyrics-pip-artwork__control--like   ([data-active] when liked)
│           └── .blyrics-volume                     (same pill as fullscreen)
├── .blyrics-pip-stage
│   ├── video.blyrics-pip-stage__video
│   └── #blyrics-karaoke                            (same tree as fullscreen karaoke)
└── .blyrics-pip-intermission
    ├── .blyrics-pip-intermission__row
    │   ├── .blyrics-pip-intermission__mark
    │   └── p.blyrics-pip-intermission__label
    ├── .blyrics-pip-intermission__count
    │   └── .blyrics-pip-intermission__glyph        ([data-digit] on digits)
    ├── .blyrics-pip-intermission__bar
    │   └── .blyrics-pip-intermission__fill         (drains through transform: scaleX)
    └── .blyrics-pip-intermission__next
        ├── .blyrics-pip-intermission__thumb
        └── span                                    ("Then <b>song</b>")
```

### State Attributes

| Attribute | When applied |
|-----------|--------------|
| `.blyrics-pip-shell[data-video="on"]` | Video is playing in the window |
| `.blyrics-pip-shell[data-video="ad"]` | Ad is playing; intermission shows, art column and lyrics hidden |
| `.blyrics-pip-shell[data-video="off"]` | Option off, song mode, or no video track yet |
| `.blyrics-pip-shell[data-layout="stage"]` | Karaoke stage over the video: option on, video mode, karaoke on, synced lyrics |
| `.blyrics-pip-shell[data-stage-card]` | `title` or `end` while a karaoke card shows in the stage; `--blyrics-pip-card-height` (read-only) holds its height. The transport stays above the card and the header hides during the title card; at 340px wide or less (not tall windows) the mode pill hides too |
| `.blyrics-pip-shell[data-instant]` | Song/video switch in progress; transitions forced off until it settles |
| `.blyrics-pip-artwork[data-video-face]` | Visible artwork face holds the video |
| `.blyrics-pip-mode-toggle[hidden]` | Track has no song/video switch; also hidden in windows under 130px tall |
| `.blyrics-pip-mode-toggle__option[aria-pressed="true"]` | Current mode |
| `.blyrics-pip-intermission__count[hidden]`, `__bar[hidden]`, `__next[hidden]` | No ad time or next title to show |

### Theme Hooks

| Hook | Notes |
|------|-------|
| `--blyrics-pip-video-aspect` | Read-only. Video's `W / H`, set inline on `.blyrics-pip-shell`; unset until known, rules fall back to `16 / 9` |
| Plate variables in the window | The window sets them on `.blyrics-pip-shell[data-layout="stage"]`: radius `0.75rem`, line padding `0.5rem` / `0.75rem`, end card padding `0.5rem` / `1rem`. Override them there in `rem` or `px`; the window reads them there to keep the plate clear of the progress row and transport |
| `--blyrics-pip-karaoke-text-scale` | Read-only. Unitless, set inline on `.blyrics-pip-shell` on resize; stage `--blyrics-font-size` and `--blyrics-translated-font-size` are multiplied by it. The transport uses it too, so overriding moves text but not controls |
| `--blyrics-pip-control-tint` | Default `rgb(0 0 0 / 28%)`, on `.blyrics-pip-artwork__controls`; background of control discs and the mode pill |
| `--blyrics-pip-control-backdrop` | Default `blur(8px)`, on `.blyrics-pip-artwork__controls`; `backdrop-filter` of control discs and the mode pill |
| `--blyrics-pip-control-size` | Default `36px` (`44px` in tall windows), on `.blyrics-pip-artwork`; previous and next button size, play and pause is 1.25 times larger. Does not change with window size: the artwork grows so the pill, close button and transport fit inside it at its aspect ratio, and short windows hide the progress row. Normal layout only; the stage sizes its own transport |
| `#blyrics-karaoke` in the window | Same plate, title card, end card classes and attributes as fullscreen; prefix `.blyrics-pip-shell` to target the window only |

Internal, do not set: `--blyrics-pip-stage-width`, `-stage-height`, `-progress-inset`, `-progress-height`, `-plate-gap`, `-plate-overhang`, `-plate-top`, `-frame-bottom-gap`, `-header-bottom`, `-transport-margin`, `-transport-y`, `-karaoke-font-size`, `-karaoke-translated-font-size`. They derive from each other and place the transport between the header and the plate. Also internal, normal layout: `--blyrics-pip-artwork-aspect`, `-artwork-min-height`, `-artwork-min-width`, `-chrome-height`, `-transport-edge`; they size the artwork minimum.

Tall windows (`max-aspect-ratio: 4/5`) put the video at the top and the lines in the band under it, with no plate background.

```css
.blyrics-pip-shell #blyrics-karaoke .blyrics-karaoke-surface {
  background: rgb(0 0 0 / 55%);
}

.blyrics-pip-artwork__controls {
  --blyrics-pip-control-tint: rgb(255 255 255 / 12%);
}

.blyrics-pip-intermission__fill {
  background: var(--blyrics-lyric-active-color);
}
```

## Theme Patterns

### 1. Disable Default Animations

```css
:root {
  --blyrics-animate-line-scale: 0;
  --blyrics-animate-word-wobble: 0;
  --blyrics-animate-highlight-swipe: 0;
  --blyrics-animate-highlight-glow: 0;
  --blyrics-animate-scroll: 0;
  --blyrics-animate-instrumental: 0;
  --blyrics-scale: 1;
  --blyrics-active-scale: 1;
}
```

### 2. Dim Every Line but the Sung One

```css
.blyrics-container {
  --blyrics-line-opacity: 1 0.35;
  --blyrics-scale: 1;
}
```

### 3. Blur Lines by Distance

```css
.blyrics-container {
  --blyrics-line-opacity: 1 0.6 0.35 0.2;
  --blyrics-line-blur: 0 2px 4px 6px;
}
```

The effects ease off while the reader scrolls, and unsynced lyrics are left plain, so no `.blyrics-user-scrolling` or `[data-sync="none"]` rules are needed.

### 4. Effect Timing

```css
.blyrics-container {
  --blyrics-scale-transition-duration: 0.4s;
  --blyrics-lyric-highlight-fade-in-duration: 0.5s;
  --blyrics-lyric-highlight-fade-out-duration: 0.8s;
}
```

### 5. Custom Font Import

```css
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@200..800&display=swap');
.blyrics-container {
  font-family: 'Bricolage Grotesque', var(--noto-sans-universal), sans-serif;
}
```

### 6. Theme Variables

```css
:root {
  --my-theme-bg: #1a1a1a;
  --my-theme-text: #e0e0e0;
  --my-theme-accent: #d4a5a5;
}
```

### 7. Background Customization

```css
ytmusic-player-page:before {
  background: linear-gradient(to right, rgba(26,26,26,0.75), rgba(26,26,26,0.75)),
              var(--blyrics-background-img);
  filter: blur(50px) saturate(0.8);
}
```

### 8. Glassmorphism

```css
#side-panel {
  backdrop-filter: blur(20px) !important;
  background-color: rgba(0, 0, 0, 0.25) !important;
  box-shadow: 0 20px 60px rgba(0,0,0,0.4), 0 0 25px rgba(255,255,255,0.12) inset !important;
}
```

### 9. Animated Background

```css
ytmusic-player-page::before {
  filter: blur(70px) saturate(3) brightness(70%);
  animation: slowRotate 15s linear infinite;
}
@keyframes slowRotate {
  from { transform: scale(1.7) rotate(0deg); }
  to { transform: scale(1.7) rotate(360deg); }
}
```

### 10. Per-Voice Colours

```css
.blyrics--line[data-agent="v2"] {
  --blyrics-lyric-active-color: oklch(0.85 0.12 20);
  --blyrics-glow-color: oklch(0.85 0.12 20 / 0.6);
}
```

### 11. User Scroll State

`.blyrics-user-scrolling` is on the container while the reader scrolls, and the renderer already eases the distance effects off then. Use the class for things outside the lyrics, such as the resume button or the footer.

### 12. Modern Color Spaces

```css
:root {
  --blyrics-lyric-inactive-color: oklch(1 0 0 / 0.35);
  --blyrics-lyric-active-color: oklch(1 0 0 / 1);
}
```

### 13. Instrumental Customization

The renderer draws the note in the lyric colours: unfilled in `--blyrics-lyric-inactive-color`, filling with `--blyrics-lyric-active-color`. Scope those to `.blyrics--instrumental` to colour it differently. `--blyrics-animate-instrumental: 0` stops its motion.

```css
.blyrics--instrumental {
  --blyrics-lyric-inactive-color: rgba(255, 255, 255, 0.3);
  --blyrics-lyric-active-color: rgba(255, 255, 255, 1);
}
```

### 14. Long Word Glow

Target sustained notes for special effects:

```css
/* Set threshold in knobs */
/* blyrics-long-word-threshold = 1500; */

.blyrics-word-highlight[data-long-word] {
  --blyrics-glow-color: color(display-p3 1 0.8 0.3 / 1);
}
```

`--blyrics-glow-color` resolves per word, so different long words can glow different colors. Tune the halo with `--blyrics-highlight-glow-radius-from`; `--blyrics-highlight-glow-radius-to: 0` lets it fade out. `--blyrics-highlight-glow-filter-*` is not read.

### 15. Pause Behavior

The renderer holds every lyric effect while playback is paused. There is no `.blyrics--paused` class, and theme animations on lyric elements do not run in the first place.

### 16. Per-Letter Wave (Experimental)

On by default. Each letter of a word floats in turn as it is sung, on top of the word wobble. Disable it with `blyrics-letter-wave = false`, or tune it:

```css
.blyrics-container {
  --blyrics-letter-wave-transform: translateY(-0.05em); /* crest lift */
  --blyrics-letter-wave-settle: translateY(-0.02em); /* rest it eases back to */
  --blyrics-letter-wave-emphasis-scale: 1.11; /* long-word letter swell, 1 turns it off */
}
```

It layers on the word wobble rather than replacing it, so the default `scaleX` pop stays. To make the letters carry all the motion instead, set the word wobble to identity (`--blyrics-word-wobble-transform-*: translateY(0)`). It follows `--blyrics-animate-word-wobble`, so reduced motion turns it off.

### 17. Per-Word State (Karaoke)

Not available: the renderer sets no `[data-word-state]`, and styles on single words do not show. Each word goes from `--blyrics-lyric-inactive-color` to `--blyrics-lyric-active-color` as the swipe crosses it; `--blyrics-animate-highlight-swipe: 0` makes that switch instant instead of swept.

## Best Practices

1. **Use CSS variables** over raw values
2. **Use display-p3 or oklch** for wider color gamut
3. **Include `var(--noto-sans-universal)`** in font stacks for i18n
4. **Test both modes** - audio-only and video
5. **Test fullscreen** and responsive breakpoints (936px, 615px)
6. **Style lyrics through variables** - paint on lyric elements does not show; colours, sizes, timing and the distance lists are all variables
7. **Scope variables with structural selectors** such as `[data-agent]`, `.blyrics--translated`, `.blyrics-background-lyric` and `[data-long-word]`
8. **Respect RTL inline flow** - do not force `.blyrics-bidi-sensitive .blyrics-word-group` or `.blyrics-bidi-sensitive .blyrics--word` back to `inline-block`
9. **Say what is not possible** - if a design needs an effect the renderer has no variable for, tell the user and point them to the [Better Lyrics Discord](https://discord.gg/UsHE3d5fWF) rather than hacking around it

## Do NOT Modify

- `--noto-sans-universal` - International font fallback chain
- `--blyrics-gradient-stops` - Complex fullscreen gradient
- Core DOM structure expectations
- YouTube Music element selectors (unless intentional)

## Files Reference

| File | Purpose |
|------|---------|
| [`@braccato/core` styles](https://github.com/better-lyrics/braccato/tree/next/packages/core/src/styles) | Default lyric variables and layout |
| [`ytmusic.css`](https://github.com/better-lyrics/better-lyrics/blob/master/public/css/ytmusic.css) | YouTube Music layout modifications |
| [`themesong.css`](https://github.com/better-lyrics/better-lyrics/blob/master/public/css/themesong.css) | ThemeSong extension compatibility |
| [`disablestylizedanimations.css`](https://github.com/better-lyrics/better-lyrics/blob/master/public/css/disablestylizedanimations.css) | Disables animations when toggled |

## Existing Themes

Reference in [`public/css/themes/`](https://github.com/better-lyrics/better-lyrics/tree/master/public/css/themes):

| Theme | Style |
|-------|-------|
| `Default.css` | Minimal starting point |
| `Minimal.css` | Opacity-based, no animations |
| `Spotlight.css` | Blur effect on inactive lines |
| `Luxurious Glass.css` | Glassmorphism, animated background |
| `Dynamic Background.css` | Extensive YouTube Music UI customization |
| `Apple Music.css` | Apple Music-inspired styling |
| `Harmony Glow.css` | Glow effects |
| `Pastel.css` | Soft pastel colors |
