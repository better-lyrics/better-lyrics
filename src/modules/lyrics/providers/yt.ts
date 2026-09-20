import { getLyrics as getRequestSnifferLyrics } from "@modules/lyrics/requestSniffer/requestSniffer";
import { PlainParser } from "@braccato/parsers";
import { type LyricSourceResult, type ProviderParameters } from "./shared";

export type YTLyricSourceResult = LyricSourceResult & {
  text: string;
};

export default async function ytLyrics(providerParameters: ProviderParameters): Promise<void> {
  let lyricsObj = await getRequestSnifferLyrics(providerParameters.videoId);
  if (lyricsObj.hasLyrics) {
    let lyricsText = lyricsObj.lyrics!;
    let sourceText = lyricsObj.sourceText!.substring(8) + " (via YT)";

    let lyricsArray = PlainParser.parse(lyricsText);
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
