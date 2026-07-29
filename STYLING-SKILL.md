# Better Lyrics Theme Creation Guide for AI Agents

Essential reference for creating custom themes. For deep dives, see [STYLING.md](https://github.com/better-lyrics/better-lyrics/blob/master/STYLING.md).

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

```css
:root {
  --blyrics-font-family: Satoshi, var(--noto-sans-universal), sans-serif;
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
  --blyrics-line-enter-transform-from: scale(var(--blyrics-scale));
  --blyrics-line-enter-transform-to: scale(var(--blyrics-active-scale));
  --blyrics-line-exit-transform-from: scale(var(--blyrics-active-scale));
  --blyrics-line-exit-transform-to: scale(var(--blyrics-scale));
  --blyrics-line-enter-easing: ease;
  --blyrics-line-exit-easing: ease;
  --blyrics-lyric-highlight-fade-in-duration: 0.33s;
  --blyrics-lyric-highlight-fade-out-duration: 0.5s;
  --blyrics-lyric-highlight-fade-in-easing: ease;
  --blyrics-lyric-highlight-fade-out-easing: ease;
  --blyrics-highlight-swipe-easing: linear;
  --blyrics-highlight-swipe-start-from: -0.2;
  --blyrics-highlight-swipe-end-from: -0.1;
  --blyrics-highlight-swipe-start-to: 1.4;
  --blyrics-highlight-swipe-end-to: 1.5;
  --blyrics-highlight-glow-radius-from: 0.8rem;
  --blyrics-highlight-glow-radius-to: 0;
  --blyrics-highlight-glow-duration-ratio: 1.2;
  --blyrics-highlight-glow-min-duration: 1.2s;
  --blyrics-highlight-glow-easing: ease;
  --blyrics-wobble-duration: 1s;
  --blyrics-word-wobble-transform-from: scaleX(1);
  --blyrics-word-wobble-transform-peak: translateX(0.05em) scaleX(1.025);
  --blyrics-word-wobble-transform-settle: translateX(0) scaleX(1);
  --blyrics-word-wobble-transform-to: scaleX(1);
  --blyrics-word-wobble-peak-offset: 0.125;
  --blyrics-word-wobble-settle-offset: 0.75;
  --blyrics-word-wobble-easing: ease;
  --blyrics-word-wobble-peak-easing: ease-in-out;
  --blyrics-word-wobble-end-easing: ease-out;
  --blyrics-instrumental-fill-fade-duration: 150ms;
  --blyrics-instrumental-fill-fade-easing: ease;
  --blyrics-instrumental-fill-transform-from: translateY(78%);
  --blyrics-instrumental-fill-transform-to: translateY(-4%);
  --blyrics-instrumental-fill-easing: linear;
  --blyrics-instrumental-wave-transform-from: scaleY(1.2);
  --blyrics-instrumental-wave-transform-to: scaleY(0.0001);
  --blyrics-instrumental-wave-easing: ease-in;
  --blyrics-instrumental-wave-oscillation-duration: 1.25s;
  --blyrics-instrumental-wave-oscillation-easing: ease-in-out;
  --blyrics-timing-offset: 0.115s;
  --blyrics-richsync-timing-offset: 0.150s;
  --blyrics-scroll-timing-offset: 0.5s;
  --blyrics-lyric-scroll-duration: 650ms;
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
}
```

### Effects

```css
:root {
  --blyrics-scale: 0.95;
  --blyrics-active-scale: 1;
  --blyrics-blur-amount: 30px;
  --blyrics-background-blur: 100px;
  --blyrics-background-saturate: 2;
}
```

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

## Configuration Knobs

Comment-based parameters that control JS behavior. Place anywhere in your theme:

```css
/*
blyrics-disable-richsync = true;
blyrics-line-synced-animation-delay = 50;
blyrics-target-scroll-pos-ratio = 0.37;
blyrics-swipe-lead-ratio = 0.1;
blyrics-swipe-duration-ratio = 1.6;
blyrics-line-scroll-duration = 750ms;
blyrics-line-scroll-below-duration = calc(750ms + log(var(--blyrics-line-scroll-abs-relative-index) + 1, 2.71828) * 80ms + var(--blyrics-line-scroll-abs-relative-index) * 20ms);
blyrics-line-scroll-above-duration = calc(750ms + log(var(--blyrics-line-scroll-abs-relative-index) + 1) * 10ms);
*/
```

| Knob | Default | Description |
|------|---------|-------------|
| `blyrics-disable-richsync` | `false` | Render richsynced lyrics through the line-synced path instead, including line-synced fade-in |
| `blyrics-line-synced-animation-delay` | `50` | Per-word delay for synced lyrics (ms) |
| `blyrics-lyric-ending-threshold-s` | `0.5` | Seconds before line ends to consider it complete |
| `blyrics-early-scroll-consider-s` | auto (`~0.54` default) | Future lookahead for scroll grouping (s) |
| `blyrics-queue-scroll-ms` | auto (`~131` default, capped at `200`) | Max queued scroll delay (ms) |
| `blyrics-debug-renderer` | `false` | Enable debug overlay |
| `blyrics-debug-animation-timing` | `false` | Log WAAPI lyric animation timing samples, learned offsets, and timing cleanup events |
| `blyrics-target-scroll-pos-ratio` | `0.37` | Lyric position (0=top, 0.5=center, 1=bottom) |
| `blyrics-swipe-lead-ratio` | `0.1` | Rich-sync swipe lead as a fraction of word duration |
| `blyrics-swipe-duration-ratio` | `1.6` | Rich-sync swipe duration as a multiple of word duration |
| `blyrics-long-word-threshold` | `1500` | Duration (ms) above which `data-long-word` is set |
| `blyrics-hide-instrumental-only` | `false` | Treat "[Instrumental Only]" as no lyrics (enables fullscreen effect) |
| `blyrics-passive-scroll-enabled` | `true` | Unsynced auto-scroll: enable/disable entirely (overrides user setting) |
| `blyrics-passive-scroll-seconds-per-line` | `3.5` | Unsynced auto-scroll: seconds per line (scroll speed) |
| `blyrics-passive-scroll-bottom-pause-s` | `1.5` | Unsynced auto-scroll: pause at bottom (s) |
| `blyrics-passive-scroll-reset-duration-s` | `0.6` | Unsynced auto-scroll: scroll-back-to-top duration (s) |
| `blyrics-passive-scroll-top-pause-s` | `0.8` | Unsynced auto-scroll: pause at top (s) |
| `blyrics-line-scroll-duration` | `750ms` | Per-line scroll animation duration |
| `blyrics-line-scroll-{above,active,below}-duration` | side-specific tail defaults | Side-specific scroll duration; `above`/`below` swap on upward scrolls. Defaults use uncapped relative-index formulas so farther trailing lines settle progressively later. |
| `blyrics-line-scroll-timing-function` | `var(--blyrics-lyric-scroll-timing-function)` | Shared line-scroll easing |
| `blyrics-line-scroll-{start,end}-easing` | timing / `linear` | Keyframe easing |
| `blyrics-line-scroll-{above,active,below}-{start,end}-easing` | shared keyframe easing | Side-specific keyframe easing; `above`/`below` swap on upward scrolls |
| `blyrics-line-scroll-translate-y-{start,end}` | delta / `0px` | Shared Y offsets |
| `blyrics-line-scroll-{above,active,below}-translate-y-{start,end}` | shared offset | Side-specific Y offsets; `above`/`below` swap on upward scrolls |

**Scroll timing**: if `blyrics-early-scroll-consider-s` and `blyrics-queue-scroll-ms` are not manually set, they are derived from `--blyrics-lyric-scroll-duration` using the default timing ratio. If one is manually set, the other is derived from the scroll equation; auto-derived queueing is capped at `200ms`. If both are manually set, keep this balanced: `--blyrics-lyric-scroll-duration` + 0.02s = `blyrics-early-scroll-consider-s` + `blyrics-queue-scroll-ms`.

## Dynamic Properties

Properties set by JS at runtime on individual elements:

| Property | Set On | Description |
|----------|--------|-------------|
| `--blyrics-duration` | `.blyrics--word`, `.blyrics--instrumental` | Duration of current element (ms) |
| `--blyrics-line-scroll-relative-index` | visible animated lyric lines | Active line is `0`, below lines are positive, above lines are negative |
| `--blyrics-line-scroll-abs-relative-index` | visible animated lyric lines | Absolute relative index |
| `--blyrics-line-scroll-side` | visible animated lyric lines | Direction-aware side: `above`, `active`, or `below`; `above`/`below` swap on upward scrolls |
| `--blyrics-line-scroll-delta-px` | visible animated lyric lines | Signed scroll delta |
| `--blyrics-line-scroll-distance-px` | visible animated lyric lines | Absolute scroll distance |
| `--blyrics-padding-top` | `:root` | Calculated top spacer for scroll positioning |
| `--blyrics-padding-bottom` | `:root` | Calculated bottom spacer for scroll positioning |

Lyric timing is driven by `element.animate()`.

## DOM Structure

```
.blyrics-container [data-sync] [data-loader-visible] [data-no-lyrics]
├── .blyrics--line (div) [data-agent] [data-time] [data-duration] [data-line-number]
│   ├── .blyrics-line-main (div)
│   │   └── .blyrics-bidi-run (span)
│   │       └── .blyrics-word-group (span)
│   │           └── .blyrics--word (span) [data-content] [data-time] [data-duration] [data-long-word]
│   │               └── .blyrics-word-highlight (span, only for long wrapped words)
│   ├── .blyrics-background-line (div, only when primary background vocals are present)
│   │   └── .blyrics-bidi-run (span)
│   │       └── .blyrics-word-group.blyrics-background-lyric
│   ├── .blyrics--romanized.blyrics-content-line
│   └── .blyrics--translated.blyrics-content-line
├── .blyrics--instrumental.blyrics--line [data-instrumental="true"]
│   └── .blyrics--instrumental-icon (svg)
│       ├── .blyrics--instrumental-bg (path)
│       ├── .blyrics--instrumental-fill (path)
│       └── .blyrics--wave-clip/.blyrics--wave-rect/.blyrics--wave-path
└── .blyrics-footer
```

### Container Data Attributes

| Attribute | Values | Description |
|-----------|--------|-------------|
| `data-sync` | `"richsync"`, `"synced"`, `"none"` | Sync type |
| `data-loader-visible` | `"true"`, `"false"`, or absent | Loader visibility |
| `data-no-lyrics` | `"true"` or absent | No lyrics available |

### Word Data Attributes

| Attribute | Description |
|-----------|-------------|
| `data-content` | Word text (used by generated highlight overlay when no real overlay is needed) |
| `data-time` | Start time in seconds |
| `data-duration` | Duration in seconds |
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
| `.blyrics-bidi-sensitive` | Applied to rows containing RTL script; makes word wrappers inline-flow for correct bidi wrapping |
| `.blyrics-word-group` | Word/syllable group; `inline-block` for LTR-only rows and `display: contents` inside `.blyrics-bidi-sensitive` |
| `.blyrics--word` | Word span |
| `.blyrics-word-highlight` | Real highlight overlay for long wrapped words |
| `.blyrics-line-synced-word` | Zero-duration line-synced word; fades in without rich-sync swipe |
| `.blyrics--active` | Line is selected for scrolling. Runs on the **scroll clock**, which leads audio by `--blyrics-scroll-timing-offset` (0.5s default) |
| `.blyrics--animating` | Line's animations are live. Runs on the **audio clock**, so it survives until the line's last word actually finishes |
| `.blyrics--paused` | Playback is paused; on the line and on each word. Use it to freeze theme-authored CSS animations |
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

## Animation System

Karaoke effect uses `::after` with `background-clip: text`; long wrapped words use `.blyrics-word-highlight` instead so the highlight can wrap at inserted `<wbr>` points:

```css
.blyrics--word::after,
.blyrics-word-highlight {
  content: attr(data-content);
  color: transparent;
  background-image: linear-gradient(90deg, var(--blyrics-lyric-active-color) ..., transparent ...);
  background-clip: text;
}
```

Timing uses the Web Animations API:

- Rich-sync swipe starts at `wordStart - blyrics-swipe-lead-ratio * wordDuration`
- Rich-sync swipe duration is `blyrics-swipe-duration-ratio * wordDuration`
- Rich-sync word-timed highlights become visible instantly at `wordStart`; they do not use the highlight fade-in duration
- Line-synced `.blyrics-line-synced-word` skips swipe and fades in at word time
- `--blyrics-animate-highlight-swipe: 0` keeps rich-sync timing but makes each word fully highlighted instantly instead of fading like line-synced lyrics
- Glow lasts `max(wordDuration * --blyrics-highlight-glow-duration-ratio, --blyrics-highlight-glow-min-duration)`
- Lyric line scale and scroll smoothing also use `element.animate()`
- Scroll smoothing uses per-line `translate`, not container `transform`; JS automatically animates lines visible in the previous or current viewport and provides relative index, absolute relative index, signed scroll delta, and absolute scroll distance as CSS variables
- Visible lyric lines receive inline `will-change: transform, translate` before scroll animations start
- Per-line scroll effects can overlap with additive Web Animations (`composite: "add"`); custom line durations are visual only, and the next autoscroll is gated by `--blyrics-lyric-scroll-duration`
- Visual keyframe values, effect enable flags, durations, and easing are CSS variables; JS still owns scheduling, pause/resume, seeking, and cancellation
- `prefers-reduced-motion: reduce` keeps smooth scroll enabled but disables side-specific line-scroll differential effects

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

### 2. Opacity-Based Active State

```css
.blyrics-container > div {
  opacity: 0.35;
  transform: none !important;
  transition: opacity 0.4s ease-out !important;
}
.blyrics-container > div.blyrics--active {
  opacity: 1;
}
```

### 3. Blur Inactive Lines

```css
.blyrics-container > div {
  opacity: 0.2;
  filter: blur(6px);
  transition: opacity 0.7s, filter 0.7s, transform 1.66s;
}
.blyrics-container > div.blyrics--active:not(:empty) {
  opacity: 1;
  filter: blur(0px);
}
.blyrics-user-scrolling > div {
  opacity: 1 !important;
  filter: blur(0px) !important;
}
.blyrics-container[data-sync="none"] > div {
  opacity: 1;
  filter: none;
}
```

### 4. Duration-Based Timing

```css
.blyrics-container > div {
  transition: filter calc(var(--blyrics-duration) / 2),
              opacity calc(var(--blyrics-duration) / 2);
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

### 10. Underline Active Line

```css
.blyrics-container > div::after {
  content: '';
  position: absolute;
  left: 50%; bottom: 10px;
  height: 2px; width: 50%;
  transform: translateX(-50%) scaleX(0);
  background: linear-gradient(90deg, transparent, hsla(0,0%,100%,0.4), transparent);
  transition: transform 0.5s cubic-bezier(0.86, 0, 0.07, 1);
}
.blyrics-container > div.blyrics--active::after {
  transform: translateX(-50%) scaleX(1);
}
```

### 11. User Scroll State

```css
.blyrics-user-scrolling > div {
  opacity: 1 !important;
  filter: blur(0px) !important;
}
.blyrics-container:not(:has(.blyrics--active)) > div {
  opacity: 1;
  filter: none;
}
```

### 12. Modern Color Spaces

```css
:root {
  --blyrics-lyric-inactive-color: oklch(1 0 0 / 0.35);
  --blyrics-lyric-active-color: oklch(1 0 0 / 1);
}
```

### 13. Instrumental Customization

```css
.blyrics--instrumental-icon {
  width: 4rem;
  height: 4rem;
}
.blyrics--instrumental-bg {
  fill: rgba(255, 255, 255, 0.3);
}
.blyrics--instrumental-fill {
  fill: rgba(255, 255, 255, 1);
}
```

### 14. Long Word Glow

Target sustained notes for special effects:

```css
/* Set threshold in knobs */
/* blyrics-long-word-threshold = 1500; */

.blyrics--word[data-long-word]::after,
.blyrics--word[data-long-word] > .blyrics-word-highlight {
  --blyrics-glow-color: color(display-p3 1 0.8 0.3 / 1);
}
```

`--blyrics-glow-color` resolves per word, so different long words can glow different colors. Tune the blur with `--blyrics-highlight-glow-radius-from` / `--blyrics-highlight-glow-radius-to` while keeping per-word color. Overriding the full `--blyrics-highlight-glow-filter-from` / `--blyrics-highlight-glow-filter-to` instead resolves the color once at the container, so every word shares one glow color.

### 15. Pause Behavior

Playback pause is handled by pausing the active Web Animations API animations in JavaScript. The engine also puts `.blyrics--paused` on the line and on each of its words, so theme-authored CSS animations and transitions can freeze in step:

```css
.blyrics--paused .my-shimmer {
  animation-play-state: paused;
}
```

## Best Practices

1. **Use CSS variables** over raw values
2. **Use display-p3 or oklch** for wider color gamut
3. **Include `var(--noto-sans-universal)`** in font stacks for i18n
4. **Test both modes** - audio-only and video
5. **Test fullscreen** and responsive breakpoints (936px, 615px)
6. **Handle `data-sync="none"`** - smooth transition when sync loads
7. **Exclude translation/romanization** - `:not(.blyrics--translated):not(.blyrics--romanized)`
8. **Handle user scroll** - `.blyrics-user-scrolling`
9. **Prefer structural selectors** such as `.blyrics-line-main`, `.blyrics-word-group`, and data attributes; use `.blyrics--active` only for current-line affordances
10. **Pick the right clock** - `.blyrics--active` for anything tied to scrolling, `.blyrics--animating` for anything that must hold while a line is still being sung. Dimming past lines off `.blyrics--active` alone will dim them roughly half a second early
11. **Respect RTL inline flow** - do not force `.blyrics-bidi-sensitive .blyrics-word-group` or `.blyrics-bidi-sensitive .blyrics--word` back to `inline-block`; word wobble transforms should be treated as unavailable on RTL-sensitive rows

## Do NOT Modify

- `--noto-sans-universal` - International font fallback chain
- `--blyrics-gradient-stops` - Complex fullscreen gradient
- Core animation variables such as `--lyric-transition-amount-start` and `--lyric-transition-amount-end` unless you are replacing the karaoke highlight effect
- Core DOM structure expectations
- YouTube Music element selectors (unless intentional)

## Files Reference

| File | Purpose |
|------|---------|
| [`lyrics.css`](https://github.com/better-lyrics/better-lyrics/blob/master/public/css/blyrics/lyrics.css) | Core lyrics styling and animations |
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
