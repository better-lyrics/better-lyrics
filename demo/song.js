// The demo's built-in songs, written once and derived twice: the browser builds the `Lyric[]` the
// element renders, and `tooling/generate-demo-audio.ts` builds the notes you hear from the same
// rows. A syllable and the note it is sung on cannot drift apart, because neither is written down
// twice.
//
// Nothing in @braccato/core parses a lyrics format, so producing the array is the consumer's job.
// This is what that looks like when the consumer owns the source material. When the source material
// is a file instead, `demo/parsers.js` is the other half of the answer.

// -- Time --------------------------------------------

const BEATS_PER_BAR = 4;

// -- Pitches --------------------------------------------

const Bb1 = 34;
const D2 = 38;
const E2 = 40;
const F2 = 41;
const G2 = 43;
const A2 = 45;
const C3 = 48;
const F3 = 53;
const G3 = 55;
const A3 = 57;
const Bb3 = 58;
const B3 = 59;
const C4 = 60;
const D4 = 62;
const E4 = 64;
const F4 = 65;
const Fs4 = 66;
const G4 = 67;
const A4 = 69;
const B4 = 71;
const C5 = 72;
const D5 = 74;
const E5 = 76;

// Only the audio reads these. Every melody below stays inside the minor pentatonic of its key, which
// is consonant over each chord here, so the tune holds together without the generator knowing any
// harmony.
export const CHORD_VOICINGS = {
  Am: { bass: A2, pad: [A3, C4, E4] },
  Bb: { bass: Bb1, pad: [F3, Bb3, D4] },
  C: { bass: C3, pad: [G3, C4, E4] },
  D: { bass: D2, pad: [A3, D4, Fs4] },
  Dm: { bass: D2, pad: [A3, D4, F4] },
  Em: { bass: E2, pad: [G3, B3, E4] },
  F: { bass: F2, pad: [A3, C4, F4] },
  G: { bass: G2, pad: [G3, B3, D4] },
};

// -- The scores --------------------------------------------

// One bar per row, four beats each. A syllable is [text, pitch, beats], and the text carries its own
// spacing: the renderer joins parts verbatim, so two syllables with no space between them are
// grouped into one animated word and a trailing space ends it.
//
// `echo` is a background vocal. Its beat offset is measured from the start of the bar, so it can
// overlap the line it answers the way a real one does.

const KETTLE = [
  { chord: "Am", instrumental: true },
  {
    chord: "Am",
    syllables: [
      ["The ", A3, 0.5],
      ["ket", C4, 0.5],
      ["tle ", D4, 0.5],
      ["starts ", E4, 0.5],
      ["at ", D4, 0.5],
      ["six", C4, 1.5],
    ],
  },
  {
    chord: "F",
    syllables: [
      ["and ", C4, 0.5],
      ["the ", D4, 0.5],
      ["floor", E4, 0.5],
      ["boards ", E4, 0.5],
      ["take ", D4, 0.5],
      ["the ", C4, 0.5],
      ["cold", A3, 1],
    ],
  },
  {
    chord: "C",
    syllables: [
      ["I ", E4, 0.5],
      ["count ", G4, 0.5],
      ["the ", A4, 0.5],
      ["bus ", G4, 0.5],
      ["stops ", E4, 0.5],
      ["back", D4, 1.5],
    ],
  },
  {
    chord: "G",
    syllables: [
      ["to ", D4, 0.5],
      ["a ", E4, 0.5],
      ["house ", G4, 0.75],
      ["I ", E4, 0.25],
      ["used ", D4, 0.5],
      ["to ", C4, 0.5],
      ["know", A3, 1],
    ],
  },
  {
    chord: "Am",
    syllables: [
      ["So ", A4, 0.5],
      ["play ", C5, 1],
      ["it ", A4, 0.5],
      ["slow", G4, 0.5],
      ["er", A4, 1],
    ],
  },
  {
    chord: "F",
    syllables: [
      ["let ", G4, 0.5],
      ["the ", A4, 0.5],
      ["whole ", C5, 0.75],
      ["thing ", A4, 0.25],
      ["land", G4, 1.5],
    ],
    echo: {
      at: 2,
      syllables: [
        ["(let ", E5, 0.5],
        ["it ", D5, 0.5],
        ["land)", C5, 1],
      ],
    },
  },
  {
    chord: "C",
    syllables: [
      ["I’ve ", C5, 0.5],
      ["got ", A4, 0.5],
      ["all ", G4, 0.5],
      ["night", A4, 2],
    ],
  },
  {
    chord: "G",
    syllables: [
      ["and ", G4, 0.5],
      ["the ", E4, 0.5],
      ["ra", D4, 0.5],
      ["di", E4, 0.25],
      ["o ", D4, 0.25],
      ["on", C4, 1.5],
    ],
  },
  { chord: "Am", instrumental: true },
  {
    chord: "Am",
    syllables: [
      ["The ", A3, 0.5],
      ["tape ", C4, 0.5],
      ["deck ", D4, 0.5],
      ["eats ", E4, 0.5],
      ["a ", D4, 0.5],
      ["song", C4, 1.5],
    ],
  },
  {
    chord: "F",
    syllables: [
      ["and ", C4, 0.25],
      ["I ", D4, 0.25],
      ["wind ", E4, 0.5],
      ["it ", E4, 0.5],
      ["back ", D4, 0.5],
      ["with ", C4, 0.25],
      ["a ", C4, 0.25],
      ["pen", A3, 1.5],
    ],
  },
  {
    chord: "C",
    syllables: [
      ["There’s ", E4, 0.5],
      ["dust ", G4, 0.5],
      ["a", A4, 0.25],
      ["cross ", A4, 0.25],
      ["the ", G4, 0.5],
      ["nee", E4, 0.5],
      ["dle", D4, 1.5],
    ],
  },
  {
    chord: "G",
    syllables: [
      ["but ", D4, 0.5],
      ["it ", E4, 0.5],
      ["finds ", G4, 0.5],
      ["the ", E4, 0.5],
      ["groove ", D4, 0.5],
      ["a", C4, 0.25],
      ["gain", A3, 1.25],
    ],
  },
  { chord: "Am", instrumental: true },
];

const RING_ROAD = [
  { chord: "Em", instrumental: true },
  {
    chord: "Em",
    syllables: [
      ["The ", B3, 0.5],
      ["wi", E4, 0.5],
      ["pers ", G4, 0.5],
      ["keep ", E4, 0.5],
      ["the ", D4, 0.5],
      ["time", E4, 1.5],
    ],
  },
  {
    chord: "C",
    syllables: [
      ["on ", G4, 0.5],
      ["the ", A4, 0.5],
      ["ring ", B4, 0.5],
      ["road ", A4, 0.5],
      ["out ", G4, 0.5],
      ["of ", E4, 0.5],
      ["town", G4, 1],
    ],
  },
  {
    chord: "G",
    syllables: [
      ["Ev", B4, 0.5],
      ["ery ", A4, 0.5],
      ["win", G4, 0.5],
      ["dow ", A4, 0.5],
      ["in ", B4, 0.5],
      ["the ", A4, 0.5],
      ["row", G4, 1],
    ],
  },
  {
    chord: "D",
    syllables: [
      ["has ", A4, 0.5],
      ["the ", B4, 0.5],
      ["same ", A4, 0.5],
      ["blue ", G4, 0.5],
      ["light ", E4, 0.5],
      ["on", D4, 1.5],
    ],
  },
  { chord: "Em", instrumental: true },
  {
    chord: "Em",
    syllables: [
      ["I ", E4, 0.5],
      ["know ", G4, 0.5],
      ["the ", A4, 0.25],
      ["cor", B4, 0.5],
      ["ner ", A4, 0.25],
      ["by ", G4, 0.5],
      ["the ", E4, 0.5],
      ["sound", G4, 1],
    ],
  },
  {
    chord: "C",
    syllables: [
      ["the ", G4, 0.5],
      ["tyres ", A4, 0.75],
      ["make ", G4, 0.25],
      ["on ", E4, 0.5],
      ["the ", D4, 0.5],
      ["grate", E4, 1.5],
    ],
  },
  {
    chord: "G",
    syllables: [
      ["and ", D4, 0.5],
      ["I ", E4, 0.5],
      ["am ", G4, 0.25],
      ["not ", A4, 0.25],
      ["in ", B4, 0.5],
      ["a ", A4, 0.25],
      ["hur", G4, 0.5],
      ["ry", E4, 1.25],
    ],
  },
  {
    chord: "D",
    syllables: [
      ["and ", D4, 0.5],
      ["I ", E4, 0.5],
      ["am ", G4, 0.25],
      ["not ", A4, 0.25],
      ["run", B4, 0.5],
      ["ning ", A4, 0.5],
      ["late", G4, 1.5],
    ],
    echo: {
      at: 2,
      syllables: [
        ["(not ", D5, 0.5],
        ["run", E5, 0.5],
        ["ning ", D5, 0.5],
        ["late)", B4, 0.5],
      ],
    },
  },
  { chord: "Em", instrumental: true },
  {
    chord: "Em",
    syllables: [
      ["The ", B3, 0.5],
      ["pet", E4, 0.5],
      ["rol ", G4, 0.5],
      ["sta", A4, 0.5],
      ["tion ", G4, 0.5],
      ["sign", E4, 1.5],
    ],
  },
  {
    chord: "C",
    syllables: [
      ["is ", G4, 0.5],
      ["the ", A4, 0.5],
      ["last ", B4, 0.5],
      ["thing ", A4, 0.5],
      ["lit ", G4, 0.5],
      ["for ", E4, 0.5],
      ["miles", G4, 1],
    ],
  },
  {
    chord: "G",
    syllables: [
      ["I ", B4, 0.5],
      ["will ", A4, 0.5],
      ["drive ", G4, 0.5],
      ["the ", A4, 0.5],
      ["long ", B4, 0.5],
      ["way ", A4, 0.5],
      ["back", G4, 1],
    ],
  },
  {
    chord: "D",
    syllables: [
      ["and ", A4, 0.5],
      ["get ", G4, 0.5],
      ["in ", E4, 0.5],
      ["af", D4, 0.5],
      ["ter ", E4, 0.5],
      ["two", D4, 1.5],
    ],
  },
  { chord: "Em", instrumental: true },
];

const THE_STEPS = [
  { chord: "Dm", instrumental: true },
  {
    chord: "Dm",
    syllables: [
      ["It ", D4, 0.25],
      ["takes ", F4, 0.5],
      ["a ", G4, 0.25],
      ["long ", A4, 0.5],
      ["way ", G4, 0.5],
      ["down", F4, 2],
    ],
  },
  {
    chord: "Bb",
    syllables: [
      ["to ", F4, 0.5],
      ["the ", G4, 0.25],
      ["wa", A4, 0.5],
      ["ter ", G4, 0.25],
      ["from ", F4, 0.5],
      ["the ", D4, 0.5],
      ["road", F4, 1.5],
    ],
  },
  { chord: "F", instrumental: true },
  {
    chord: "F",
    syllables: [
      ["The ", A4, 0.25],
      ["steps ", C5, 0.75],
      ["are ", A4, 0.5],
      ["wet ", G4, 0.5],
      ["and ", A4, 0.25],
      ["grey", G4, 1.75],
    ],
  },
  {
    chord: "C",
    syllables: [
      ["and ", G4, 0.5],
      ["the ", A4, 0.25],
      ["hand", C5, 0.75],
      ["rail ", A4, 0.5],
      ["is ", G4, 0.25],
      ["cold", F4, 1.75],
    ],
  },
  {
    chord: "Dm",
    syllables: [
      ["There ", D5, 0.5],
      ["is ", C5, 0.25],
      ["no", A4, 0.5],
      ["thing ", G4, 0.25],
      ["at ", F4, 0.5],
      ["the ", G4, 0.25],
      ["bot", A4, 0.5],
      ["tom", F4, 1.25],
    ],
  },
  {
    chord: "Bb",
    syllables: [
      ["but ", F4, 0.5],
      ["the ", G4, 0.25],
      ["tide ", A4, 0.75],
      ["com", G4, 0.5],
      ["ing ", F4, 0.5],
      ["in", D4, 1.5],
    ],
    echo: {
      at: 2.25,
      syllables: [
        ["(com", D5, 0.5],
        ["ing ", C5, 0.5],
        ["in)", A4, 0.75],
      ],
    },
  },
  {
    chord: "F",
    syllables: [
      ["I ", C5, 0.5],
      ["will ", A4, 0.25],
      ["go ", G4, 0.5],
      ["down ", F4, 0.75],
      ["a", G4, 0.5],
      ["ny", A4, 0.5],
      ["way", F4, 1],
    ],
  },
  { chord: "Dm", instrumental: true },
];

/**
 * What the picker shows and what the audio generator walks. `beatMs` is the only tempo there is: a
 * bar is four beats, and every syllable duration below is measured in them.
 */
export const SONGS = [
  {
    id: "kettle",
    title: "Kettle",
    summary: "Syllable timing, with a background vocal over the fifth line.",
    beatMs: 750,
    bars: KETTLE,
  },
  {
    id: "ring-road",
    title: "Ring Road",
    summary: "Faster, and more syllables per line than the sweep has room for.",
    beatMs: 500,
    bars: RING_ROAD,
  },
  {
    id: "the-steps",
    title: "The Steps",
    summary: "Slow, with words held long enough to earn a glow.",
    beatMs: 1000,
    bars: THE_STEPS,
  },
];

// -- Derivation --------------------------------------------

function layParts(syllables, startMs, beatMs, isBackground) {
  const parts = [];
  let cursorMs = startMs;

  for (const [words, , beats] of syllables) {
    const durationMs = Math.round(beats * beatMs);
    parts.push({ startTimeMs: cursorMs, words, durationMs, isBackground });
    cursorMs += durationMs;
  }

  return parts;
}

function layNotes(syllables, startMs, beatMs, voice) {
  const notes = [];
  let cursorMs = startMs;

  for (const [, pitch, beats] of syllables) {
    const durationMs = Math.round(beats * beatMs);
    notes.push({ startMs: cursorMs, durationMs, pitch, voice });
    cursorMs += durationMs;
  }

  return notes;
}

/**
 * One song in the two shapes its two readers need. Walked once so the timeline behind both is
 * literally the same arithmetic rather than the same intent expressed twice.
 */
export function buildScore(songId) {
  const song = SONGS.find(candidate => candidate.id === songId);
  if (song === undefined) throw new Error(`No built-in song called "${songId}"`);

  const barMs = BEATS_PER_BAR * song.beatMs;
  const lyrics = [];
  const notes = [];
  const bars = [];
  let barStartMs = 0;

  for (const bar of song.bars) {
    bars.push({ startMs: barStartMs, durationMs: barMs, chord: bar.chord });

    if (bar.instrumental) {
      lyrics.push({ startTimeMs: barStartMs, durationMs: barMs, words: "", isInstrumental: true });
      barStartMs += barMs;
      continue;
    }

    const parts = layParts(bar.syllables, barStartMs, song.beatMs, false);
    notes.push(...layNotes(bar.syllables, barStartMs, song.beatMs, "lead"));

    if (bar.echo) {
      const echoStartMs = barStartMs + bar.echo.at * song.beatMs;
      parts.push(...layParts(bar.echo.syllables, echoStartMs, song.beatMs, true));
      notes.push(...layNotes(bar.echo.syllables, echoStartMs, song.beatMs, "echo"));
    }

    const endMs = Math.max(...parts.map(part => part.startTimeMs + part.durationMs));
    lyrics.push({
      startTimeMs: barStartMs,
      durationMs: endMs - barStartMs,
      words: bar.syllables
        .map(([words]) => words)
        .join("")
        .trimEnd(),
      parts,
    });

    barStartMs += barMs;
  }

  return { lyrics, notes, bars, durationMs: barStartMs };
}
