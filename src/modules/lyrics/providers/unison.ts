import { UNISON_API_URL } from "@/core/constants";
import type { ProviderParameters } from "./shared";
import { fillTtml } from "./blyrics/blyrics";
import { getLocalStorage } from "@/core/storage";

export default async function unison(providerParameters: ProviderParameters): Promise<void> {
    async function obtainDeviceId(): Promise<string | null> {
        const authData = await getLocalStorage<{ odid?: string }>(["odid"]);
        if (authData.odid) return authData.odid;
        
        const uuid = crypto.randomUUID();
        chrome.storage.local.set({ odid: uuid });
        return uuid;
    }

    const url = new URL(UNISON_API_URL);
    // url.searchParams.append("v", providerParameters.videoId);
    url.searchParams.append("song", providerParameters.song);
    url.searchParams.append("artist", providerParameters.artist);
    url.searchParams.append("duration", String(providerParameters.duration));
    if (providerParameters.album != null) {
        url.searchParams.append("album", providerParameters.album);
    }
    
    const response = await fetch(url.toString(), {
        headers: {
            "X-Device-ID": `${await obtainDeviceId()}`
        },
        signal: AbortSignal.any([providerParameters.signal, AbortSignal.timeout(10000)]),
    });

    if (!response.ok) {
        providerParameters.sourceMap["unison-richsynced"].filled = true;
        providerParameters.sourceMap["unison-richsynced"].lyricSourceResult = null;
        return;
    }
    
    let responseString: string = await response.json().then(json => json.data.lyrics);
    const filled = await fillTtml(responseString);

    if (!filled) {
        providerParameters.sourceMap["unison-richsynced"].filled = true;
        providerParameters.sourceMap["unison-richsynced"].lyricSourceResult = null;
        return;
    }
  
    providerParameters.sourceMap["unison-richsynced"].filled = true;
    providerParameters.sourceMap["unison-richsynced"].lyricSourceResult = filled.result;
}
