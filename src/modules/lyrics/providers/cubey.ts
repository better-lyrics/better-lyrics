import { type LyricSourceKey, type LyricSourceResult, type ProviderParameters } from "./shared";

/**
 * Handles the Turnstile challenge by creating an iframe and returning a Promise.
 * The visibility of the iframe can be controlled for testing purposes.
 * @returns A promise that resolves with the Turnstile token.
 */
function handleTurnstile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.src = CUBEY_LYRICS_API_URL_TURNSTILE + "challenge";

    iframe.style.position = "fixed";
    iframe.style.bottom = "calc(20px + var(--ytmusic-player-bar-height))";
    iframe.style.right = "20px";
    iframe.style.width = "0px";
    iframe.style.height = "0px";
    iframe.style.border = "none";
    iframe.style.zIndex = "999999";
    document.body.appendChild(iframe);

    const messageListener = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) {
        return;
      }

      switch (event.data.type) {
        case "turnstile-token":
          Utils.log("[BetterLyrics] ✅ Received Success Token:", event.data.token);
          cleanup();
          resolve(event.data.token);
          break;

        case "turnstile-error":
          console.error("[BetterLyrics] ❌ Received Challenge Error:", event.data.error);
          cleanup();
          reject(new Error(`[BetterLyrics] Turnstile challenge error: ${event.data.error}`));
          break;

        case "turnstile-expired":
          console.warn("⚠️ Token expired. Resetting challenge.");
          iframe.contentWindow!.postMessage({ type: "reset-turnstile" }, "*");
          break;

        case "turnstile-timeout":
          console.warn("[BetterLyrics] ⏳ Challenge timed out.");
          cleanup();
          reject(new Error("[BetterLyrics] Turnstile challenge timed out."));
          break;
        default:
          break;
      }
    };

    const cleanup = () => {
      window.removeEventListener("message", messageListener);
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    };

    window.addEventListener("message", messageListener);
  });
}

export type CubeyLyricSourceResult = LyricSourceResult & {
  album: string;
  artist: string;
  duration: number;
  song: string;
};

import * as Utils from "@core/utils";
import { lrcFixers, parseLRC, parsePlainLyrics } from "./lrcUtils";
import { fillTtml } from "@modules/lyrics/providers/blyrics/blyrics";
import { CUBEY_LYRICS_API_URL, CUBEY_LYRICS_API_URL_TURNSTILE } from "@/core/constants";

/**
 *
 * @param providerParameters
 */
export default async function cubey(providerParameters: ProviderParameters): Promise<void> {
  /**
   * Gets a valid JWT, either from storage or by forcing a new Turnstile challenge.
   * @param [forceNew=false] - If true, ignores and overwrites any stored token.
   * @returns A promise that resolves with the JWT.
   */
  async function getAuthenticationToken(forceNew = false): Promise<string | null> {
    function isJwtExpired(token: string): boolean {
      try {
        const payloadBase64Url = token.split(".")[1];
        if (!payloadBase64Url) return true;
        const payloadBase64 = payloadBase64Url.replace(/-/g, "+").replace(/_/g, "/");
        const decodedPayload = atob(payloadBase64);
        const payload = JSON.parse(decodedPayload);
        const expirationTimeInSeconds = payload.exp;
        if (!expirationTimeInSeconds) return true;
        const nowInSeconds = Date.now() / 1000;
        return nowInSeconds > expirationTimeInSeconds;
      } catch (e) {
        console.error("[BetterLyrics] Error decoding JWT on client-side:", e);
        return true;
      }
    }

    if (forceNew) {
      Utils.log("[BetterLyrics] Forcing new token, removing any existing one.");
      await chrome.storage.local.remove("jwtToken");
    } else {
      const storedData = (await chrome.storage.local.get("jwtToken")) as { jwtToken?: string };
      if (storedData.jwtToken) {
        if (isJwtExpired(storedData.jwtToken)) {
          Utils.log("[BetterLyrics]Local JWT has expired. Removing and requesting a new one.");
          await chrome.storage.local.remove("jwtToken");
        } else {
          Utils.log("[BetterLyrics] 🔑 Using valid, non-expired JWT for bypass.");
          return storedData.jwtToken;
        }
      }
    }

    try {
      Utils.log("[BetterLyrics] No valid JWT found, initiating Turnstile challenge...");
      const turnstileToken = await handleTurnstile();

      const response = await fetch(CUBEY_LYRICS_API_URL + "verify-turnstile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: turnstileToken }),
        credentials: "include",
      });

      if (!response.ok) throw new Error(`API verification failed: ${response.statusText}`);

      const data = await response.json();
      const newJwt = data.jwt;

      if (!newJwt) throw new Error("No JWT returned from API after verification.");

      await chrome.storage.local.set({ jwtToken: newJwt });
      Utils.log("[BetterLyrics] ✅ New JWT received and stored.");
      return newJwt;
    } catch (error) {
      console.error("[BetterLyrics] Authentication process failed:", error);
      return null;
    }
  }

  /**
   * Helper to construct and send the API request.
   * @param jwt - The JSON Web Token for authorization.
   * @returns The fetch Response object.
   */
  async function makeApiCall(jwt: string): Promise<Response> {
    const url = new URL(CUBEY_LYRICS_API_URL + "lyrics");
    url.searchParams.append("song", providerParameters.song);
    url.searchParams.append("artist", providerParameters.artist);
    url.searchParams.append("duration", String(providerParameters.duration));
    url.searchParams.append("videoId", providerParameters.videoId);
    if (providerParameters.album) {
      url.searchParams.append("album", providerParameters.album);
    }
    url.searchParams.append("alwaysFetchMetadata", String(providerParameters.alwaysFetchMetadata));

    return await fetch(url.toString(), {
      signal: AbortSignal.any([providerParameters.signal, AbortSignal.timeout(10000)]),
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      credentials: "include",
    });
  }

  let jwt = await getAuthenticationToken();
  if (!jwt) {
    console.error("[BetterLyrics] Could not obtain an initial authentication token. Aborting lyrics fetch.");
    // Mark sources as filled to prevent retries
    (["musixmatch-synced", "musixmatch-richsync", "lrclib-synced", "lrclib-plain"] as LyricSourceKey[]).forEach(
      source => {
        providerParameters.sourceMap[source].filled = true;
      }
    );
    return;
  }

  let response = await makeApiCall(jwt);

  // If the request is forbidden (403), it's likely a WAF block.
  // Invalidate the current JWT and try one more time with a fresh one.
  if (response.status === 403) {
    console.warn(
      "[BetterLyrics] Request was blocked (403 Forbidden), possibly by WAF. Forcing new Turnstile challenge."
    );
    jwt = await getAuthenticationToken(true); // `true` forces a new token

    if (!jwt) {
      console.error("[BetterLyrics] Could not obtain a new token after WAF block. Aborting.");
      (["musixmatch-synced", "musixmatch-richsync", "lrclib-synced", "lrclib-plain"] as const).forEach(source => {
        providerParameters.sourceMap[source].filled = true;
      });
      return;
    }

    Utils.log("[BetterLyrics] Retrying API call with new token...");
    response = await makeApiCall(jwt);
  }

  if (!response.ok) {
    console.error(`[BetterLyrics] API request failed with status: ${response.status}`);
    (["musixmatch-synced", "musixmatch-richsync", "lrclib-synced", "lrclib-plain"] as const).forEach(source => {
      providerParameters.sourceMap[source].filled = true;
    });
    return;
  }

  const responseData = await response.json();

  if (responseData.album) {
    Utils.log("[BetterLyrics] Found Album: " + responseData.album);
  }

  if (responseData.musixmatchWordByWordLyrics) {
    let musixmatchWordByWordLyrics = parseLRC(
      responseData.musixmatchWordByWordLyrics,
      Number(providerParameters.duration)
    );
    lrcFixers(musixmatchWordByWordLyrics);

    providerParameters.sourceMap["musixmatch-richsync"].lyricSourceResult = {
      lyrics: musixmatchWordByWordLyrics,
      source: "Musixmatch",
      sourceHref: "https://www.musixmatch.com",
      musicVideoSynced: false,
      album: responseData.album,
      artist: responseData.artist,
      song: responseData.song,
      duration: responseData.duration,
      cacheAllowed: true,
    };
  } else {
    providerParameters.sourceMap["musixmatch-richsync"].lyricSourceResult = {
      lyrics: null,
      source: "Musixmatch",
      sourceHref: "https://www.musixmatch.com",
      musicVideoSynced: false,
      album: responseData.album,
      artist: responseData.artist,
      song: responseData.song,
      duration: responseData.duration,
      cacheAllowed: true,
    };
  }

  if (responseData.musixmatchSyncedLyrics) {
    let musixmatchSyncedLyrics = parseLRC(responseData.musixmatchSyncedLyrics, Number(providerParameters.duration));
    providerParameters.sourceMap["musixmatch-synced"].lyricSourceResult = {
      lyrics: musixmatchSyncedLyrics,
      source: "Musixmatch",
      sourceHref: "https://www.musixmatch.com",
      musicVideoSynced: false,
    };
  }

  if (responseData.lrclibSyncedLyrics) {
    let lrclibSyncedLyrics = parseLRC(responseData.lrclibSyncedLyrics, Number(providerParameters.duration));
    providerParameters.sourceMap["lrclib-synced"].lyricSourceResult = {
      lyrics: lrclibSyncedLyrics,
      source: "LRCLib",
      sourceHref: "https://lrclib.net",
      musicVideoSynced: false,
    };
  }

  if (responseData.lrclibPlainLyrics) {
    let lrclibPlainLyrics = parsePlainLyrics(responseData.lrclibPlainLyrics);

    providerParameters.sourceMap["lrclib-plain"].lyricSourceResult = {
      lyrics: lrclibPlainLyrics,
      source: "LRCLib",
      sourceHref: "https://lrclib.net",
      musicVideoSynced: false,
      cacheAllowed: false,
    };
  }

  if (responseData.goLyricsApiTtml) {
    let ttmlData = JSON.parse(responseData.goLyricsApiTtml);
    await fillTtml(ttmlData.ttml, providerParameters);
  }

  (
    [
      "musixmatch-synced",
      "musixmatch-richsync",
      "lrclib-synced",
      "lrclib-plain",
      "bLyrics-richsynced",
      "bLyrics-synced",
    ] as const
  ).forEach(source => {
    providerParameters.sourceMap[source].filled = true;
  });
}
