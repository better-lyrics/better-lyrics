// Three themes to start from, written the way a theme is written: a stylesheet, with the module's
// settings declared in comments inside it. Each one reaches for a different part of the surface, so
// reading all three is close to reading the reference.
//
// The page hands whichever is selected to `view.theme` verbatim, so what is here is exactly what a
// consumer would ship.

export const THEMES = [
  {
    id: "amber",
    title: "Amber",
    summary: "Colour and where the active line sits.",
    css: `/* Settings live in comments. Everything outside one is CSS the browser reads, so a
   stylesheet cannot configure the module by accident. */
/* blyrics-target-scroll-pos-ratio = 0.42; */

.blyrics-container {
	--blyrics-font-weight: 700;
	--blyrics-lyric-active-color: oklch(0.87 0.14 84);
	--blyrics-lyric-inactive-color: oklch(0.87 0.14 84 / 0.26);
	--blyrics-glow-color: oklch(0.87 0.14 84 / 0.45);
}

.blyrics-background-lyric {
	--blyrics-lyric-inactive-color: oklch(0.87 0.14 84 / 0.16);
}
`,
  },
  {
    id: "centre",
    title: "Centre",
    summary: "Bigger and centred, with a slower sweep across each word.",
    css: `/* Half way down the view rather than the default 0.37. */
/* blyrics-target-scroll-pos-ratio = 0.5; */
/* The sweep runs this many times the word's own length, so it is still moving when the
   next word starts. */
/* blyrics-swipe-duration-ratio = 2.4; */
/* Words held past this many milliseconds get the glow. */
/* blyrics-long-word-threshold = 900; */

.blyrics-container {
	--blyrics-font-size: clamp(2rem, 5.2vw, 4rem);
	--blyrics-line-height: 1.08;
	--blyrics-padding: 1.1rem;
	--blyrics-lyric-active-color: oklch(0.97 0.02 250);
	--blyrics-lyric-inactive-color: oklch(0.97 0.02 250 / 0.2);
	--blyrics-glow-color: oklch(0.82 0.14 250 / 0.6);
	text-align: center;
}

/* Lines scale from their leading edge by default, which reads as a lurch once they are
   centred. */
.blyrics-container > div {
	transform-origin: center center;
}
`,
  },
  {
    id: "plain",
    title: "Plain",
    summary: "Syllable timing switched off, which rebuilds the lines.",
    css: `/* This one is read while the lines are built rather than while they are ticked, so
   writing the theme rebuilds the song and the events log says so. */
/* blyrics-disable-richsync = true; */
/* How long a line takes to light up once there is no word timing left to follow. */
/* blyrics-line-synced-animation-delay = 140; */
/* blyrics-target-scroll-pos-ratio = 0.3; */
/* Unsynced lyrics drift at this rate when passive scroll is on. */
/* blyrics-passive-scroll-seconds-per-line = 2.6; */

.blyrics-container {
	--blyrics-font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	--blyrics-font-size: clamp(1.05rem, 2.1vw, 1.5rem);
	--blyrics-font-weight: 500;
	--blyrics-line-height: 1.55;
	--blyrics-padding: 0.5rem;
	--blyrics-lyric-active-color: oklch(0.92 0.15 150);
	--blyrics-lyric-inactive-color: oklch(0.92 0.15 150 / 0.28);
	--blyrics-scale: 1;
	--blyrics-active-scale: 1;
}
`,
  },
];
