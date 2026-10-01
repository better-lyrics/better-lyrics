import { AppState } from "@core/appState";
import { type LogSink, logCore } from "@core/logger";
import { applyLyricDecorations } from "@modules/lyrics/lyricDecorations";
import { type ObserverHandle, observeResize } from "@modules/ui/layout/layoutWidth";
import type { LyricDecorations } from "@modules/lyrics/injectLyrics";
import { currentViewLyrics } from "@modules/lyrics/viewLyrics";
import { currentTickOptions, lyricsElementAdded } from "@modules/ui/mainLyricsView";
import { isAdPlaying } from "@modules/ui/playerControls/playerBarControls";
import { createLyricsRenderer, type LyricsRenderer } from "@braccato/core";
import { decorateEndCard } from "@modules/karaoke/endCard";
import { karaokeOverlay } from "@modules/karaoke/overlay";
import { isKaraokeActive, isKaraokeLayout, isKaraokeWanted, syncKaraokeAttribute } from "@modules/karaoke/state";

// -- The karaoke view --------------------------

const karaokeView: Omit<LyricsRenderer, "destroy"> = createLyricsRenderer({
  document,
  window,
  layout: "stage",
  host: {
    isViewVisible: isKaraokeActive,
    syncAdState: () => isAdPlaying(document),
    get log(): LogSink {
      return logCore;
    },
    onStageLayout: box => karaokeOverlay.setPlateBox(box),
  },
});

let builtFrom: object | null = null;
let builtSegmentMap: object | null = null;
let builtLanguage: string | null | undefined;
let decorationSignature = "";
let firstSungLineStartS = Number.POSITIVE_INFINITY;
let hasIntroNote = false;
let wasActive = false;
let wasLayout = false;

function clearKaraokeLyrics(): void {
  karaokeView.clear();
  builtFrom = null;
  builtSegmentMap = null;
  decorationSignature = "";
  firstSungLineStartS = Number.POSITIVE_INFINITY;
  hasIntroNote = false;
}

function signatureOf(decorations: LyricDecorations): string {
  let signature = "";
  for (const [index, decoration] of Object.entries(decorations)) {
    signature += `${index}${decoration.romanization ? "r" : ""}${decoration.translation ? "t" : ""},`;
  }
  return signature;
}

function publishKaraokeLyrics(): void {
  const source = AppState.parsedLyrics;
  const lyricData = AppState.lyricData;
  if (!source || !lyricData || lyricData.isProvisional || lyricData.syncType === "none") {
    if (builtFrom !== null) clearKaraokeLyrics();
    return;
  }
  if (!isKaraokeWanted()) return;

  const view = currentViewLyrics();
  if (!view.lyrics || view.noLyrics) {
    if (builtFrom !== null) clearKaraokeLyrics();
    return;
  }

  const segmentMap = source.segmentMap ?? null;
  const rebuilt = source !== builtFrom || segmentMap !== builtSegmentMap;
  if (rebuilt) {
    karaokeView.setLyrics(view.lyrics, {
      mount: karaokeOverlay.ensureMount(),
      language: view.language,
      songwriters: view.songwriters,
    });
    builtFrom = source;
    builtSegmentMap = segmentMap;
    builtLanguage = view.language;
    decorationSignature = "";
    const firstSung = karaokeView.lines.find(line => line.lyricElement.dataset.instrumental !== "true");
    firstSungLineStartS = firstSung?.time ?? Number.POSITIVE_INFINITY;
    hasIntroNote = karaokeView.lines[0]?.lyricElement.dataset.instrumental === "true";
    karaokeOverlay.setTitleCard({
      title: lyricData.song,
      artist: lyricData.artist,
      songwriters: view.songwriters ?? [],
    });
    decorateEndCard(karaokeView.container);
  } else if (view.language !== builtLanguage) {
    builtLanguage = view.language;
    karaokeView.setLanguage(view.language);
  }

  const signature = signatureOf(view.decorations);
  if (!rebuilt && signature === decorationSignature) return;
  decorationSignature = signature;
  applyLyricDecorations(karaokeView, view.decorations);
  karaokeView.scheduleLyricPositionUpdate(isKaraokeActive, retickKaraoke);
}

// -- Ticking --------------------------

// Ticks before the side panel: on the shared clock only the first view to tick sees a seek as a jump.
export function tickKaraoke(timeS: number, wallTime: number, isPlaying: boolean): void {
  karaokeOverlay.update(timeS, firstSungLineStartS, hasIntroNote);
  karaokeView.tick(timeS, currentTickOptions(wallTime, isPlaying));
}

function retickKaraoke(): void {
  karaokeView.retickFromPlaybackClock((eventCreationTime, isPlaying) =>
    currentTickOptions(eventCreationTime, isPlaying, false)
  );
}

function relayoutKaraoke(): void {
  karaokeView.relayout();
  retickKaraoke();
}

// -- Sync --------------------------

const PANEL_SETTLE_MS = 1000;
let panelRefit: ObserverHandle | null = null;

function refitPlayerPanel(): void {
  const mainPanel = document.querySelector<HTMLElement>("ytmusic-player-page #main-panel");
  const sidePanel = document.querySelector<HTMLElement>("ytmusic-player-page #side-panel");
  if (!mainPanel || !sidePanel) return;
  panelRefit?.destroy();
  const handle = observeResize([sidePanel], () => {
    mainPanel.style.removeProperty("padding");
    window.dispatchEvent(new Event("resize"));
  });
  panelRefit = handle;
  window.setTimeout(() => {
    handle.destroy();
    if (panelRefit === handle) panelRefit = null;
  }, PANEL_SETTLE_MS);
}

export function syncKaraoke(): void {
  const active = syncKaraokeAttribute();

  if (active) publishKaraokeLyrics();
  else if (!AppState.parsedLyrics && builtFrom !== null) clearKaraokeLyrics();
  karaokeOverlay.setVisible(active, relayoutKaraoke);

  // Each view was off the screen while the other one showed, so neither kept its measurements.
  if (active !== wasActive) {
    wasActive = active;
    if (active) relayoutKaraoke();
  }
  const layout = isKaraokeLayout();
  if (layout !== wasLayout) {
    wasLayout = layout;
    if (!layout) {
      lyricsElementAdded();
      refitPlayerPanel();
    }
  }
}

export function applyKaraokeTheme(css: string): void {
  karaokeView.setTheme(css);
}

export function disposeKaraoke(): void {
  clearKaraokeLyrics();
  karaokeOverlay.destroy();
  panelRefit?.destroy();
  panelRefit = null;
  wasActive = false;
  wasLayout = false;
}
