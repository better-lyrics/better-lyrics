import type { LogSink } from "@core/logger";
import { applyLyricDecorations } from "@modules/lyrics/lyricDecorations";
import type { LyricDecorations } from "@modules/lyrics/injectLyrics";
import { createLyricsRenderer, type Lyric, type LyricsRenderer, type TickOptions } from "@braccato/core";
import { decorateEndCard } from "@modules/karaoke/endCard";
import { createKaraokeOverlay, type KaraokeOverlayOptions } from "@modules/karaoke/overlay";

interface KaraokeStageOptions {
  readonly doc: Document;
  readonly win: Window;
  readonly overlay: KaraokeOverlayOptions;
  readonly isVisible: () => boolean;
  readonly isAdPlaying: () => boolean;
  readonly log: LogSink;
}

interface KaraokeStageLyrics {
  readonly lyrics: Lyric[];
  readonly language?: string | null;
  readonly songwriters?: readonly string[];
  readonly title: string;
  readonly artist: string;
  readonly providerKey: string | null;
}

export interface KaraokeStage {
  build(input: KaraokeStageLyrics): void;
  setLanguage(language: string | null | undefined): void;
  applyDecorations(decorations: LyricDecorations, retick: () => void): void;
  tick(timeS: number, options: TickOptions): void;
  retick(read: Parameters<LyricsRenderer["retickFromPlaybackClock"]>[0]): void;
  relayout(): void;
  setTheme(css: string): void;
  setVisible(visible: boolean, onResize: () => void): void;
  clear(): void;
  destroy(): void;
}

export function createKaraokeStage(options: KaraokeStageOptions): KaraokeStage {
  const overlay = createKaraokeOverlay(options.overlay);
  const renderer = createLyricsRenderer({
    document: options.doc,
    window: options.win,
    layout: "stage",
    host: {
      isViewVisible: options.isVisible,
      syncAdState: options.isAdPlaying,
      get log(): LogSink {
        return options.log;
      },
      onStageLayout: box => overlay.setPlateBox(box),
    },
  });

  let firstSungLineStartS = Number.POSITIVE_INFINITY;
  let hasIntroNote = false;

  function clear(): void {
    renderer.clear();
    firstSungLineStartS = Number.POSITIVE_INFINITY;
    hasIntroNote = false;
  }

  return {
    build({ lyrics, language, songwriters, title, artist, providerKey }: KaraokeStageLyrics): void {
      renderer.setLyrics(lyrics, { mount: overlay.ensureMount(), language, songwriters });
      const firstSung = renderer.lines.find(line => line.lyricElement.dataset.instrumental !== "true");
      firstSungLineStartS = firstSung?.time ?? Number.POSITIVE_INFINITY;
      hasIntroNote = renderer.lines[0]?.lyricElement.dataset.instrumental === "true";
      overlay.setTitleCard({ title, artist, songwriters: songwriters ?? [] });
      decorateEndCard(renderer.container, providerKey);
    },

    setLanguage(language: string | null | undefined): void {
      renderer.setLanguage(language);
    },

    applyDecorations(decorations: LyricDecorations, retick: () => void): void {
      applyLyricDecorations(renderer, decorations);
      renderer.scheduleLyricPositionUpdate(options.isVisible, retick);
    },

    tick(timeS: number, tickOptions: TickOptions): void {
      overlay.update(timeS, firstSungLineStartS, hasIntroNote);
      renderer.tick(timeS, tickOptions);
    },

    retick(read: Parameters<LyricsRenderer["retickFromPlaybackClock"]>[0]): void {
      renderer.retickFromPlaybackClock(read);
    },

    relayout(): void {
      renderer.relayout();
    },

    setTheme(css: string): void {
      renderer.setTheme(css);
    },

    setVisible(visible: boolean, onResize: () => void): void {
      overlay.setVisible(visible, onResize);
    },

    clear,

    destroy(): void {
      clear();
      overlay.destroy();
      renderer.destroy();
    },
  };
}
