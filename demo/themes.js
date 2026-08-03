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
    summary: "Colour, the bloom on a held word, and where the active line sits.",
    css: `/* Settings live in comments. Everything outside one is CSS the browser reads, so a
   stylesheet cannot configure the module by accident. */
/* blyrics-target-scroll-pos-ratio = 0.42; */

.blyrics-container {
	--blyrics-font-weight: 700;
	--blyrics-lyric-active-color: oklch(0.87 0.14 84);
	--blyrics-lyric-inactive-color: oklch(0.87 0.14 84 / 0.26);
	/* Only the words held past blyrics-long-word-threshold spend this, so it can afford to be
	   nearly opaque. */
	--blyrics-glow-color: oklch(0.92 0.14 84 / 0.92);
}

.blyrics-background-lyric {
	--blyrics-lyric-inactive-color: oklch(0.87 0.14 84 / 0.16);
}
`,
  },
  {
    id: "centre",
    title: "Centre",
    summary: "Bigger and centred, and the glow reaches shorter words.",
    css: `/* Half way down the view rather than the default 0.37. */
/* blyrics-target-scroll-pos-ratio = 0.5; */
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
    id: "spotlight",
    title: "Spotlight",
    summary: "A hard falloff either side of the line being sung, written against the class names.",
    css: `/* Half way down, so the lit line has room above and below it rather than sitting at an
   edge. */
/* blyrics-target-scroll-pos-ratio = 0.46; */
/* Low enough that the words this song holds at the end of a line earn the bloom. */
/* blyrics-long-word-threshold = 1000; */

.blyrics-container {
	--blyrics-font-weight: 600;
	--blyrics-padding: 1rem;
	--blyrics-scale: 0.94;
	/* The sung syllable is warm and everything else is cool. That is the whole palette. */
	--blyrics-lyric-active-color: oklch(0.99 0.014 96);
	--blyrics-lyric-inactive-color: oklch(0.74 0.016 248);
	--blyrics-glow-color: oklch(0.97 0.03 96 / 0.85);
}

/* Colour cannot say how far a line is from the one being sung, because every inactive line reads
   the same variable. The structure can.

   \`blyrics--active\` leads the voice rather than tracking it, so two lines carry it through every
   handoff. Each tier has to say which lines it is not about, or the neighbour rules outrank a bare
   \`.blyrics--active\` on the line still being sung and the light goes out. */
.blyrics-container:not(.blyrics-user-scrolling) > .blyrics--line:not(.blyrics--active) {
	opacity: 0.13;
	/* Late leaving, immediate arriving: a line holds its light through the handoff rather than
	   trading it away before the voice has got there. */
	transition: opacity 420ms cubic-bezier(0.2, 0, 0, 1) 340ms;
}

.blyrics-container:not(.blyrics-user-scrolling) > .blyrics--line:not(.blyrics--active):has(+ .blyrics--active),
.blyrics-container:not(.blyrics-user-scrolling) > .blyrics--active + .blyrics--line:not(.blyrics--active) {
	opacity: 0.36;
}

.blyrics-container > .blyrics--active {
	opacity: 1;
	transition: opacity 420ms cubic-bezier(0.2, 0, 0, 1);
}

/* The answering voice sits square under the line it answers. The module already prints it at three
   quarters of the size and mixes its colour down, so the only thing left to say is that it gets a
   little air above it. An inline indent here reads as a failed attempt to centre it. */
.blyrics-background-line {
	margin-top: 0.22em;
}

/* Even while it is sung it stays behind the lead. Written through the module's own variable, so the
   mix it already applies to a background vocal still runs on top. */
.blyrics-background-lyric {
	--blyrics-lyric-active-color: oklch(0.93 0.012 96 / 0.7);
}
`,
  },
];
