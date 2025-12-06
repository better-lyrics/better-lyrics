import { type LyricSourceResult, type ProviderParameters } from "./shared";
import * as RequestSniffing from "@modules/lyrics/requestSniffer";
import { parsePlainLyrics } from "./lrcUtils";

export type YTLyricSourceResult = LyricSourceResult & {
  text: string;
};

export default async function ytLyrics(providerParameters: ProviderParameters): Promise<void> {
  let lyricsObj = await RequestSniffing.getLyrics(providerParameters.videoId);
  if (lyricsObj.hasLyrics) {
    let lyricsText = lyricsObj.lyrics!;
    let sourceText = lyricsObj.sourceText!.substring(8) + " (via YT)";

    let lyricsArray = parsePlainLyrics(lyricsText);
    providerParameters.sourceMap["yt-lyrics"].lyricSourceResult = {
      lyrics: lyricsArray,
      text: lyricsText,
      source: sourceText,
      sourceHref: "",
      musicVideoSynced: false,
      cacheAllowed: false,
    };

    providerParameters.sourceMap["yt-lyrics"].filled = true;
  }
}
