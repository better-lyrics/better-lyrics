// Synthesizes the demo's audio tracks, because the demo needs a real clock to follow and a
// repository is no place for someone else's recording. The notes come from `demo/song.js`, the same
// rows the browser builds its `Lyric[]` out of, so what you hear is what the lyrics claim is
// happening.
//
// A RIFF wave written by hand: it is the only audio container Node can produce without a dependency,
// and the demo is served from disk over localhost, where the size costs nothing.

import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { buildScore, CHORD_VOICINGS, SONGS } from "../demo/song.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "demo", "generated");

// High enough that the third harmonic of the top note stays well under Nyquist, low enough that the
// whole track is a couple of megabytes.
const SAMPLE_RATE = 22050;
const TAIL_S = 1.5;
const PEAK = 0.6;
const FADE_S = 0.03;

// -- Voices --------------------------------------------

interface Voice {
  /** Amplitude per harmonic, starting at the fundamental. */
  harmonics: number[];
  attackS: number;
  decayS: number;
  sustain: number;
  releaseS: number;
  vibratoHz: number;
  vibratoDepth: number;
}

const LEAD: Voice = {
  harmonics: [1, 0.32, 0.13, 0.05],
  attackS: 0.018,
  decayS: 0.16,
  sustain: 0.68,
  releaseS: 0.22,
  vibratoHz: 5.2,
  vibratoDepth: 0.0035,
};

const ECHO: Voice = { ...LEAD, harmonics: [1, 0.18, 0.06], attackS: 0.05, releaseS: 0.3 };

const BASS: Voice = {
  harmonics: [1, 0.22, 0.07],
  attackS: 0.012,
  decayS: 0.3,
  sustain: 0.5,
  releaseS: 0.35,
  vibratoHz: 0,
  vibratoDepth: 0,
};

const PAD: Voice = {
  harmonics: [1, 0.1, 0.05, 0.03],
  attackS: 0.35,
  decayS: 0.6,
  sustain: 0.7,
  releaseS: 0.7,
  vibratoHz: 0.6,
  vibratoDepth: 0.0018,
};

const VOICE_GAIN = { lead: 0.5, echo: 0.22, bass: 0.34, pad: 0.06 };

// -- Synthesis --------------------------------------------

function amplitudeAt(elapsedS: number, holdS: number, voice: Voice): number {
  if (elapsedS < 0) return 0;
  if (elapsedS < voice.attackS) return elapsedS / voice.attackS;

  if (elapsedS < holdS) {
    const decayed = elapsedS - voice.attackS;
    if (decayed >= voice.decayS) return voice.sustain;
    return 1 - (1 - voice.sustain) * (decayed / voice.decayS);
  }

  const releasing = elapsedS - holdS;
  if (releasing >= voice.releaseS) return 0;
  return voice.sustain * (1 - releasing / voice.releaseS);
}

function renderNote(
  track: Float64Array,
  startMs: number,
  durationMs: number,
  pitch: number,
  gain: number,
  voice: Voice
) {
  const frequency = 440 * 2 ** ((pitch - 69) / 12);
  const startS = startMs / 1000;
  const holdS = durationMs / 1000;
  const firstSample = Math.max(0, Math.floor(startS * SAMPLE_RATE));
  const lastSample = Math.min(track.length, Math.ceil((startS + holdS + voice.releaseS) * SAMPLE_RATE));

  for (let sample = firstSample; sample < lastSample; sample++) {
    const elapsedS = sample / SAMPLE_RATE - startS;
    const amplitude = amplitudeAt(elapsedS, holdS, voice) * gain;
    if (amplitude <= 0) continue;

    const detune = 1 + voice.vibratoDepth * Math.sin(2 * Math.PI * voice.vibratoHz * elapsedS);
    let value = 0;
    for (let harmonic = 0; harmonic < voice.harmonics.length; harmonic++) {
      value += voice.harmonics[harmonic] * Math.sin(2 * Math.PI * frequency * detune * (harmonic + 1) * elapsedS);
    }
    track[sample] += value * amplitude;
  }
}

/**
 * Three fixed taps rather than a feedback loop: a comb filter at these delays rings audibly on a
 * sustained note, and the only thing wanted here is enough early reflection that the notes do not
 * sound like they were played inside a box.
 */
function addReflections(track: Float64Array): void {
  const taps = [
    { delayS: 0.061, gain: 0.22 },
    { delayS: 0.097, gain: 0.15 },
    { delayS: 0.151, gain: 0.1 },
  ];

  for (const { delayS, gain } of taps) {
    const offset = Math.round(delayS * SAMPLE_RATE);
    for (let sample = track.length - 1; sample >= offset; sample--) {
      track[sample] += track[sample - offset] * gain;
    }
  }
}

function normalize(track: Float64Array): void {
  let peak = 0;
  for (const value of track) peak = Math.max(peak, Math.abs(value));
  if (peak === 0) return;

  const scale = PEAK / peak;
  const fadeSamples = Math.round(FADE_S * SAMPLE_RATE);
  for (let sample = 0; sample < track.length; sample++) {
    const headroom = Math.min(1, sample / fadeSamples, (track.length - 1 - sample) / fadeSamples);
    track[sample] *= scale * headroom;
  }
}

// -- Container --------------------------------------------

function toWave(track: Float64Array): Buffer {
  const bytesPerSample = 2;
  const dataBytes = track.length * bytesPerSample;
  const wave = Buffer.alloc(44 + dataBytes);

  wave.write("RIFF", 0, "ascii");
  wave.writeUInt32LE(36 + dataBytes, 4);
  wave.write("WAVE", 8, "ascii");
  wave.write("fmt ", 12, "ascii");
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(SAMPLE_RATE, 24);
  wave.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28);
  wave.writeUInt16LE(bytesPerSample, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36, "ascii");
  wave.writeUInt32LE(dataBytes, 40);

  for (let sample = 0; sample < track.length; sample++) {
    const clamped = Math.max(-1, Math.min(1, track[sample]));
    wave.writeInt16LE(Math.round(clamped * 32767), 44 + sample * bytesPerSample);
  }

  return wave;
}

// -- Render --------------------------------------------

function renderSong(songId: string): { wave: Buffer; noteCount: number; durationMs: number } {
  const { notes, bars, durationMs } = buildScore(songId);
  const track = new Float64Array(Math.ceil((durationMs / 1000 + TAIL_S) * SAMPLE_RATE) + 1);

  for (const bar of bars) {
    const voicing = CHORD_VOICINGS[bar.chord as keyof typeof CHORD_VOICINGS];
    renderNote(track, bar.startMs, bar.durationMs * 0.92, voicing.bass, VOICE_GAIN.bass, BASS);
    for (const pitch of voicing.pad) {
      renderNote(track, bar.startMs, bar.durationMs * 0.96, pitch, VOICE_GAIN.pad, PAD);
    }
  }

  for (const note of notes) {
    const voice = note.voice === "echo" ? ECHO : LEAD;
    const gain = note.voice === "echo" ? VOICE_GAIN.echo : VOICE_GAIN.lead;
    renderNote(track, note.startMs, note.durationMs * 0.88, note.pitch, gain, voice);
  }

  addReflections(track);
  normalize(track);

  return { wave: toWave(track), noteCount: notes.length, durationMs };
}

mkdirSync(outDir, { recursive: true });

for (const song of SONGS) {
  const { wave, noteCount, durationMs } = renderSong(song.id);
  writeFileSync(join(outDir, `${song.id}.wav`), wave);

  const seconds = (durationMs / 1000).toFixed(1);
  const megabytes = (wave.length / 1024 / 1024).toFixed(2);
  console.log(
    `Wrote demo/generated/${song.id}.wav: ${seconds}s, ${noteCount} notes, mono ${SAMPLE_RATE}Hz, ${megabytes} MB`
  );
}
