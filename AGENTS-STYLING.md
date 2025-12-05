# Better Lyrics Theme Creation Guide for AI Agents

This document provides essential information for AI agents creating custom themes for Better Lyrics.

## Quick Reference: Key CSS Variables

Override these variables in custom CSS to create themes:

### Colors (Most Important)

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
  --blyrics-font-family: Satoshi, sans-serif;
  --blyrics-font-size: 3rem;
  --blyrics-font-weight: 700;
  --blyrics-line-height: 1.333;
  --blyrics-translated-font-size: 2rem;
  --blyrics-translated-font-weight: 600;
}
```

### Animation Timing

```css
:root {
  --blyrics-scale-transition-duration: 0.166s;
  --blyrics-lyric-highlight-fade-in-duration: 0.33s;
  --blyrics-lyric-highlight-fade-out-duration: 0.5s;
  --blyrics-wobble-duration: 1s;
  --blyrics-timing-offset: 0.115s;
  --blyrics-richsync-timing-offset: 0.02s;
  --blyrics-scroll-timing-offset: 0.5s;
  --blyrics-lyric-scroll-duration: 750ms;
  --blyrics-lyric-scroll-timing-function: cubic-bezier(0.86, 0, 0.07, 1);
}
```

### Scale & Effects

```css
:root {
  --blyrics-scale: 0.95;
  --blyrics-active-scale: 1;
  --blyrics-blur-amount: 30px;
  --blyrics-background-blur: 100px;
  --blyrics-background-saturate: 2;
}
```

### Layout

```css
:root {
  --blyrics-padding: 2rem;
  --blyrics-margin: 2rem;
  --blyrics-border-radius: 1000rem;
  --blyrics-panel-size: 50%;
  --blyrics-video-panel-size: 30%;
  --blyrics-fullscreen-panel-size: 66%;
  --blyrics-fullscreen-video-panel-size: 25%;
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

## DOM Structure

```
.blyrics-container [data-sync="richsync|synced|none"] [data-loader-visible="true|false"]
├── .blyrics--line (div) [data-agent="v1|v2|v3"]
│   ├── span
│   │   └── .blyrics--word (span) [data-content="word"]
│   │   └── .blyrics--word (span)
│   ├── .blyrics--break (span) - line break
│   └── .blyrics-background-lyric (span) - background vocals
├── .blyrics--line.blyrics--animating (active line)
│   └── .blyrics--word.blyrics--animating (animating word)
├── .blyrics--translated (span) - translation
├── .blyrics--romanized (span) - romanization
└── .blyrics-footer
```

### Container Data Attributes

| Attribute             | Values                             | Description                                                |
| --------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `data-sync`           | `"richsync"`, `"synced"`, `"none"` | Synchronization type of current lyrics                     |
| `data-loader-visible` | `"true"`, `"false"`                | Whether the loading spinner is visible                     |

## Important Classes & Selectors

| Selector                  | Purpose                                                                     |
| ------------------------- | --------------------------------------------------------------------------- |
| `.blyrics-container`      | Main lyrics wrapper                                                         |
| `.blyrics--line`          | Each lyric line                                                             |
| `.blyrics--word`          | Each word in a line                                                         |
| `.blyrics--animating`     | Currently active/animating element (USE THIS for styling)                   |
| `.blyrics--pre-animating` | Element about to animate                                                    |
| `.blyrics--active`        | Currently highlighted lyric (AVOID for styling - use `.blyrics--animating`) |
| `.blyrics-rtl`            | RTL language support                                                        |
| `.blyrics--translated`    | Translated text                                                             |
| `.blyrics--romanized`     | Romanized text                                                              |
| `.blyrics--error`         | Error message                                                               |
| `[data-agent="v2"]`       | Secondary voice (right-aligned)                                             |
| `[data-agent="v3"]`       | Tertiary voice (right-aligned)                                              |
| `[data-agent="v1000"]`    | Both speakers simultaneously (duet/chorus, centered)                        |

## Animation System

The karaoke effect uses `::after` pseudo-elements with `background-clip: text`:

```css
.blyrics--word::after {
  content: attr(data-content);
  color: transparent;
  background-image: linear-gradient(90deg, var(--blyrics-lyric-active-color) ..., transparent ...);
  background-clip: text;
}
```

Key animation custom properties set by JS:
- `--blyrics-duration` - Duration of current word
- `--blyrics-anim-delay` - Animation delay for word
- `--blyrics-swipe-delay` - Swipe transition delay

## Theme Patterns (from existing themes)

### Pattern 1: Disable Default Animations (Minimal.css)

```css
@keyframes blyrics-wobble {
  0%, to { transform: none; }
}
@keyframes blyrics-glow {
  0%, to { filter: none; }
}
.blyrics-container > div > span:after {
  animation: none !important;
  content: none !important;
  display: none !important;
}
.blyrics-container > div > span.blyrics--animating {
  animation: none !important;
}
```

### Pattern 2: Opacity-Based Active State (Minimal.css)

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

### Pattern 3: Blur Effect for Inactive Lines

Use `.blyrics--animating` for styling active lines, but `.blyrics--active` in `:has()` checks:

```css
.blyrics-container > div {
  opacity: 0.2;
  filter: blur(6px);
  transition: opacity 0.7s ease-out,
    filter 0.7s ease-out,
    transform 1.66s ease-out;
}

.blyrics-container > div.blyrics--animating:not(:empty):not(.blyrics--translated):not(.blyrics--romanized) {
  opacity: 1;
  filter: blur(0px);
  transition: opacity 0.7s ease calc(var(--blyrics-anim-delay) - 0.3s),
    filter 0.7s ease calc(var(--blyrics-anim-delay) - 0.3s),
    transform 1.666s ease calc(var(--blyrics-anim-delay) - 0.3s);
}

.blyrics-user-scrolling > div:not(.blyrics--animating) {
  opacity: 1 !important;
  filter: blur(0px) !important;
  transition: opacity 0.4s ease, filter 0.4s ease, transform 0.5s ease calc(var(--blyrics-anim-delay, 0s) - 0.1s);
}

.blyrics-container[data-sync="none"] > div {
  opacity: 1;
  filter: none;
}
```

Note: Be sure to consider styling when there is no timing information. 
Also keep in mind that lyrics without timing information are shown while lyrics are loading. 
Make sure the state transition from `data-sync="none"` ->  `data-sync="synced"` /  `data-sync="richsynced"` is smooth.

### Pattern 4: Use Duration Variable for Timing

```css
.blyrics-container > div {
  transition: filter calc(var(--blyrics-duration) / 2),
    opacity calc(var(--blyrics-duration) / 2);
}
```

### Pattern 5: Custom Font Import

```css
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&display=swap');

.blyrics-container {
  font-family: 'Bricolage Grotesque', var(--noto-sans-universal), sans-serif;
}
```

### Pattern 6: Theme-Specific Variables

```css
:root {
  --my-theme-bg-color: #1a1a1a;
  --my-theme-text-color: #e0e0e0;
  --my-theme-highlight-color: #d4a5a5;
  --my-theme-border-color: #d4a5a52a;
}
```

### Pattern 7: Background Customization

```css
ytmusic-player-page:before {
  background: linear-gradient(to right, rgba(26, 26, 26, 0.75), rgba(26, 26, 26, 0.75)),
    var(--blyrics-background-img);
  filter: blur(50px) saturate(0.8);
}
```

### Pattern 8: Glassmorphism Effect

```css
:root {
  --blyrics-bg-color: rgba(0, 0, 0, 0.25);
  --blyrics-box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4), 0 0 25px rgba(255, 255, 255, 0.12) inset;
  --blyrics-blur-amount: 20px;
}
#side-panel {
  backdrop-filter: blur(var(--blyrics-blur-amount)) !important;
  background-color: var(--blyrics-bg-color) !important;
  box-shadow: var(--blyrics-box-shadow) !important;
}
```

### Pattern 9: Animated Background

```css
ytmusic-player-page::before {
  filter: blur(70px) saturate(3) brightness(70%);
  transform: scale(1.3);
  animation: slowRotate 15s linear infinite, scalePulse 8s ease-in-out infinite;
  animation-composition: add;
}
@keyframes slowRotate {
  from { transform: scale(1.7) rotate(0deg); }
  to { transform: scale(1.7) rotate(360deg); }
}
```

### Pattern 10: Underline Active Line

```css
.blyrics-container > div::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 10px;
  height: 2px;
  width: 50%;
  transform: translateX(-50%) scaleX(0);
  background: linear-gradient(90deg, transparent, hsla(0, 0%, 100%, 0.4), transparent);
  transition: transform 0.5s cubic-bezier(0.86, 0, 0.07, 1);
}
.blyrics-container > div.blyrics--active::after {
  transform: translateX(-50%) scaleX(1);
}
```

### Pattern 11: User Scroll State Handling

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

### Pattern 12: Modern Color Spaces

```css
:root {
  --blyrics-lyric-inactive-color: oklch(1 0 0/0.35);
  --blyrics-lyric-active-color: oklch(1 0 0/1);
}
```

## Best Practices

1. **Use CSS variables** - Override variables rather than raw values for consistency
2. **Use display-p3 or oklch colors** - Better color gamut on supported displays
3. **Always include `var(--noto-sans-universal)` in font stacks** - Ensures international language support
4. **Test both modes** - Check audio-only and video mode layouts
5. **Test fullscreen** - Verify appearance in fullscreen mode
6. **Consider RTL** - Test with RTL languages if modifying layout
7. **Respect animations** - Keep animation timings reasonable for readability
8. **Test responsiveness** - Check on different screen sizes (936px, 615px breakpoints)
9. **Handle user scroll state** - Use `.blyrics-user-scrolling` class to adjust effects when user scrolls
10. **Exclude translation/romanization from effects** - Use `:not(.blyrics--translated):not(.blyrics--romanized)`
11. **Use `will-change` sparingly** - Only for performance-critical animations
12. **Combine with `--blyrics-anim-delay`** - For timing effects to word animations

## Important Selectors

| Selector                       | When to Use                                        |
| ------------------------------ | -------------------------------------------------- |
| `.blyrics--animating`          | Styling the active line (PREFERRED)                |
| `.blyrics-user-scrolling`      | User is manually scrolling (disable effects)       |
| `:not(:has(.blyrics--active))` | No highlighted lyric (e.g., instrumental sections) |

**Class usage:**
- Use `.blyrics--animating` for **styling** active lines
- Use `.blyrics--active` only in `:has()` checks to **detect** if any lyric is highlighted
- Avoid using `.blyrics--active` directly for styling - it causes issues when multiple lyrics are selected

## Do NOT Modify

- `--noto-sans-universal` - Font fallback chain for international support
- `--blyrics-gradient-stops` - Complex gradient for fullscreen effects
- Core DOM structure expectations
- YouTube Music element selectors in ytmusic.css (unless intentional)

## Files Reference

| File                            | Purpose                              |
| ------------------------------- | ------------------------------------ |
| `blyrics.css`                   | Core lyrics styling and animations   |
| `ytmusic.css`                   | YouTube Music layout modifications   |
| `themesong.css`                 | ThemeSong extension compatibility    |
| `disablestylizedanimations.css` | Disables animations when toggled off |

## Existing Theme Files

Reference these in `public/css/themes/` for inspiration:

| Theme                    | Style                                         |
| ------------------------ | --------------------------------------------- |
| `Default.css`            | Minimal starting point with comments          |
| `Minimal.css`            | Clean, no animations, opacity-based           |
| `Spotlight.css`          | Blur effect on non-active lines               |
| `Luxurious Glass.css`    | Glassmorphism, animated background, underline |
| `Dynamic Background.css` | Extensive YouTube Music UI customization      |
