// The demo's song, written once and derived twice: the browser builds the `Lyric[]` the element
// renders, and `tooling/generate-demo-audio.ts` builds the notes you hear from the same rows. A
// syllable and the note it is sung on cannot drift apart, because neither is written down twice.
//
// Nothing in @braccato/core parses a lyrics format, so producing the array is the consumer's job.
// This is what that looks like when the consumer owns the source material.

// -- Time --------------------------------------------

export const BEAT_MS = 750;
export const BEATS_PER_BAR = 4;

// -- Pitches --------------------------------------------

const A3 = 57;
const C4 = 60;
const D4 = 62;
const E4 = 64;
const G4 = 67;
const A4 = 69;
const C5 = 72;
const D5 = 74;
const E5 = 76;

// Only the audio reads these. The melody stays inside A minor pentatonic, which is consonant over
// every chord below, so the tune holds together without the generator knowing any harmony.
export const CHORD_VOICINGS = {
  Am: { bass: 45, pad: [57, 60, 64] },
  F: { bass: 41, pad: [57, 60, 65] },
  C: { bass: 48, pad: [55, 60, 64] },
  G: { bass: 43, pad: [55, 59, 62] },
};

// -- The score --------------------------------------------

// One bar per row, four beats each. A syllable is [text, pitch, beats], and the text carries its own
// spacing: the renderer joins parts verbatim, so two syllables with no space between them are
// grouped into one animated word and a trailing space ends it.
//
// `echo` is a background vocal. Its beat offset is measured from the start of the bar, so it can
// overlap the line it answers the way a real one does.
const SONG = [
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

// -- Derivation --------------------------------------------

function layParts(syllables, startMs, isBackground) {
  const parts = [];
  let cursorMs = startMs;

  for (const [words, , beats] of syllables) {
    const durationMs = Math.round(beats * BEAT_MS);
    parts.push({ startTimeMs: cursorMs, words, durationMs, isBackground });
    cursorMs += durationMs;
  }

  return parts;
}

function layNotes(syllables, startMs, voice) {
  const notes = [];
  let cursorMs = startMs;

  for (const [, pitch, beats] of syllables) {
    const durationMs = Math.round(beats * BEAT_MS);
    notes.push({ startMs: cursorMs, durationMs, pitch, voice });
    cursorMs += durationMs;
  }

  return notes;
}

/**
 * The score in the two shapes its two readers need. Walked once so the timeline behind both is
 * literally the same arithmetic rather than the same intent expressed twice.
 */
export function buildScore() {
  const barMs = BEATS_PER_BAR * BEAT_MS;
  const lyrics = [];
  const notes = [];
  const bars = [];
  let barStartMs = 0;

  for (const bar of SONG) {
    bars.push({ startMs: barStartMs, durationMs: barMs, chord: bar.chord });

    if (bar.instrumental) {
      lyrics.push({ startTimeMs: barStartMs, durationMs: barMs, words: "", isInstrumental: true });
      barStartMs += barMs;
      continue;
    }

    const parts = layParts(bar.syllables, barStartMs, false);
    notes.push(...layNotes(bar.syllables, barStartMs, "lead"));

    if (bar.echo) {
      const echoStartMs = barStartMs + bar.echo.at * BEAT_MS;
      parts.push(...layParts(bar.echo.syllables, echoStartMs, true));
      notes.push(...layNotes(bar.echo.syllables, echoStartMs, "echo"));
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
