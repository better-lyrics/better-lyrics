# Better Lyrics CSS Documentation for Beginners

## Table of Contents

- [Better Lyrics CSS Documentation for Beginners](#better-lyrics-css-documentation-for-beginners)
	- [Table of Contents](#table-of-contents)
	- [1. Introduction to CSS and Better Lyrics](#1-introduction-to-css-and-better-lyrics)
	- [2. Understanding the CSS Structure](#2-understanding-the-css-structure)
	- [3. Custom Properties (CSS Variables)](#3-custom-properties-css-variables)
		- [Colors](#colors)
		- [Typography](#typography)
		- [Animations](#animations)
		- [Layout](#layout)
		- [Effects](#effects)
		- [Lyric Transition Properties](#lyric-transition-properties)
		- [Gradient Stops](#gradient-stops)
		- [Additional Configuration Options (Knobs)](#additional-configuration-options-knobs)
		- [Dynamic Properties](#dynamic-properties)
	- [4. Styling the Main Lyrics Container](#4-styling-the-main-lyrics-container)
		- [Container Data Attributes](#container-data-attributes)
	- [5. Styling Individual Lyric Lines](#5-styling-individual-lyric-lines)
		- [Base Structure](#base-structure)
		- [Base Styling for Each Lyric](#base-styling-for-each-lyric)
		- [Activating a Lyric](#activating-a-lyric)
		- [Styling Each Word](#styling-each-word)
		- [Applying the Wobble Animation](#applying-the-wobble-animation)
		- [Implementing the Swipe (Karaoke) Transition](#implementing-the-swipe-karaoke-transition)
	- [6. Creating Animation Effects](#6-creating-animation-effects)
	- [7. Modifying YouTube Music's Layout](#7-modifying-youtube-musics-layout)
		- [Background and Transparency Effects](#background-and-transparency-effects)
		- [Player Bar Styling](#player-bar-styling)
		- [Side Panel Adjustments](#side-panel-adjustments)
	- [8. Handling Loading and Errors](#8-handling-loading-and-errors)
		- [Loading Spinner](#loading-spinner)
		- [Loader State Attributes](#loader-state-attributes)
		- [Error Messages](#error-messages)
		- [No Lyrics Button](#no-lyrics-button)
	- [9. Making the Design Responsive](#9-making-the-design-responsive)
		- [Large Screens (615px and above)](#large-screens-615px-and-above)
		- [Medium Screens (up to 936px)](#medium-screens-up-to-936px)
		- [Small Screens (up to 615px)](#small-screens-up-to-615px)
	- [10. Implementing Fullscreen Mode](#10-implementing-fullscreen-mode)
	- [11. Supporting Right-to-Left (RTL) Languages](#11-supporting-right-to-left-rtl-languages)
		- [Agent-Based Alignment](#agent-based-alignment)
	- [12. Adding a Watermark](#12-adding-a-watermark)
	- [13. Displaying Song Information](#13-displaying-song-information)
	- [14. Footer and Social Elements](#14-footer-and-social-elements)
	- [15. ThemeSong Compatibility](#15-themesong-compatibility)
	- [16. Translated and Romanized Lyrics](#16-translated-and-romanized-lyrics)
	- [17. Instrumental Breaks](#17-instrumental-breaks)
		- [Instrumental Break Structure](#instrumental-break-structure)
		- [Instrumental CSS Variables](#instrumental-css-variables)
		- [Instrumental Classes](#instrumental-classes)
		- [Instrumental Animation](#instrumental-animation)
		- [Styling Instrumental Breaks](#styling-instrumental-breaks)
		- [Data Attributes](#data-attributes)
	- [18. Autoscroll Resume Button](#18-autoscroll-resume-button)
	- [19. Unison Submitter Card and Floating Dock](#19-unison-submitter-card-and-floating-dock)
		- [New CSS Variables](#new-css-variables)
		- [Footer Card](#footer-card)
		- [Submitter Block](#submitter-block)
		- [Trust Tier Pill](#trust-tier-pill)
		- [Vote Button](#vote-button)
		- [Floating Dock](#floating-dock)
		- [Hide and Idle States](#hide-and-idle-states)
	- [20. Best Practices for Modifying CSS](#20-best-practices-for-modifying-css)
	- [21. Importing/Exporting Styles](#21-importingexporting-styles)
	- [22. Additional Resources](#22-additional-resources)

## 1. Introduction to CSS and Better Lyrics

CSS (Cascading Style Sheets) is a styling language used to describe the presentation of a document written in HTML or XML. It allows you to control the layout, colors, fonts, and other visual aspects of web pages.

The Better Lyrics CSS files are designed to enhance the lyrics viewing experience on YouTube Music™. They modify the appearance of the lyrics display, add animations, and adjust the layout to create a more immersive and user-friendly experience.

The extension lets you modify the CSS in real-time, so you can see the changes immediately.

If you're new to CSS, don't worry! This guide will walk you through the main components of the Better Lyrics CSS and explain how they work.

## 2. Understanding the CSS Structure

The Better Lyrics styling system consists of several modular CSS files, organized into directories:

1. **blyrics/** - Core lyrics styling, animations, and visual effects
    - `variables.css`: Global custom properties
    - `lyrics.css`: Main lyrics container and line styles, translations, romanization
    - `components.css`: UI components like the loader, footer, and buttons
    - `instrumental.css`: Instrumental break styles
    - `misc.css`: Utility classes
    - `responsive.css`: Media queries for responsive design
2. **ytmusic/** - YouTube Music interface modifications and layout adjustments
    - `variables.css`: YouTube Music specific variables
    - `general.css`: General interface overrides
    - `fullscreen.css`: Fullscreen mode styles
    - `mobile.css`: Mobile-specific adjustments
3. **themesong.css** - Compatibility styles for the ThemeSong browser extension

Each file is organized into logical sections:

1. Global variables (custom properties)
2. Main container styles
3. Individual lyric line styles
4. Animation definitions
5. YouTube Music layout modifications
6. Responsive design rules
7. Special styles for fullscreen mode

Each section uses CSS selectors to target specific HTML elements and apply styles to them.

## 3. Custom Properties (CSS Variables)

In `blyrics/variables.css`, you'll see a `:root` selector with custom properties that define the visual theme and behavior of Better Lyrics:

```css
:root {
  --blyrics-ui-text-color: var(--blyrics-text-color, color(display-p3 1 1 1 / 1));
  --blyrics-glow-color: var(--blyrics-highlight-color, color(display-p3 1 1 1 / 0.5));
  --blyrics-font-family: Satoshi, Avenir, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif;
  /* ... more variables ... */
}
```

These custom properties allow for easy customization of colors, sizes, and other properties throughout the stylesheet.

### Colors

| Variable                         | Default Value                                                                                                            | Description                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `--blyrics-ui-text-color`        | `color(display-p3 1 1 1 / 1)` (white)                                                                                    | Color of non-lyric UI text           |
| `--blyrics-glow-color`           | `color(display-p3 1 1 1 / 0.5)` (semi-transparent white)                                                                 | Color of glow effect                 |
| `--blyrics-error-color`          | `color(display-p3 0.992 0.882 0.882)` (slightly red off-white)                                                           | Color used in error conditions       |
| `--blyrics-lyric-active-color`   | `color(display-p3 1 1 1 / var(--blyrics-active-opacity, 1))`                                                             | Color of active lyrics               |
| `--blyrics-lyric-inactive-color` | `color(from var(--blyrics-text-color, color(display-p3 1 1 1)) display-p3 r g b / var(--blyrics-inactive-opacity, 0.3))` | Color of inactive lyrics             |
| `--blyrics-footer-bg-color`      | `hsla(0, 0%, 100%, 0.1)`                                                                                                 | Background color for footer elements |
| `--blyrics-footer-border-color`  | `hsla(0, 0%, 100%, 0.1)`                                                                                                 | Border color for footer elements     |
| `--blyrics-footer-text-color`    | `#aaa`                                                                                                                   | Text color in footer                 |
| `--blyrics-footer-link-color`    | `#fff`                                                                                                                   | Link color in footer                 |
| `--blyrics-discord-hover-color`  | `#5865f2` (Discord Blurple)                                                                                              | Hover color for Discord button       |

### Typography

| Variable                           | Default Value                                                                                                                                                        | Description                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `--blyrics-font-family`¹           | `Satoshi, var(--noto-sans-universal), Avenir, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif` | Font family for lyrics                                                 |
| `--blyrics-font-size`              | `3rem`                                                                                                                                                               | Font size for lyrics                                                     |
| `--blyrics-font-weight`            | `700`                                                                                                                                                                | Font weight for lyrics                                                   |
| `--blyrics-line-height`            | `1.333`                                                                                                                                                              | Line height for lyrics                                                   |
| `--blyrics-translated-font-size`   | `2rem`                                                                                                                                                               | Font size of translated/romanized lyrics                                 |
| `--blyrics-translated-font-weight` | `600`                                                                                                                                                                | Font weight of translated/romanized lyrics                               |
| `--blyrics-translated-font-family` | Inherits `--blyrics-font-family`                                                                                                                                     | Font family of translated/romanized lyrics                               |
| `--blyrics-translated-color`       | `color(display-p3 1 1 1 / var(--blyrics-translated-opacity, 0.6))`                                                                                                   | Color of translated/romanized lyrics                                     |
| `--blyrics-footer-font-family`     | `Roboto, Noto Naskh Arabic UI, Arial, sans-serif`                                                                                                                    | Font family of footer                                                    |
| `--blyrics-footer-font-size`       | `14px`                                                                                                                                                               | Font size of footer                                                      |
| `--blyrics-footer-font-weight`     | `400`                                                                                                                                                                | Font weight of footer                                                    |
| `--noto-sans-universal`²           | Omitted                                                                                                                                                              | A family of NotoSans fonts covering a large majority of langauges used.  |

¹To add a custom web-font, use `@import`. It must be placed at the very top of your theme.

²You don't want to override this. You should use this in your own font families as a fallback.

### Animations

JavaScript controls animation timing with the Web Animations API, but the visual values are CSS variables.

| Variable                                      | Default Value                     | Description                                                                                  |
| --------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| `--blyrics-loader-transition-duration`        | `0.6s`                            | Duration of loader enter/exit transitions                                                    |
| `--blyrics-loader-transition-easing`          | `cubic-bezier(0.22, 1, 0.36, 1)` | Easing curve for loader enter/exit transitions                                               |
| `--blyrics-scale-transition-duration`         | `0.166s`                          | Duration of lyric line scale enter/exit                                                      |
| `--blyrics-line-enter-transform-from`         | `scale(var(--blyrics-scale))`     | Line enter start transform                                                                   |
| `--blyrics-line-enter-transform-to`           | `scale(var(--blyrics-active-scale))` | Line enter end transform                                                                  |
| `--blyrics-line-exit-transform-from`          | `scale(var(--blyrics-active-scale))` | Line exit start transform                                                                 |
| `--blyrics-line-exit-transform-to`            | `scale(var(--blyrics-scale))`     | Line exit end transform                                                                      |
| `--blyrics-line-enter-easing`                 | `ease`                            | Line enter easing                                                                            |
| `--blyrics-line-exit-easing`                  | `ease`                            | Line exit easing                                                                             |
| `--blyrics-lyric-highlight-fade-in-duration`  | `0.33s`                           | Line-synced highlight fade-in duration; rich-sync word-timed highlights become visible instantly |
| `--blyrics-lyric-highlight-fade-out-duration` | `0.5s`                            | Highlight fade-out duration                                                                  |
| `--blyrics-lyric-highlight-fade-in-easing`    | `ease`                            | Line-synced highlight fade-in easing                                                         |
| `--blyrics-lyric-highlight-fade-out-easing`   | `ease`                            | Highlight fade-out easing                                                                    |
| `--blyrics-highlight-swipe-easing`            | `linear`                          | Rich-sync swipe easing                                                                       |
| `--blyrics-highlight-swipe-start-from`        | `-0.2`                            | Swipe gradient start value before animation                                                  |
| `--blyrics-highlight-swipe-end-from`          | `-0.1`                            | Swipe gradient end value before animation                                                    |
| `--blyrics-highlight-swipe-start-to`          | `1.4`                             | Swipe gradient start value after animation                                                   |
| `--blyrics-highlight-swipe-end-to`            | `1.5`                             | Swipe gradient end value after animation                                                     |
| `--blyrics-highlight-glow-radius-from`     | `0.8rem`                          | Glow blur radius at the start of the pulse; color stays `var(--blyrics-glow-color)` and resolves per word |
| `--blyrics-highlight-glow-radius-to`       | `0`                               | Glow blur radius at the end of the pulse                                                     |
| `--blyrics-highlight-glow-filter-from`     | (unset)                           | Optional full override of the glow start filter; when set, its color resolves once at the container (one color for all words) |
| `--blyrics-highlight-glow-filter-to`       | (unset)                           | Optional full override of the glow end filter                                               |
| `--blyrics-highlight-glow-duration-ratio`     | `1.2`                             | Glow duration multiplier relative to word duration                                           |
| `--blyrics-highlight-glow-min-duration`       | `1.2s`                            | Minimum glow duration                                                                        |
| `--blyrics-highlight-glow-easing`             | `ease`                            | Glow easing                                                                                  |
| `--blyrics-wobble-duration`                   | `1s`                              | Word wobble duration                                                                         |
| `--blyrics-word-wobble-transform-from`        | `scaleX(1)`                       | Word wobble start transform                                                                  |
| `--blyrics-word-wobble-transform-peak`        | `translateX(0.05em) scaleX(1.025)` | Word wobble peak transform                                                                  |
| `--blyrics-word-wobble-transform-settle`      | `translateX(0) scaleX(1)`         | Word wobble settle transform                                                                 |
| `--blyrics-word-wobble-transform-to`          | `scaleX(1)`                       | Word wobble end transform                                                                    |
| `--blyrics-word-wobble-peak-offset`           | `0.125`                           | Word wobble peak keyframe offset                                                             |
| `--blyrics-word-wobble-settle-offset`         | `0.75`                            | Word wobble settle keyframe offset                                                           |
| `--blyrics-word-wobble-easing`                | `ease`                            | Word wobble animation easing                                                                 |
| `--blyrics-word-wobble-peak-easing`           | `ease-in-out`                     | Word wobble peak keyframe easing                                                             |
| `--blyrics-word-wobble-end-easing`            | `ease-out`                        | Word wobble end keyframe easing                                                              |
| `--blyrics-instrumental-fill-fade-duration`   | `150ms`                           | Instrumental note fill opacity duration                                                      |
| `--blyrics-instrumental-fill-fade-easing`     | `ease`                            | Instrumental note fill opacity easing                                                        |
| `--blyrics-instrumental-fill-transform-from`  | `translateY(78%)`                 | Instrumental fill travel start                                                               |
| `--blyrics-instrumental-fill-transform-to`    | `translateY(-4%)`                 | Instrumental fill travel end                                                                 |
| `--blyrics-instrumental-fill-easing`          | `linear`                          | Instrumental fill travel easing                                                              |
| `--blyrics-instrumental-wave-transform-from`  | `scaleY(1.2)`                     | Instrumental wave start transform                                                            |
| `--blyrics-instrumental-wave-transform-to`    | `scaleY(0.0001)`                  | Instrumental wave end transform                                                              |
| `--blyrics-instrumental-wave-easing`          | `ease-in`                         | Instrumental wave easing                                                                     |
| `--blyrics-instrumental-wave-oscillation-duration` | `1.25s`                    | Duration of each instrumental wave surface oscillation loop                                   |
| `--blyrics-instrumental-wave-oscillation-easing` | `ease-in-out`                  | Easing for the instrumental wave surface oscillation                                          |
| `--blyrics-line-scroll-duration`              | `750ms`                          | Per-line scroll-triggered translate animation duration                              |
| `--blyrics-line-scroll-above-duration`        | `calc(750ms + log(var(--blyrics-line-scroll-abs-relative-index) + 1) * 10ms)` | Duration for lines above the active line; can use line-scroll input variables       |
| `--blyrics-line-scroll-below-duration`        | `calc(750ms + log(var(--blyrics-line-scroll-abs-relative-index) + 1, 2.71828) * 80ms + var(--blyrics-line-scroll-abs-relative-index) * 20ms)` | Duration for lines below the active line; can use line-scroll input variables      |
| `--blyrics-line-scroll-timing-function`       | Same as `--blyrics-lyric-scroll-timing-function` | Per-line scroll-triggered translate animation easing                              |
| `--blyrics-line-scroll-start-easing`          | `--blyrics-line-scroll-timing-function` | Easing attached to the start keyframe                                               |
| `--blyrics-line-scroll-end-easing`            | `linear`                          | Easing attached to the end keyframe                                                           |
| `--blyrics-line-scroll-relative-index`        | Set by JS                         | Relative line index during line-scroll animation; active line is `0`, below lines are positive |
| `--blyrics-line-scroll-abs-relative-index`    | Set by JS                         | Absolute value of `--blyrics-line-scroll-relative-index`                                      |
| `--blyrics-line-scroll-side`                  | Set by JS                         | Direction-aware side used for side-specific knobs: `above`, `active`, or `below`              |
| `--blyrics-line-scroll-delta-px`              | Set by JS                         | Signed scroll delta for the autoscroll that triggered the animation                           |
| `--blyrics-line-scroll-distance-px`           | Set by JS                         | Absolute scroll distance for the autoscroll that triggered the animation                      |
| `--blyrics-line-scroll-translate-y-start`     | `--blyrics-line-scroll-delta-px`  | Shared per-line scroll animation start Y offset                                              |
| `--blyrics-line-scroll-translate-y-end`       | `0px`                             | Shared per-line scroll animation end Y offset                                                |
| `--blyrics-line-scroll-above-translate-y-start` | Shared start value             | Start Y offset for lines above the active line                                               |
| `--blyrics-line-scroll-below-translate-y-start` | Shared start value             | Start Y offset for lines below the active line                                               |
| `--blyrics-line-scroll-above-start-easing`    | Shared start easing              | Start keyframe easing for lines above the active line                                        |
| `--blyrics-line-scroll-below-start-easing`    | Shared start easing              | Start keyframe easing for lines below the active line                                        |
| `--blyrics-timing-offset`                     | `0.115s`                          | Offsets lyrics highlighting for synced lyrics                                                |
| `--blyrics-richsync-timing-offset`            | `0.150s`                          | Offsets highlighting for richsynced lyrics                                                   |
| `--blyrics-scroll-timing-offset`              | `0.5s`                            | Offsets the scroll time after other timing offsets                                           |

Animation effect flags use `1`/`0` values:

| Variable | Default Value | Description |
| -------- | ------------- | ----------- |
| `--blyrics-animate-line-scale` | `1` | Enable line scale animation |
| `--blyrics-animate-word-wobble` | `1` | Enable word wobble animation |
| `--blyrics-animate-highlight-swipe` | `1` | Enable rich-sync gradient swipe |
| `--blyrics-animate-highlight-glow` | `1` | Enable highlight glow |
| `--blyrics-animate-highlight-fade` | `1` | Enable animated line-synced highlight fade and highlight fade-out; rich-sync word-timed fade-in is always instant |
| `--blyrics-animate-scroll` | `1` | Enable smooth WAAPI scroll animation |
| `--blyrics-animate-instrumental` | `1` | Enable instrumental fill travel, wave flattening, and wave oscillation |

The default CSS includes a `prefers-reduced-motion: reduce` block that disables the vestibular triggers (zoom-on-active line scale, translateX word wobble, and instrumental fill / wave motion) and flattens the active/inactive scale delta to `1`. Smooth scroll remains enabled as the position indicator for synced lyrics, but the engine suppresses side-specific line-scroll differential effects so every visible line uses the shared scroll duration, easing, and offsets. The karaoke gradient swipe on richsync lyrics and the highlight glow stay on because they are gradient / drop-shadow fills rather than movement; and the line-synced highlight fade-in / highlight fade-out are opacity transitions, not motion.

Scroll smoothing uses per-line `translate` animations. When the lyrics pane autoscrolls, JS finds the lyric lines visible in the previous or current viewport and sets input variables on those lines: `--blyrics-line-scroll-relative-index` (`0` active, positive below, negative above), `--blyrics-line-scroll-abs-relative-index`, `--blyrics-line-scroll-side`, `--blyrics-line-scroll-delta-px`, and `--blyrics-line-scroll-distance-px`. Visible lyric lines also receive inline `will-change: transform, translate` so text rasterization does not shift when a scroll animation starts.

Side-specific knobs are relative to scroll direction. On a downward scroll, lines above the active line use `above` settings and lines below use `below` settings. On an upward scroll, those sides swap so the animation can mirror the movement direction. The numeric `--blyrics-line-scroll-relative-index` does not swap; it always describes real line position, with negative values above the active line and positive values below it.

Configure line-scroll style values with comment-based knobs, not `:root` declarations. JS copies those values onto each animated line before resolving the Web Animation, so formulas that reference per-line variables resolve in the correct line scope. The resolved keyframes are snapshotted before the animation starts, which lets later scrolls update the same line variables without changing animations that are already running.

The default two-keyframe animation starts each visible line at the signed scroll delta and animates it back to `0`. The base scroll gate is `--blyrics-lyric-scroll-duration`, while the default per-line visual tail uses `750ms` plus a side-specific relative-index delay. Lines above the active lyric get a subtle logarithmic tail. Lines below get a stronger logarithmic tail plus a small linear term, so farther trailing lines keep finishing progressively later during larger jumps instead of flattening at a fixed cap.

```css
/*
blyrics-line-scroll-translate-y-start = var(--blyrics-line-scroll-delta-px);
blyrics-line-scroll-translate-y-end = 0px;
blyrics-line-scroll-duration = 750ms;
blyrics-line-scroll-start-easing = var(--blyrics-line-scroll-timing-function);
blyrics-line-scroll-below-duration = calc(
    750ms + log(var(--blyrics-line-scroll-abs-relative-index) + 1, 2.71828) * 80ms +
      var(--blyrics-line-scroll-abs-relative-index) * 20ms
  );
blyrics-line-scroll-above-duration = calc(
    750ms + log(var(--blyrics-line-scroll-abs-relative-index) + 1) * 10ms
  );
*/
```

The engine animates the individual `translate` property instead of `transform`, so this effect can run alongside the existing line-scale transform animation. Per-line scroll effects can overlap: custom line durations may run longer than `--blyrics-lyric-scroll-duration`, but the next autoscroll is gated only by `--blyrics-lyric-scroll-duration`. Overlapping scroll effects are composed with additive Web Animations (`composite: "add"`), so this behavior expects modern browser support for additive `element.animate()` effects.

### Layout

| Variable                                | Default Value | Description                                                                                    |
| --------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| `--blyrics-padding`                     | `2rem`        | Standard padding                                                                               |
| `--blyrics-margin`                      | `2rem`        | Standard margin                                                                                |
| `--blyrics-border-radius`               | `1000rem`     | Standard border radius                                                                         |
| `--blyrics-padding-top`                 | (dynamic)     | Extra top padding for always-scrollable lyrics (calculated automatically)                      |
| `--blyrics-padding-bottom`              | (dynamic)     | Extra bottom padding for always-scrollable lyrics (calculated automatically)                   |
| `--blyrics-panel-size `                 | `50%`         | Size of lyrics panel (not fullscreen, audio only)                                              |
| `--blyrics-video-panel-size`            | `30%`         | Size of lyrics panel (not fullscreen, video mode)                                              |
| `--blyrics-fullscreen-panel-size`       | `66%`         | Size of lyrics panel (fullscreen, audio only)                                                  |
| `--blyrics-fullscreen-video-panel-size` | `25%`         | Size of lyrics panel (fullscreen, video mode)                                                  |

### Effects

| Variable                        | Default Value | Description                                                       |
| ------------------------------- | ------------- | ----------------------------------------------------------------- |
| `--blyrics-blur-amount`         | `30px`        | Amount of blur applied to elements for visual effects             |
| `--blyrics-scale`               | `0.95`        | Scale factor applied to inactive elements                         |
| `--blyrics-active-scale`        | `1`           | Scale factor applied to active elements                           |
| `--blyrics-error-opacity`       | `0.33`        | Opacity value used for error messages                             |
| `--blyrics-background-blur`     | `100px`       | Amount of blur applied to background elements for depth           |
| `--blyrics-background-saturate` | `2`           | Saturation multiplier for background elements to enhance vibrancy |

### Lyric Transition Properties

| Variable                                 | Default Value                    | Description                                     |
| ---------------------------------------- | -------------------------------- | ----------------------------------------------- |
| `--blyrics-lyric-scroll-duration`³       | `650ms`                          | Duration for scrolling lyric transitions        |
| `--blyrics-lyric-scroll-timing-function` | `cubic-bezier(0.86, 0, 0.2, 1)`  | Timing function for scrolling lyric transitions |

³If `blyrics-early-scroll-consider-s` and `blyrics-queue-scroll-ms` are not manually set, they are derived automatically from this duration. See [Additional Configuration Options (Knobs)](#additional-configuration-options-knobs) for details.

### Gradient Stops

```css
--blyrics-gradient-stops:
  transparent 0%, rgba(0, 0, 0, 0.013) 8.1%,
  rgba(0, 0, 0, 0.049) 15.5%, rgba(0, 0, 0, 0.104) 22.5%,
  rgba(0, 0, 0, 0.175) 29%, rgba(0, 0, 0, 0.259) 35.3%,
  rgba(0, 0, 0, 0.352) 41.2%, rgba(0, 0, 0, 0.45) 47.1%,
  rgba(0, 0, 0, 0.55) 52.9%, rgba(0, 0, 0, 0.648) 58.8%,
  rgba(0, 0, 0, 0.741) 64.7%, rgba(0, 0, 0, 0.825) 71%,
  rgba(0, 0, 0, 0.896) 77.5%, rgba(0, 0, 0, 0.951) 84.5%,
  rgba(0, 0, 0, 0.987) 91.9%, #000 100%;
```

This variable defines a sophisticated gradient used for creating smooth visual transitions in fullscreen mode.

### Additional Configuration Options (Knobs)

Knobs are tweakable parameters that can be configured by creating special comments in your themes.
Inside any comment, anywhere in your theme, you can set the value of special keys using the syntax:

```
<key>=<value>;
```

An example may look something like this:

```css
/*
blyrics-disable-richsync = false;
blyrics-line-synced-animation-delay = 50; (in ms)
blyrics-debug-renderer=false;
blyrics-debug-animation-timing=false;
blyrics-target-scroll-pos-ratio = 0.37;
blyrics-swipe-lead-ratio = 0.1;
blyrics-swipe-duration-ratio = 1.6;
*/
```

If a value isn't specified, default is used.

The following options are avalible:

| Key                                   | Default Value | Description                                                                                                                                |
| ------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `blyrics-disable-richsync`            | `false`       | Set to `true` to render richsynced lyrics through the line-synced path instead, including zero-duration `.blyrics-line-synced-word` spans and line-synced fade-in. |
| `blyrics-line-synced-animation-delay` | `50`          | For non-richsynced lyrics, this value controls the delay each word gets when highlighting (in ms).                                         |
| `blyrics-lyric-ending-threshold-s`    | `0.5`         | Controls the time (in seconds) before a lyric line is finished that we consider it completed for scrolling purposes.                       |
| `blyrics-early-scroll-consider-s`⁴    | Auto (`~0.54` at the default scroll duration) | Controls how far into the future (in seconds) we should look for lines to group together for scrolling purposes.                           |
| `blyrics-queue-scroll-ms`⁴            | Auto (`~131` at the default scroll duration)  | If we're unable to scroll due to having scrolled recently, what is the maximum amount of time that a scroll can be "queued" for.           |
| `blyrics-debug-renderer`              | `false`       | Set to `true` to enable the debug renderer.                                                                                                |
| `blyrics-debug-animation-timing`      | `false`       | Set to `true` to log WAAPI lyric animation timing samples, learned offsets, and timing cleanup events.                                    |
| `blyrics-target-scroll-pos-ratio`     | `0.37`        | Position on the screen lyrics should be at. 0.5 means the selected lyric will be in the middle of the screen, 0 means top, 1 means bottom. |
| `blyrics-swipe-lead-ratio`            | `0.1`         | Rich-sync swipe starts this fraction of word duration before the word time.                                                                |
| `blyrics-swipe-duration-ratio`        | `1.6`         | Rich-sync swipe lasts this multiple of word duration.                                                                                      |
| `blyrics-long-word-threshold`         | `1500`        | Duration threshold (in ms) above which words get `data-long-word="true"`. Useful for glow effects on held notes.                           |
| `blyrics-hide-instrumental-only`      | `false`       | Treat "[Instrumental Only]" as no lyrics (enables fullscreen effect).                                                                      |
| `blyrics-passive-scroll-enabled`          | `true`    | Enable/disable unsynced lyrics auto-scroll entirely. Overrides the user setting when set to `false`.                                       |
| `blyrics-passive-scroll-seconds-per-line` | `3.5`     | For unsynced lyrics auto-scroll: seconds spent scrolling per lyric line. Controls overall scroll speed.                                    |
| `blyrics-passive-scroll-bottom-pause-s`   | `1.5`     | For unsynced lyrics auto-scroll: seconds to pause at the bottom before scrolling back to top.                                              |
| `blyrics-passive-scroll-reset-duration-s` | `0.6`     | For unsynced lyrics auto-scroll: seconds for the scroll-back-to-top animation.                                                             |
| `blyrics-passive-scroll-top-pause-s`      | `0.8`     | For unsynced lyrics auto-scroll: seconds to pause at the top before scrolling down again.                                                  |
| `blyrics-line-scroll-duration`            | `750ms` | Per-line scroll animation duration.                                                                                  |
| `blyrics-line-scroll-above-duration`      | `calc(750ms + log(var(--blyrics-line-scroll-abs-relative-index) + 1) * 10ms)` | Duration for visible lines above the active line.                                                                   |
| `blyrics-line-scroll-active-duration`     | Inherits line-scroll duration | Duration for the active line.                                                                                        |
| `blyrics-line-scroll-below-duration`      | `calc(750ms + log(var(--blyrics-line-scroll-abs-relative-index) + 1, 2.71828) * 80ms + var(--blyrics-line-scroll-abs-relative-index) * 20ms)` | Duration for visible lines below the active line.                                                                    |
| `blyrics-line-scroll-timing-function`     | `var(--blyrics-lyric-scroll-timing-function)` | Shared line-scroll easing.                                                                            |
| `blyrics-line-scroll-start-easing`        | `var(--blyrics-line-scroll-timing-function)` | Easing attached to the start keyframe.                                                                  |
| `blyrics-line-scroll-end-easing`          | `linear` | Easing attached to the end keyframe.                                                                                         |
| `blyrics-line-scroll-above-start-easing`  | Inherits shared start easing | Start keyframe easing for visible lines above the active line.                                                 |
| `blyrics-line-scroll-active-start-easing` | Inherits shared start easing | Start keyframe easing for the active line.                                                              |
| `blyrics-line-scroll-below-start-easing`  | Inherits shared start easing | Start keyframe easing for visible lines below the active line.                                                 |
| `blyrics-line-scroll-above-end-easing`    | Inherits shared end easing | End keyframe easing for visible lines above the active line.                                                   |
| `blyrics-line-scroll-active-end-easing`   | Inherits shared end easing | End keyframe easing for the active line.                                                                |
| `blyrics-line-scroll-below-end-easing`    | Inherits shared end easing | End keyframe easing for visible lines below the active line.                                                   |
| `blyrics-line-scroll-translate-y-start`   | `var(--blyrics-line-scroll-delta-px)` | Shared line-scroll start offset.                                                                       |
| `blyrics-line-scroll-translate-y-end`     | `0px` | Shared line-scroll end offset.                                                                                         |
| `blyrics-line-scroll-above-translate-y-start` | Inherits shared start offset | Start offset for visible lines above the active line.                                                        |
| `blyrics-line-scroll-active-translate-y-start` | Inherits shared start offset | Start offset for the active line.                                                                      |
| `blyrics-line-scroll-below-translate-y-start` | Inherits shared start offset | Start offset for visible lines below the active line.                                                        |
| `blyrics-line-scroll-above-translate-y-end` | Inherits shared end offset | End offset for visible lines above the active line.                                                          |
| `blyrics-line-scroll-active-translate-y-end` | Inherits shared end offset | End offset for the active line.                                                                        |
| `blyrics-line-scroll-below-translate-y-end` | Inherits shared end offset | End offset for visible lines below the active line.                                                          |

⁴If neither knob is manually set, both values are derived from `--blyrics-lyric-scroll-duration` using the default timing ratio. Auto-derived queue time is capped at `200ms`.

If one of these knobs is manually set, the other is derived from the equation below. Auto-derived queue time is still capped at `200ms`.

`var(--blyrics-lyric-scroll-duration)` + `0.02s` = `blyrics-early-scroll-consider-s` +
`blyrics-queue-scroll-ms`

If both are manually set, keep the equation balanced yourself. An unbalanced equation may cause dropped frames or missed scrolls.

Tip: Pay attention to the units of the values; Some values are in *seconds* (s), while others are in *milliseconds* (ms).

### Dynamic Properties

`--blyrics-duration` is a special custom property that is set dynamically by the extension's main script. It represents the duration of the current lyric line and is used to ensure that animations are synchronized with the music playback.

To learn more about CSS custom properties, check out the [MDN Web Docs on Using CSS custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties).

## 4. Styling the Main Lyrics Container

The main container for the lyrics is styled using the `.blyrics-container` class:

```css
.blyrics-container {
  font-family: var(--blyrics-font-family);
  font-size: var(--blyrics-font-size);
  font-weight: var(--blyrics-font-weight);
  isolation: isolate;
  line-height: var(--blyrics-line-height);
  position: relative !important;
  z-index: 1;
  transition: transform var(--blyrics-lyric-scroll-duration) var(--blyrics-lyric-scroll-timing-function) 0s;
  padding-top: 2rem;
  padding-bottom: calc(var(--blyrics-padding-bottom));
}
```

This sets the overall appearance of the lyrics container, including typography, positioning, and scroll behavior. The `isolation: isolate` property creates a new stacking context to prevent z-index issues with other page elements. Note that scrolling is achieved via `transform` for better performance.

### Container Data Attributes

The `.blyrics-container` element has two data attributes that indicate its current state:

| Attribute             | Values                             | Description                                                |
| --------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `data-sync`           | `"richsync"`, `"synced"`, `"none"` | Indicates the synchronization type of the current lyrics   |
| `data-loader-visible` | `"true"`, `"false"`                | Indicates whether the loading spinner is currently visible |

#### Sync Type Styling

Use `data-sync` to style lyrics differently based on their synchronization level:

```css
/* Lyrics with no timing information */
.blyrics-container[data-sync="none"] > div {
  opacity: 1;
  filter: none;
}

/* Standard synced lyrics (line-level timing) */
.blyrics-container[data-sync="synced"] > div {
  /* your synced styles */
}

/* Rich-synced lyrics (word-level timing) */
.blyrics-container[data-sync="richsync"] > div {
  /* your richsync styles */
}
```

**Note:** When lyrics are first loading, they may temporarily appear with `data-sync="none"` before transitioning to `"synced"` or `"richsync"`. Ensure your theme handles this transition smoothly.

#### Loader Visibility Styling

Use `data-loader-visible` to adjust styles when the loader is active:

```css
/* Hide or adjust lyrics container when loader is visible */
.blyrics-container[data-loader-visible="true"] {
  /* your styles during loading */
}

/* Normal display when loader is hidden */
.blyrics-container[data-loader-visible="false"] {
  /* your normal styles */
}
```

## 5. Styling Individual Lyric Lines

Lyric lines are rendered as normal block and inline text so the browser can wrap at natural whitespace. Timed words are still represented by spans, and animation timing is driven by the Web Animations API.

### Base Structure

The lyrics use a hierarchical structure with specific class names:

- `.blyrics-container` - The main container for all lyrics
- `.blyrics--line` - Each lyric line (a `<div>`)
- `.blyrics-line-main` - Main lyric text row inside a line
- `.blyrics-background-line` - Background vocal row, shown below the main row when background vocals are present
- `.blyrics-bidi-run` - Inline text-flow wrapper that lets the browser apply native bidi ordering across timed word spans
- `.blyrics-bidi-sensitive` - Applied to lyric text rows that contain RTL script; changes word wrappers to inline text flow for correct browser bidi and wrapping
- `.blyrics-word-group` - Word group; syllable-synced parts for one word stay together. It is `inline-block` for LTR-only rows and `display: contents` inside `.blyrics-bidi-sensitive`
- `.blyrics--word` - Each word within a line (a `<span>`)
- `.blyrics-word-highlight` - Real highlight overlay used when a long word contains inserted `<wbr>` wrap points
- `.blyrics-background-lyric` - Background vocal word group or timed word

Example:

```html
<div class="blyrics--line" data-agent="v1" data-time="10.259" data-duration="10.291">
  <div class="blyrics-line-main" dir="auto">
    <span class="blyrics-bidi-run" dir="auto">
      <span class="blyrics-word-group">
        <span class="blyrics--word" data-time="10.259" data-duration="0.42" data-content="Hello">Hello</span>
      </span>
      text
    </span>
  </div>
  <div class="blyrics-background-line">
    <span class="blyrics-bidi-run" dir="auto">
      <span class="blyrics-word-group blyrics-background-lyric">...</span>
    </span>
  </div>
  <div class="blyrics--romanized blyrics-content-line">...</div>
  <div class="blyrics--translated blyrics-content-line">...</div>
</div>
```

### Base Styling for Each Lyric

```css
.blyrics-container > div {
  cursor: pointer;
  padding: var(--blyrics-padding) 0.25em !important;
  transform: scale(var(--blyrics-scale));
  transform-origin: left center;
}

.blyrics--line {
  color: var(--blyrics-lyric-inactive-color);
  unicode-bidi: plaintext;
  white-space: normal;
}

.blyrics-line-main,
.blyrics-background-line {
  display: block;
  text-align: inherit;
  unicode-bidi: plaintext;
  white-space: normal;
}

.blyrics-word-group {
  display: inline-block;
  white-space: nowrap;
}

.blyrics-bidi-sensitive .blyrics-word-group {
  display: contents;
}

.blyrics-bidi-sensitive .blyrics--word {
  display: inline;
}
```

- **Inactive Scale**: The element is scaled by `--blyrics-scale` for inactive lyrics
- **Text Layout**: Uses normal inline text flow, not flexbox or CSS `order`
- **Word Grouping**: Syllable-synced parts inside a word stay in one `.blyrics-word-group`. In LTR-only rows it is an unbreakable inline box; in RTL-sensitive rows it becomes `display: contents` so browser bidi can order and wrap the line correctly
- **Background Vocals**: Primary lyric background vocals are moved to `.blyrics-background-line`; timed romanization does not split background parts onto a separate line
- **Transform Origin**: Set to `left center` for proper scaling animation

### Activating a Lyric

When a lyric becomes active, the line gets `.blyrics--active` for current-line state and its scale is animated with `element.animate()`:

```css
.blyrics--active {
  cursor: default;
}
```

The scale animation uses `--blyrics-scale`, `--blyrics-active-scale`, and `--blyrics-scale-transition-duration`. Lyric timing is managed by the Web Animations API.

> **Important:** Prefer styling stable structure classes and data attributes. The extension may select multiple nearby lines for scrolling, so avoid assumptions that exactly one `.blyrics--active` line exists.

#### Two clocks: `.blyrics--active` vs `.blyrics--animating`

A line carries two independent state classes, and they do **not** open and close together.

| Class | Clock | Window |
| ----- | ----- | ------ |
| `.blyrics--active` | Scroll clock: audio time plus `--blyrics-scroll-timing-offset` (0.5s default) | Opens `--blyrics-early-scroll-consider-s` before the line, closes when the scroll target moves on |
| `.blyrics--animating` | Audio clock | Opens ~2s before the line so animations can be prepared, closes only once the line's own words have finished |
| `.blyrics--paused` | Play state | Present on the line and on each of its words whenever playback is paused. Lets theme-authored CSS animations freeze alongside the engine's `element.animate()` pause |

Because the scroll clock deliberately runs ahead of the audio, `.blyrics--active` is dropped roughly half a second **before** a line stops being sung. Anything that dims, blurs, or shrinks previous lines should account for that:

```css
/* dims the previous line while its last word is still playing */
.blyrics-container > div:not(.blyrics--active) {
  opacity: 0.33;
}

/* keeps it lit until the line is genuinely done */
.blyrics-container > div.blyrics--animating {
  opacity: 1;
}
```

Use `.blyrics--active` for scroll-anchored affordances (which line is centered, cursor, hit targets) and `.blyrics--animating` for anything that must survive until the singing stops.

### Styling Each Word

Every word uses the `.blyrics--word` class:

```css
.blyrics--word {
  color: var(--blyrics-lyric-inactive-color);
  position: relative;
  unicode-bidi: normal;
  white-space: inherit;
}
```

- **Color**: Set to inactive color initially
- **Generated Highlight**: Most words use `.blyrics--word::after` for the active overlay
- **Long Wrapped Words**: Words that need internal `<wbr>` breakpoints use `.blyrics-word-highlight` as a real child overlay so the highlight wraps exactly like the visible text
- **Line-Synced Words**: Zero-duration line-synced words get `.blyrics-line-synced-word` and fade in without the rich-sync swipe
- **RTL-Sensitive Words**: Rows containing RTL script use `.blyrics-bidi-sensitive`; their `.blyrics--word` spans compute to `display: inline` and their `.blyrics-word-group` wrappers compute to `display: contents`

#### Word Data Attributes

Each word span has the following data attributes:

| Attribute        | Description                                                                 |
| ---------------- | --------------------------------------------------------------------------- |
| `data-time`      | Start time of the word in seconds                                           |
| `data-duration`  | Duration of the word in seconds                                             |
| `data-content`   | The word text (used by the generated highlight overlay when no real overlay is needed) |
| `data-long-word` | Present (with value `"true"`) when word duration exceeds the threshold      |

#### Targeting Long Words

Words with duration exceeding `blyrics-long-word-threshold` (default: 1500ms) get `data-long-word="true"`. This is useful for adding glow effects to held/sustained notes:

```css
/* Set the threshold (in ms) */
/* blyrics-long-word-threshold = 1500; */

/* Add glow effect to long words */
.blyrics--word[data-long-word]::after {
  --blyrics-glow-color: color(display-p3 1 1 1 / 1);
}
```

For very long unbroken text, the visible word may contain `<wbr>` and a `.blyrics-word-highlight` child:

```css
.blyrics-word-highlight {
  /* real overlay for long wrapped words */
}
```

Changing the threshold triggers a lyric reload automatically.

### Applying the Wobble Animation

The wobble effect is created by JavaScript with `element.animate()`, but the keyframe values come from CSS variables:

```css
:root {
  --blyrics-wobble-duration: 1s;
  --blyrics-word-wobble-transform-from: scaleX(1);
  --blyrics-word-wobble-transform-peak: translateX(0.05em) scaleX(1.025);
  --blyrics-word-wobble-transform-settle: translateX(0) scaleX(1);
  --blyrics-word-wobble-transform-to: scaleX(1);
}
```

Use `--blyrics-animate-word-wobble: 0` to disable the wobble effect.

> **RTL note:** Word wobble uses CSS transforms on `.blyrics--word`. Rows that contain RTL script are rendered as true inline text (`.blyrics-bidi-sensitive .blyrics--word { display: inline; }`) so the browser can apply the Unicode Bidirectional Algorithm correctly. Transforms do not reliably apply to normal inline text, so word wobble should be treated as unavailable for RTL-sensitive rows.

### Implementing the Swipe (Karaoke) Transition

#### Defining Custom Properties

Two custom properties control the swipe transition:

```css
@property --lyric-transition-amount-start {
  syntax: "<number>";
  inherits: false;
  initial-value: 0;
}

@property --lyric-transition-amount-end {
  syntax: "<number>";
  inherits: false;
  initial-value: 0;
}
```

#### The `::after` Pseudo-element

The swipe effect uses each word's `::after` pseudo-element with `background-clip: text`:

```css
.blyrics--word::after,
.blyrics-word-highlight {
  position: absolute;
  top: -2rem;
  left: -2rem;
  white-space: inherit;
  padding: 2rem;
  color: transparent;
  box-sizing: content-box;
  width: 100%;
  background-image: linear-gradient(
    90deg,
    var(--blyrics-lyric-active-color)
      calc(100% * var(--lyric-transition-amount-start) - 4rem * var(--lyric-transition-amount-start) + 2rem),
    #00000000
      calc(100% * var(--lyric-transition-amount-end) - 4rem * var(--lyric-transition-amount-end) + 2rem + 1px)
  );
  background-clip: text;
  opacity: 0;
  --lyric-transition-amount-start: var(--blyrics-highlight-swipe-start-from, -0.2);
  --lyric-transition-amount-end: var(--blyrics-highlight-swipe-end-from, -0.1);
}
```

This creates an overlay using `background-clip: text` with a gradient that reveals the active color progressively. Rich-synced words animate the gradient and make the active overlay visible instantly at the word start time; they do not fade in. Line-synced words (`.blyrics-line-synced-word`) skip the gradient swipe and fade the fully highlighted overlay in word by word.

#### Timing Model

The swipe and glow are driven by `element.animate()`:

- Rich-sync swipe starts at `wordStart - blyrics-swipe-lead-ratio * wordDuration`
- Rich-sync swipe duration is `blyrics-swipe-duration-ratio * wordDuration`
- With the default ratios, the swipe reaches the end of the word at `wordStart + wordDuration`; the remaining `0.5 * wordDuration` is the tail moving past the word
- Rich-sync word-timed opacity becomes visible instantly at `wordStart`; `--blyrics-lyric-highlight-fade-in-duration` is not used for rich-sync fade-in
- Line-synced opacity fade-in starts at its generated word time and uses `--blyrics-lyric-highlight-fade-in-duration`
- Glow starts at `wordStart` and lasts `max(wordDuration * --blyrics-highlight-glow-duration-ratio, --blyrics-highlight-glow-min-duration)`
- Fade-out uses `--blyrics-lyric-highlight-fade-out-duration`
- `--blyrics-animate-highlight-swipe: 0` keeps rich-sync timing in JS but makes each word fully highlighted instantly at `wordStart` instead of moving the gradient


## 6. Creating Animation Effects

Most lyric timing uses the Web Animations API, but the same conceptual effects remain:

```css
@keyframes blyrics-wobble {
  0% {
    transform: scaleX(1);
  }
  12.5% {
    transform: translateX(0.05em) scaleX(1.025);
    animation-timing-function: ease-in-out;
  }
  75% {
    transform: translateX(0) scaleX(1);
  }
  100% {
    transform: scaleX(1);
    animation-timing-function: ease-out;
  }
}

@keyframes blyrics-glow {
  0% {
    filter: drop-shadow(0 0 0.8rem var(--blyrics-glow-color));
  }
  to {
    filter: drop-shadow(0 0 0rem var(--blyrics-glow-color));
  }
}

@keyframes blyrics-spin {
  0% {
    transform: translateY(-50%) rotate(0deg);
  }
  to {
    transform: translateY(-50%) rotate(1turn);
  }
}

@keyframes blyrics-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
```

These animations create:
- **blyrics-wobble**: Subtle horizontal movement and scale for active lyrics (includes `scaleX(1.025)` for emphasis)
- **blyrics-glow**: Drop shadow glow effect that fades out (uses `filter: drop-shadow` for better compatibility with `background-clip: text`)
- **blyrics-spin**: Rotating animation for the loading spinner
- **blyrics-shimmer**: Shimmer animation for loading text

Theme authors should prefer CSS variables and stable structural selectors. The default line scale, word swipe, word glow, instrumental fill, and lyric scroll smoothing are all run with `element.animate()`.

## 7. Modifying YouTube Music's Layout

The `ytmusic/` directory contains extensive modifications to YouTube Music™'s interface to create a more immersive lyrics experience.

### Background and Transparency Effects

```css
ytmusic-player-page:before {
  background: var(--blyrics-background-img);
  background-position: 50% !important;
  background-repeat: no-repeat;
  background-size: cover;
  bottom: 0;
  content: "";
  filter: saturate(var(--blyrics-background-saturate)) brightness(25%) blur(var(--blyrics-background-blur));
  left: 0;
  position: absolute;
  right: 0;
  top: 0;
  transform: scale(1.2);
  z-index: -100;
}
```

This creates a blurred, saturated background image from the album artwork.

### Player Bar Styling

```css
ytmusic-player-bar,
#player-bar-background {
  backdrop-filter: blur(var(--blyrics-blur-amount));
}
```

Applies a blur effect to the player bar for a modern glass-like appearance.

### Side Panel Adjustments

```css
#side-panel {
  min-width: 33em;
}
```

Ensures the lyrics panel has adequate space for comfortable reading. The `33em` width provides consistent sizing regardless of viewport.

## 8. Handling Loading and Errors

### Loading Spinner

```css
#blyrics-loader {
  align-items: center;
  display: flex !important;
  gap: 1rem;
  height: 100%;
  justify-content: center;
  opacity: 1;
  position: relative;
  transition: height 0.2s, opacity 0.2s;
}

#blyrics-loader:before {
  animation: blyrics-spin 1s linear infinite;
  background: url(https://betterlyrics.org/icon-512.png);
  background-position: 50%;
  background-size: cover;
  content: "";
  display: block;
  height: 3rem;
  margin-top: 3rem;
  width: 3rem;
}

#blyrics-loader:after {
  background: linear-gradient(
        110deg,
        color-mix(in srgb, var(--blyrics-ui-text-color) 50%, transparent) 30%,
        var(--blyrics-ui-text-color) 50%,
        color-mix(in srgb, var(--blyrics-ui-text-color) 50%, transparent) 70%
    );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  content: "Better Lyrics is searching for lyrics...";
  font-family: var(--blyrics-font-family);
  font-size: 2rem;
  font-weight: 700;
  isolation: isolate;
  line-height: 1.5;
  white-space: pre;
  z-index: 1;
}
```

Creates an animated loading state with the Better Lyrics icon and descriptive text.

### Loader State Attributes

The loader supports several attributes for different states:

```css
#blyrics-loader[active] { /* Loader is visible and active */ }
#blyrics-loader:not([active]) {
  height: 0;
  opacity: 0;
}

#blyrics-loader[small-loader][active] {
  padding-top: 5rem;
  height: 5rem;
}

#blyrics-loader[small-loader]:after {
  content: "Still searching for synced lyrics...";
}

#blyrics-loader[no-sync-available]:after {
  content: "Better Lyrics could not find synced lyrics";
}
```

| Attribute             | Description                                            |
| --------------------- | ------------------------------------------------------ |
| `[active]`            | Shows the loader                                       |
| `[small-loader]`      | Compact loader shown while searching for synced lyrics |
| `[no-sync-available]` | Indicates synced lyrics couldn't be found              |

### Error Messages

```css
.blyrics--error {
  align-self: flex-start !important;
  color: var(--blyrics-error-color);
  cursor: default;
  font-family: var(--blyrics-font-family);
  font-size: var(--blyrics-font-size);
  font-weight: var(--blyrics-font-weight);
  line-height: 1;
  margin-block: var(--blyrics-margin) !important;
  opacity: var(--blyrics-error-opacity);
  padding-bottom: var(--blyrics-padding) !important;
  padding-top: var(--blyrics-padding) !important;
  word-break: break-word;
}
```

Styles error messages with reduced opacity and a distinct color.

### No Lyrics Button

```css
.blyrics-add-lyrics-button {
  background-color: var(--blyrics-footer-bg-color);
  border: 1px solid var(--blyrics-footer-border-color);
  border-radius: var(--blyrics-border-radius);
  color: var(--blyrics-ui-text-color);
  cursor: pointer;
  font-family: var(--blyrics-font-family);
  font-size: 1.5rem;
  font-weight: 600;
  padding: 1rem 2rem;
  transition: all 0.3s ease;
}

.blyrics-add-lyrics-button:hover {
  background-color: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}
```

Provides an interactive button for when lyrics are not available.

## 9. Making the Design Responsive

The CSS uses media queries to adapt the layout for different screen sizes.

### Large Screens (615px and above)

```css
@media (min-width: 615px) {
  ytmusic-player-page:not([video-mode]):not([player-fullscreened]):not([blyrics-dfs]):not([player-ui-state="MINIPLAYER"]) #player.ytmusic-player-page {
    left: 50%;
    max-width: 400px !important;
    transform: translateX(-50%);
  }
}
```

Centers the player with a maximum width for optimal viewing.

### Medium Screens (up to 936px)

```css
@media (max-width: 936px) {
  ytmusic-player-page:not([is-video-truncation-fix-enabled])[player-fullscreened]:not([blyrics-dfs]) #player.ytmusic-player-page {
    top: 0;
    height: 30rem;
    width: 30rem;
    left: 50%;
    transform: translateX(-50%);
  }
}
```

Adjusts player size and positioning for medium screens.

### Small Screens (up to 615px)

```css
@media (max-width: 615px) {
  .blyrics-container > div {
    margin-inline: 4rem !important;
  }
  
  .blyrics-container:before {
    background: linear-gradient(to right, #030303 4rem, rgba(3, 3, 3, 0.5), #030303 96%), var(--blyrics-background-img) !important;
    background-position: 50% !important;
    background-size: cover !important;
    border-radius: 1rem;
    bottom: 0;
    filter: blur(80px) saturate(2);
    top: 0;
  }
}
```

Adds special background effects and adjusts margins for mobile devices.

## 10. Implementing Fullscreen Mode

The CSS includes comprehensive styles for fullscreen mode:

```css
ytmusic-player-page:not([is-video-truncation-fix-enabled])[player-fullscreened]:not([blyrics-dfs]) #player.ytmusic-player-page {
  height: 40rem;
  width: 40rem;
  top: calc(50% - var(--ytmusic-nav-bar-height));
  left: 20%;
  transform: translate(-50%, -50%);
  mask-image: none !important;
  box-shadow:
    rgba(0, 0, 0, 0.2) 0px 54px 55px, rgba(0, 0, 0, 0.12) 0px -12px 30px, rgba(0, 0, 0, 0.12) 0px 4px 6px, rgba(0, 0, 0, 0.17) 0px 12px 13px, rgba(0, 0, 0, 0.09) 0px -3px 5px;
}
```

This complex selector targets fullscreen mode specifically and:
- Positions the player optimally
- Adds dramatic shadow effects
- Removes any mask images
- Centers content appropriately

The `[blyrics-dfs]` attribute allows users to disable fullscreen styling if preferred.

## 11. Supporting Right-to-Left (RTL) Languages

```css
.blyrics-rtl {
  direction: rtl;
}

.blyrics-bidi-sensitive .blyrics-word-group {
  display: contents;
}

.blyrics-bidi-sensitive .blyrics--word {
  display: inline;
}
```

The `.blyrics-rtl` class is applied when RTL language content is detected, ensuring proper text direction for languages like Arabic or Hebrew. Timed lyric text is also wrapped in `.blyrics-bidi-run`, an inline wrapper that preserves logical DOM order while allowing the browser's Unicode Bidirectional Algorithm to decide visual order and line wrapping.

When a text row contains RTL script, the row also receives `.blyrics-bidi-sensitive`. In that mode, `.blyrics-word-group` becomes `display: contents` and `.blyrics--word` becomes normal inline text. This is intentional: `inline-block` word boxes make each RTL word correct internally but can make the word sequence render in the wrong order. Do not reverse DOM order for RTL lyrics; that breaks wrapping and timing. Use normal logical order and let browser bidi layout produce the visual order.

Because RTL-sensitive word spans are inline, transform-based word wobble does not apply reliably on those rows. Highlight timing, glow, swipe, click seeking, and line selection still use the same timed `.blyrics--word` elements.

### Agent-Based Alignment

For multi-voice lyrics (duets, conversations), the `data-agent` attribute controls alignment:

```css
.blyrics--line[data-agent="v2"],
.blyrics--line[data-agent="v3"] {
  text-align: right;
  transform-origin: right center !important;
}
```

| Attribute            | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `data-agent="v1"`    | Primary voice (default, left-aligned)                |
| `data-agent="v2"`    | Secondary voice (right-aligned)                      |
| `data-agent="v3"`    | Tertiary voice (right-aligned)                       |
| `data-agent="v1000"` | Both speakers simultaneously (duet/chorus, centered) |

This right-aligns secondary voices (v2, v3) while the primary voice (v1) remains left-aligned, creating a visual conversation layout. When both speakers sing simultaneously (v1000), the lyrics are centered. The lyric layout does not use flexbox; use `text-align` and `transform-origin` for agent-specific alignment.

## 12. Adding a Watermark

```css
#blyrics-watermark {
  display: none;
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  margin-bottom: 0 !important;
  justify-content: center;
  user-select: none;
}

#blyrics-watermark > .blyrics-watermark__container {
  display: flex;
  align-items: center;
  border-radius: var(--blyrics-border-radius);
  padding: 0.25rem;
  padding-right: 0.75rem;
  background-color: rgba(0, 0, 0, 0);
  border: 1px solid rgba(0, 0, 0, 0.02);
  backdrop-filter: brightness(0.66) blur(var(--blyrics-blur-amount));
}
```

The watermark is initially hidden but can be displayed for branding or attribution purposes. It includes a subtle backdrop filter effect.

## 13. Displaying Song Information

```css
#blyrics-song-info > p#blyrics-title {
  font-size: 2rem;
  font-weight: 700;
  margin: 0;
}

#blyrics-song-info > p#blyrics-artist {
  font-size: 1.5rem;
  margin: 0;
  opacity: 0.5;
  margin-top: 0.25rem;
}
```

These styles create a clean display for song title and artist information, with the artist name appearing more subdued.

## 14. Footer and Social Elements

```css
.blyrics-footer__container {
  align-items: center;
  background-color: var(--blyrics-footer-bg-color);
  border: 1px solid var(--blyrics-footer-border-color);
  border-radius: var(--blyrics-border-radius);
  color: var(--blyrics-footer-text-color);
  cursor: default;
  display: flex;
  font-family: var(--blyrics-footer-font-family);
  font-size: var(--blyrics-footer-font-size);
  font-weight: var(--blyrics-footer-font-weight);
  line-height: var(--ytmusic-body-line-height);
  padding: 0.5rem 1.25rem;
  position: relative;
  white-space: pre;
  width: fit-content;
  z-index: 2;
}

.blyrics-footer__discord {
  background-color: var(--blyrics-footer-bg-color);
  border: 1px solid var(--blyrics-footer-border-color);
  padding: 0.5rem;
  border-radius: var(--blyrics-border-radius);
  display: grid;
  place-items: center;
  transition: background-color 0.2s;
}

.blyrics-footer__discord:hover {
  background-color: var(--blyrics-discord-hover-color);
}
```

Creates styled footer elements including a Discord button with hover effects.

## 15. ThemeSong Compatibility

The `themesong.css` file ensures compatibility with the ThemeSong browser extension:

```css
@supports (selector(:root:has(#ThemeSong-MainContainer))) {
  :root:has(#ThemeSong-MainContainer) {
    #player-page {
      top: 0 !important;
      padding-block: 64px;
    }
    
    [style*="--blyrics-background-img"] {
      --blyrics-background-img: unset !important;
    }
  }
}
```

This CSS feature query detects when ThemeSong is active and adjusts the layout accordingly, including disabling the background image feature to prevent conflicts.

## 16. Translated and Romanized Lyrics

```css
.blyrics--translated,
.blyrics--romanized {
  display: block;
  font-size: var(--blyrics-translated-font-size);
  font-weight: var(--blyrics-translated-font-weight);
  font-family: var(--blyrics-translated-font-family);
  color: var(--blyrics-translated-color);
  white-space: normal;
  line-height: 1.1;
  margin-top: 8px;
}

.blyrics--romanized {
  width: fit-content;
  padding-block: 1rem;
  font-size: calc(var(--blyrics-translated-font-size) / 1.25);
  background: rgba(255, 255, 255, 0.05);
  padding: 0.375rem 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
}
```

Provides distinct styling for translated lyrics and romanized text, with romanized text getting a subtle background container. If romanization is timed, it can contain the same `.blyrics-line-main`, `.blyrics-word-group`, and `.blyrics--word` structure as the primary lyric line, but background parts are not split into a separate `.blyrics-background-line` inside romanization.

## 17. Instrumental Breaks

Better Lyrics detects instrumental breaks (intros, outros, and mid-song gaps) and displays an animated music note icon. Instrumental breaks are always visible and styled like regular lyrics lines, inheriting `data-agent` from surrounding lines for proper alignment.

### Instrumental Break Structure

```html
<div class="blyrics--instrumental blyrics--line" data-instrumental="true" data-time="0" data-duration="33" data-agent="v1">
  <svg class="blyrics--instrumental-icon" viewBox="0 0 24 24">
    <defs>
      <filter id="blyrics-glow-...">...</filter>
      <clipPath id="blyrics-wave-clip-..." class="blyrics--wave-clip">
        <path class="blyrics--wave-rect" d="..." />
        <path class="blyrics--wave-path" d="..." />
      </clipPath>
    </defs>
    <path class="blyrics--instrumental-bg" d="..." />
    <g filter="url(#blyrics-glow-...)">
      <path class="blyrics--instrumental-fill" clip-path="url(#blyrics-wave-clip-...)" d="..." />
    </g>
  </svg>
</div>
```

### Instrumental CSS Variables

| Variable             | Default Value | Description                                    |
| -------------------- | ------------- | ---------------------------------------------- |
| `--blyrics-duration` | (dynamic)     | Duration of the break in ms (set by extension) |

### Instrumental Classes

| Class                         | Purpose                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `.blyrics--instrumental`      | Base container for instrumental breaks (also has `.blyrics--line`) |
| `.blyrics--instrumental-icon` | The SVG music note icon                                            |
| `.blyrics--instrumental-bg`   | Background path of the music note (uses inactive color)            |
| `.blyrics--instrumental-fill` | Fill path of the music note (uses active color)                    |
| `.blyrics--wave-clip`         | ClipPath for the fill animation                                    |
| `.blyrics--wave-rect`         | Static lower block of the fill clip                                |
| `.blyrics--wave-path`         | Animated wavy top edge inside the clip                             |

### Instrumental Animation

When the note becomes active, the engine fades in `.blyrics--instrumental-fill`, moves `.blyrics--wave-clip` upward to fill the note, flattens `.blyrics--wave-path` over the break duration, and runs a looping wave-surface `d` path animation on `.blyrics--wave-path`.

Use `--blyrics-instrumental-fill-transform-*` for the fill travel, `--blyrics-instrumental-wave-transform-*` for the wave flattening, and `--blyrics-instrumental-wave-oscillation-duration` / `--blyrics-instrumental-wave-oscillation-easing` for the visible wave loop.

### Styling Instrumental Breaks

Instrumental breaks are always visible and styled like regular lyrics lines. They have the `.blyrics--line` class and support `data-agent` for alignment (v1, v2, v3, v1000). The icon uses `--blyrics-lyric-inactive-color` for the background and `--blyrics-lyric-active-color` for the fill:

```css
.blyrics--instrumental-icon {
  height: var(--blyrics-font-size);
  width: calc(var(--blyrics-font-size) + var(--blyrics-font-size) / 3);
  overflow: visible;
  margin-left: calc(var(--blyrics-font-size) / -3);
}

/* Right-aligned for secondary/tertiary vocals */
.blyrics--instrumental[data-agent="v2"] .blyrics--instrumental-icon,
.blyrics--instrumental[data-agent="v3"] .blyrics--instrumental-icon {
  margin-left: 0;
  margin-right: calc(var(--blyrics-font-size) / -3);
}

/* Centered for duets */
.blyrics--instrumental[data-agent="v1000"] .blyrics--instrumental-icon {
  margin-left: 0;
  margin-right: 0;
}

.blyrics--instrumental-bg {
  fill: var(--blyrics-lyric-inactive-color);
}

.blyrics--instrumental-fill {
  fill: var(--blyrics-lyric-active-color);
}
```

To customize instrumental breaks:

```css
/* Change the icon size (independent of font size) */
.blyrics--instrumental-icon {
  width: 4rem;
  height: 4rem;
}

/* Custom background/fill colors */
.blyrics--instrumental-bg {
  fill: rgba(255, 255, 255, 0.3);
}
.blyrics--instrumental-fill {
  fill: rgba(255, 255, 255, 1);
}
```

### Data Attributes

| Attribute           | Description                                        |
| ------------------- | -------------------------------------------------- |
| `data-instrumental` | `"true"` indicates this is an instrumental         |
| `data-time`         | Start time of the break in seconds                 |
| `data-duration`     | Duration of the break in seconds                   |
| `data-line-number`  | Index of this element in the lyrics array          |
| `data-agent`        | Voice alignment: `"v1"`, `"v2"`, `"v3"`, `"v1000"` |

## 18. Autoscroll Resume Button

```css
.autoscroll-resume-button {
  font-family: var(--blyrics-font-family);
  position: absolute;
  display: block;
  font-size: 1.75rem;
  font-weight: 600;
  white-space: normal;
  line-height: 1.1;
  margin-top: 8px;
  width: fit-content;
  padding-block: 1rem;
  background: rgba(255, 255, 255, 0.05);
  padding: 0.5rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  color: rgba(255, 255, 255, 1);
  left: 50%;
  transform: translate(-50%, 2em);
  backdrop-filter: blur(5px);
  will-change: backdrop-filter;
  pointer-events: auto;
  cursor: pointer;
  user-select: none;
  transition: opacity 0.15s linear 0.05s, transform 0.2s cubic-bezier(0.5, 1, 0.89, 1), text-shadow 0.25s ease;
}

.autoscroll-resume-button[autoscroll-hidden="true"] {
  transition: opacity 0.1s linear, transform 0.15s ease-in;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -3em);
}
```

Creates an elegant button that appears when autoscroll is paused, with smooth show/hide transitions.

## 19. Unison Submitter Card and Floating Dock

When a song is served by the Unison provider, the extension injects two extra UI blocks into the YouTube Music page: a submitter card inside the lyrics footer, and a floating dock anchored to the side panel. Both are themeable from your custom CSS the same way as everything else on this page. Class names follow the existing `blyrics-footer__*` and `blyrics-unison-*` conventions.

### New CSS Variables

| Variable | Default Value | Description |
| -------- | ------------- | ----------- |
| `--blyrics-vote-hover-color` | `hsla(0, 0%, 100%, 0.2)` | Background of vote and report buttons on hover |
| `--blyrics-small-border-radius` | `1rem` | Border radius for vote buttons |
| `--blyrics-fullscreen-bottom-dock-shift` | `-24px` | Y-offset applied to bottom-anchored docks in fullscreen. Lifts the dock above the player bar so it stays reachable. Negative values move up |

### Footer Card

When the Unison provider is active, an extra card is appended to the lyrics footer. The card opens the standalone Unison page in a new tab when clicked anywhere outside the buttons.

```html
<div class="blyrics-footer__unison">
  <div class="blyrics-footer__container blyrics-footer__unison-card">
    <div class="blyrics-footer__unison-author">
      <div class="blyrics-footer__unison-author-row">
        <strong class="blyrics-footer__author-name">PetName</strong>
        <span class="blyrics-footer__trust-tier" data-tier="trusted">Trusted</span>
      </div>
      <div class="blyrics-footer__unison-author-label">submitted this</div>
    </div>
    <div class="blyrics-footer__unison-divider"></div>
    <div class="blyrics-footer__unison-actions-block">
      <div class="blyrics-footer__unison-actions">
        <button class="blyrics-footer__vote">…</button>
        <button class="blyrics-footer__vote">…</button>
        <button class="blyrics-footer__vote">…</button>
      </div>
      <div class="blyrics-footer__unison-score-line">
        <strong>+12</strong> <span>score</span> · <strong>12</strong> <span>votes</span>
      </div>
    </div>
  </div>
</div>
```

| Class | Purpose |
| ----- | ------- |
| `.blyrics-footer__unison` | Outer wrapper for the card. Forces full-width inside the footer |
| `.blyrics-footer__unison-card` | Combined with `.blyrics-footer__container`. Translucent rounded card with hover lighten |
| `.blyrics-footer__unison-divider` | 1px vertical line between submitter block and actions block. Only present when there is a submitter |
| `.blyrics-footer__unison-actions-block` | Right column. Holds the action row plus the score line |
| `.blyrics-footer__unison-actions` | Row of three buttons: upvote, downvote, report |
| `.blyrics-footer__unison-score-line` | Score and vote-count line beneath the actions |

### Submitter Block

| Class | Purpose |
| ----- | ------- |
| `.blyrics-footer__unison-author` | Column with author row plus subtitle |
| `.blyrics-footer__unison-author-row` | Row holding the author name and the trust tier pill |
| `.blyrics-footer__author-name` | The submitter handle. Generated from their public key as a deterministic pet name |
| `.blyrics-footer__unison-author-label` | Small "submitted this" label below the author row |

### Trust Tier Pill

The tier pill colors itself based on a `data-tier` attribute. Tier is derived from the submitter's reputation in `getTrustTier()`.

| Selector | Color |
| -------- | ----- |
| `.blyrics-footer__trust-tier[data-tier="new"]` | Blue |
| `.blyrics-footer__trust-tier[data-tier="trusted"]` | Green |
| `.blyrics-footer__trust-tier[data-tier="veteran"]` | Purple |
| `.blyrics-footer__trust-tier[data-tier="expert"]` | Gold |

To restyle, target `.blyrics-footer__trust-tier[data-tier="<tier>"]` and override `color` and `background-color`.

### Vote Button

The same button class is reused for upvote, downvote, and report buttons in both the footer card and the floating dock.

| Class | Purpose |
| ----- | ------- |
| `.blyrics-footer__vote` | Base style. 30px square, rounded, glassy background. Hover uses `--blyrics-vote-hover-color` |
| `.blyrics-footer__vote--active` | Active state. The SVG path with `fill-opacity` becomes fully opaque |

Inside the floating dock, vote buttons are scaled up to 32px square via the `.blyrics-unison-dock__inner .blyrics-footer__vote` selector.

### Floating Dock

A second copy of the vote buttons floats over the side panel so they remain reachable while the user scrolls past the footer card.

```html
<div class="blyrics-unison-dock" data-position="top-center">
  <div class="blyrics-unison-dock__inner">
    <button class="blyrics-footer__vote">…</button>
    <button class="blyrics-footer__vote">…</button>
    <button class="blyrics-footer__vote">…</button>
  </div>
</div>
```

| Class | Purpose |
| ----- | ------- |
| `.blyrics-unison-dock` | Absolute-positioned wrapper inside `#side-panel`. `pointer-events: none` so empty space stays click-through |
| `.blyrics-unison-dock__inner` | The actual button group. Glass background, blur, `pointer-events: auto` |

The dock chooses one of six anchor positions via the `data-position` attribute:

| Value | Anchor |
| ----- | ------ |
| `top-left` | `top: 64px; left: 0` |
| `top-center` | `top: 64px; left: 50%` (translated -50% via `--dock-tx`) |
| `top-right` | `top: 64px; left: 100%` (translated -100%) |
| `bottom-left` | `top: calc(100% - 64px); left: 0` |
| `bottom-center` | `top: calc(100% - 64px); left: 50%` |
| `bottom-right` | `top: calc(100% - 64px); left: 100%` |

When the autoscroll resume button is visible, the `top-center` dock shifts down by 72px via `--dock-y-shift` so the two controls do not overlap.

### Hide and Idle States

| Class | Purpose |
| ----- | ------- |
| `.blyrics-unison-dock--hidden` | Applied while the footer card is in the viewport. The dock fades, blurs, and scales down so the user only sees one set of controls at a time |
| `.blyrics-unison-dock--idle-hidden` | Applied while the player is idle in fullscreen. Hides the dock with the same animation when controls auto-hide |

Both states animate `transform`, `opacity`, and `filter: blur` over 320ms.

A few related rules ship in the YTM stylesheets and you may want to override them:

```css
/* Hide the dock when the side panel is showing something other than lyrics */
#side-panel:has(#tab-renderer:not([page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"])) .blyrics-unison-dock { … }

/* Hide top-anchored docks in fullscreen */
#layout[player-fullscreened]:not([blyrics-dfs]) .blyrics-unison-dock[data-position^="top-"] { … }

/* Pin bottom-anchored docks above the player bar in fullscreen */
#layout[player-fullscreened]:not([blyrics-dfs]) .blyrics-unison-dock[data-position^="bottom-"] {
  --dock-y-shift: var(--blyrics-fullscreen-bottom-dock-shift, -24px);
}
```

Override `--blyrics-fullscreen-bottom-dock-shift` to tune the lift distance.

## 20. Best Practices for Modifying CSS

When modifying this CSS:

1. **Start small and test often** - It's easier to fix one small change than many big ones
2. **Use comments** to remind yourself why you made each change
3. **Be careful with structural elements** - You might accidentally break the layout
4. **Follow naming conventions** - Use `blyrics-` prefix for new class names
5. **Understand complex selectors** - Make sure you don't deviate from the original intent
6. **Experiment freely** - Better Lyrics allows extensive customization
7. **Ask for help** - Join the [Better Lyrics Discord community](https://discord.gg/UsHE3d5fWF) if stuck
8. **Test responsive behavior** - Check your changes on different screen sizes
9. **Consider performance** - Avoid overly complex animations that might cause lag
10. **Have fun** - CSS is about creativity and expression!

## 21. Importing/Exporting Styles

The Better Lyrics extension allows you to import and export custom CSS styles for sharing and backup purposes.

**To export your custom CSS:**
1. Open the Better Lyrics extension
2. Go to the "Edit CSS" section
3. Click "Export to file" button
4. Save the CSS file to your computer

**To import custom CSS:**
1. Open the Better Lyrics extension
2. Go to the "Edit CSS" section
3. Click "Import from file" button
4. Select the CSS file to import
5. The styles will be applied immediately

Share your custom themes with the [Better Lyrics community on Discord](https://discord.gg/UsHE3d5fWF) and get featured in the extension!

## 22. Additional Resources

To learn more about CSS and web development:

- [MDN Web Docs on CSS](https://developer.mozilla.org/en-US/docs/Web/CSS)
- [CSS-Tricks](https://css-tricks.com/)
- [W3Schools CSS Tutorial](https://www.w3schools.com/css/)
- [FreeCodeCamp's Responsive Web Design Certification](https://www.freecodecamp.org/learn/responsive-web-design/)
- [CSS Grid Guide](https://css-tricks.com/snippets/css/complete-guide-grid/)
- [Flexbox Guide](https://css-tricks.com/snippets/css/a-guide-to-flexbox/)

The best way to learn CSS is through experimentation and practice. Join the [Better Lyrics Discord community](https://discord.gg/UsHE3d5fWF) for help, inspiration, and to share your creations!
