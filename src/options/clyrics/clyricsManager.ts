import type { TrackInfoProvider } from "@/modules/lyrics/providers/shared";
import type { CLyricsData } from "./types";

/**
 * Returns a list of all created custom lyrics
 */
export async function listCustomLyrics(): Promise<CLyricsData[]> {
    const clyrics = await chrome.storage.local.get<{ customLyrics: CLyricsData[] }>("customLyrics");
    return clyrics.customLyrics || [];
}

/**
 * Fetches the custom lyrics data
 * @param index Zero-based location index of array
 */
export async function getCustomLyrics(index: number): Promise<CLyricsData> {
    const clyrics = await listCustomLyrics();
    return clyrics[index];
}

export async function createCustomLyrics(parameters: TrackInfoProvider, videoId: string | null): Promise<CLyricsData> {
    const clyrics = await listCustomLyrics();
    const data = {
        videoId,
        song: parameters.song,
        artist: parameters.artist,
        album: parameters.album,
        duration: parameters.duration,
        modified: Date.now(),
        lyrics: []
    }

    clyrics.push(data);
    await chrome.storage.local.set({ "customLyrics": clyrics });
    return data;
}
