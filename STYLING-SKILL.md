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
  --blyrics-scale-transition-duration: 0.166s;
  --blyrics-lyric-highlight-fade-in-duration: 0.33s;
  --blyrics-lyric-highlight-fade-out-duration: 0.5s;
  --blyrics-wobble-duration: 1s;
  --blyrics-timing-offset: 0.115s;
  --blyrics-richsync-timing-offset: 0.150s;
  --blyrics-scroll-timing-offset: 0.5s;
  --blyrics-lyric-scroll-duration: 750ms;
  --blyrics-lyric-scroll-timing-function: cubic-bezier(0.86, 0, 0.07, 1);
}
```

### Layout

```css
:root {
  --blyrics-padding: 2rem;
  --blyrics-margin: 2rem;
  --blyrics-border-radius: 1000rem;
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
*/
```

| Knob | Default | Description |
|------|---------|-------------|
| `blyrics-disable-richsync` | `false` | Disable word-level animation |
| `blyrics-line-synced-animation-delay` | `50` | Per-word delay for synced lyrics (ms) |
| `blyrics-lyric-ending-threshold-s` | `0.5` | Seconds before line ends to consider it complete |
| `blyrics-early-scroll-consider-s` | `0.62` | Future lookahead for scroll grouping (s) |
| `blyrics-queue-scroll-ms` | `150` | Max queued scroll delay (ms) |
| `blyrics-debug-renderer` | `false` | Enable debug overlay |
| `blyrics-target-scroll-pos-ratio` | `0.37` | Lyric position (0=top, 0.5=center, 1=bottom) |
| `blyrics-add-extra-top-padding` | `false` | Extra top padding for always-scrollable lyrics |
| `blyrics-long-word-threshold` | `1500` | Duration (ms) above which `data-long-word` is set |

**Scroll equation**: `--blyrics-lyric-scroll-duration` + 0.02s = `blyrics-early-scroll-consider-s` + `blyrics-queue-scroll-ms`

## Dynamic Properties

Properties set by JS at runtime on individual elements:

| Property | Set On | Description |
|----------|--------|-------------|
| `--blyrics-duration` | `.blyrics--word`, `.blyrics--instrumental` | Duration of current element (ms) |
| `--blyrics-anim-delay` | `.blyrics--word`, `.blyrics--line` | Delay until animation starts |
| `--blyrics-swipe-delay` | `.blyrics--word::after` | Swipe transition delay (anim-delay - 10% of duration) |

## DOM Structure

```
.blyrics-container [data-sync] [data-loader-visible] [data-no-lyrics]
├── .blyrics--line (div) [data-agent] [data-time] [data-duration] [data-line-number]
│   ├── span
│   │   └── .blyrics--word (span) [data-content] [data-time] [data-duration] [data-long-word]
│   ├── .blyrics--break (span) - line break
│   └── .blyrics-background-lyric (span) - background vocals
├── .blyrics--line.blyrics--animating (active line)
│   └── .blyrics--word.blyrics--animating (animating word)
│       └── .blyrics--word.blyrics--paused (paused state)
├── .blyrics--instrumental.blyrics--line [data-instrumental="true"]
│   └── .blyrics--instrumental-icon (svg)
│       ├── .blyrics--instrumental-bg (path)
│       ├── .blyrics--instrumental-fill (path)
│       └── .blyrics--wave-clip/.blyrics--wave-path
├── .blyrics--translated (span)
├── .blyrics--romanized (span)
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
| `data-content` | Word text (used by `::after` for karaoke) |
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
| `.blyrics--word` | Word span |
| `.blyrics--animating` | Currently active/animating (USE THIS for styling) |
| `.blyrics--pre-animating` | About to animate |
| `.blyrics--active` | Currently highlighted (use in `:has()` only) |
| `.blyrics--paused` | Playback paused |
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

Karaoke effect uses `::after` with `background-clip: text`:

```css
.blyrics--word::after {
  content: attr(data-content);
  color: transparent;
  background-image: linear-gradient(90deg, var(--blyrics-lyric-active-color) ..., transparent ...);
  background-clip: text;
}
```

### Keyframes

| Animation | Description |
|-----------|-------------|
| `blyrics-wobble` | Word bounce effect (scaleX 1 -> 1.025 -> 1) |
| `blyrics-glow` | Drop-shadow fade (0.8rem -> 0) |
| `blyrics-spin` | Loader rotation |
| `blyrics-shimmer` | Loading text shimmer |
| `blyrics-wave` | Instrumental wave oscillation |

## Theme Patterns

### 1. Disable Default Animations

```css
@keyframes blyrics-wobble { 0%, to { transform: none; } }
@keyframes blyrics-glow { 0%, to { filter: none; } }
.blyrics--word::after {
  animation: none !important;
  content: none !important;
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
.blyrics-container > div.blyrics--animating:not(:empty):not(.blyrics--translated):not(.blyrics--romanized) {
  opacity: 1;
  filter: blur(0px);
}
.blyrics-user-scrolling > div:not(.blyrics--animating) {
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
.blyrics-user-scrolling > div:not(.blyrics--animating) {
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

.blyrics--word[data-long-word]::after {
  --blyrics-glow-color: color(display-p3 1 0.8 0.3 / 1);
  animation-duration: calc(var(--blyrics-duration) * 2) !important;
}
```

### 15. Paused State Handling

```css
.blyrics--word.blyrics--paused {
  animation-play-state: paused;
}
.blyrics--word.blyrics--paused::after {
  transition-duration: 100000000s; /* Freeze transition */
  opacity: 0.5;
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
9. **Use `.blyrics--animating`** for styling, `.blyrics--active` in `:has()` only

## Do NOT Modify

- `--noto-sans-universal` - International font fallback chain
- `--blyrics-gradient-stops` - Complex fullscreen gradient
- `.blyrics--active` for styling - use `.blyrics--animating` instead (`.blyrics--active` only in `:has()` checks)
- Core DOM structure expectations
- YouTube Music element selectors (unless intentional)

## Files Reference

| File | Purpose |
|------|---------|
| [`blyrics.css`](https://github.com/better-lyrics/better-lyrics/blob/master/public/css/blyrics.css) | Core lyrics styling and animations |
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
