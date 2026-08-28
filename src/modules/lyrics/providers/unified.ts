import { CUBEY_LYRICS_API_URL, CUBEY_LYRICS_API_URL_TURNSTILE, HOMEPAGE_URL, LOG_PREFIX } from "@constants";
import { getLocalStorage } from "@core/storage";
import { lrcFixers, parseLRC, parseQRC, PlainParser } from "@braccato/parsers";
import { type LyricSourceKey, type LyricSourceResult, type ProviderParameters, saveLyricsToCache } from "./shared";
import { fillTtml } from "@modules/lyrics/providers/ttmlSource";
import { errorCore, logCore, warnCore } from "@core/logger";

const JWT_RENEWAL_THRESHOLD_SECONDS = 60 * 60;

interface JwtMetadata {
  secondsUntilExpiry: number;
  isExpired: boolean;
  shouldRenew: boolean;
}

let authenticationTokenPromise: Promise<string | null> | null = null;

/**
 * Handles the Turnstile challenge by creating an iframe and returning a Promise.
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
          logCore("Received Success Token:", event.data.token);
          cleanup();
          resolve(event.data.token);
          break;

        case "turnstile-error":
          errorCore("Received Challenge Error:", event.data.error);
          cleanup();
          reject(new Error(`${LOG_PREFIX} Turnstile challenge error: ${event.data.error}`));
          break;

        case "turnstile-expired":
          warnCore("Token expired. Resetting challenge.");
          iframe.contentWindow!.postMessage({ type: "reset-turnstile" }, "*");
          break;

        case "turnstile-timeout":
          warnCore("Challenge timed out.");
          cleanup();
          reject(new Error(`${LOG_PREFIX} Turnstile challenge timed out.`));
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

function getJwtMetadata(token: string): JwtMetadata | null {
  try {
    const payloadBase64Url = token.split(".")[1];
    if (!payloadBase64Url) return null;
    const payloadBase64 = payloadBase64Url.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayloadBase64 = payloadBase64.padEnd(
      payloadBase64.length + ((4 - (payloadBase64.length % 4)) % 4),
      "="
    );
    const decodedPayload = atob(paddedPayloadBase64);
    const payload = JSON.parse(decodedPayload) as { exp?: unknown };
    const expiresAtSeconds = Number(payload.exp);
    if (!Number.isFinite(expiresAtSeconds)) return null;

    const secondsUntilExpiry = expiresAtSeconds - Date.now() / 1000;
    return {
      secondsUntilExpiry,
      isExpired: secondsUntilExpiry <= 0,
      shouldRenew: secondsUntilExpiry <= JWT_RENEWAL_THRESHOLD_SECONDS,
    };
  } catch (e) {
    errorCore("Error decoding JWT on client-side:", e);
    return null;
  }
}

function requestNewAuthenticationToken(reason: string): Promise<string | null> {
  if (authenticationTokenPromise) {
    logCore("Authentication token request already in progress; reusing it.");
    return authenticationTokenPromise;
  }

  const promise = (async () => {
    try {
      logCore(`Requesting new JWT (${reason})...`);
      const turnstileToken = await handleTurnstile();

      const response = await fetch(CUBEY_LYRICS_API_URL + "verify-turnstile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: turnstileToken }),
        credentials: "include",
      });

      if (!response.ok) throw new Error(`API verification failed: ${response.statusText}`);

      const data = (await response.json()) as { jwt?: unknown };
      const newJwt = data.jwt;

      if (typeof newJwt !== "string" || !newJwt) throw new Error("No JWT returned from API after verification.");

      await chrome.storage.local.set({ jwtToken: newJwt });
      logCore("New JWT received and stored.");
      return newJwt;
    } catch (error) {
      errorCore("Authentication process failed:", error);
      return null;
    }
  })();

  authenticationTokenPromise = promise;
  void promise.finally(() => {
    if (authenticationTokenPromise === promise) {
      authenticationTokenPromise = null;
    }
  });

  return promise;
}

/**
 * Gets a valid JWT, either from storage or by forcing a new Turnstile challenge.
 */
async function getAuthenticationToken(forceNew = false): Promise<string | null> {
  if (forceNew) {
    logCore("Forcing new token refresh.");
    return requestNewAuthenticationToken("forced refresh");
  }

  const storedData = await getLocalStorage<{ jwtToken?: string }>(["jwtToken"]);
  const storedJwt = storedData.jwtToken;
  if (!storedJwt) {
    logCore("No local JWT found, initiating Turnstile challenge...");
    return requestNewAuthenticationToken("missing token");
  }

  const metadata = getJwtMetadata(storedJwt);
  if (!metadata) {
    logCore("Local JWT is invalid, requesting a new one.");
    return requestNewAuthenticationToken("invalid token");
  }

  if (metadata.isExpired) {
    logCore("Local JWT has expired, requesting a new one.");
    return requestNewAuthenticationToken("expired token");
  }

  if (metadata.shouldRenew) {
    logCore(`Local JWT expires in ${Math.round(metadata.secondsUntilExpiry)} seconds; renewing in background.`);
    void requestNewAuthenticationToken("near-expiry token").then(newJwt => {
      if (!newJwt) {
        warnCore("Background JWT renewal failed; keeping the existing token.");
      }
    });
    return storedJwt;
  }

  logCore("Using valid JWT for bypass.");
  return storedJwt;
}

export function prewarmAuthenticationToken(): void {
  void getAuthenticationToken()
    .then(token => {
      if (!token) {
        warnCore("Authentication prewarm did not obtain a JWT.");
      }
    })
    .catch(error => {
      warnCore("Authentication prewarm failed:", error);
    });
}

// Managed keys for this provider
const MANAGED_KEYS = [
  "musixmatch-richsync",
  "musixmatch-synced",
  "lrclib-synced",
  "lrclib-plain",
  "legato-synced",
  "portato-richsynced",
  "bLyrics-richsynced",
  "bLyrics-synced",
  "binimum-richsynced",
  "binimum-synced",
  "metadata",
] as const;

const ISRC_REGEX = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

function normalizeIsrc(input: string): string | null {
  const candidate = input.trim().toUpperCase();
  return ISRC_REGEX.test(candidate) ? candidate : null;
}

function findIsrc(value: unknown, visited = new Set<unknown>(), depth = 0): string | null {
  if (value == null || depth > 6 || visited.has(value)) return null;
  if (typeof value === "string") return normalizeIsrc(value);
  if (typeof value !== "object") return null;

  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findIsrc(item, visited, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && key.toLowerCase().includes("isrc")) {
      const found = normalizeIsrc(item);
      if (found) return found;
    }
  }

  for (const item of Object.values(value)) {
    const found = findIsrc(item, visited, depth + 1);
    if (found) return found;
  }

  return null;
}

// Active streams map: videoId -> Promise that resolves when stream ends/fails
const activeStreams = new Map<string, Promise<void>>();

// Waiters map: videoId -> sourceKey -> resolve function
const waiters = new Map<string, Map<string, () => void>>();

function resolveWaiter(params: ProviderParameters, sourceKey: LyricSourceKey) {
  saveLyricsToCache(params, sourceKey).then(() => {
    const videoWaiters = waiters.get(params.videoId);
    if (videoWaiters) {
      const resolve = videoWaiters.get(sourceKey);
      if (resolve) {
        resolve();
        videoWaiters.delete(sourceKey);
      }
    }
  });
}

function resolveAllWaiters(videoId: string) {
  const videoWaiters = waiters.get(videoId);
  if (videoWaiters) {
    for (const resolve of videoWaiters.values()) {
      resolve();
    }
    waiters.delete(videoId);
  }
}

async function startStream(providerParameters: ProviderParameters, retryCount = 0): Promise<void> {
  const { song, artist, duration, album, alwaysFetchMetadata, signal, audioTrackData, videoId } = providerParameters;

  let jwt = await getAuthenticationToken(retryCount > 0);
  if (!jwt) {
    errorCore("Could not obtain authentication token. Aborting stream.");
    resolveAllWaiters(videoId);
    return;
  }

  const body = new URLSearchParams();
  body.append("videoId", videoId);
  if (song) body.append("song", song);
  if (artist) body.append("artist", artist);
  if (duration) body.append("duration", String(Math.round(duration)));
  if (album) body.append("album", album);
  body.append("alwaysFetchMetadata", String(alwaysFetchMetadata));
  const isrc = findIsrc(audioTrackData);
  if (isrc) body.append("isrc", isrc);
  body.append("token", jwt);

  let completedNormally = false;
  try {
    const response = await fetch(CUBEY_LYRICS_API_URL + "v2/lyrics", {
      method: "POST",
      body,
      signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    });

    if (response.status === 403 && retryCount < 1) {
      warnCore("Request blocked (403), retrying with new token.");
      await startStream(providerParameters, retryCount + 1);
      return;
    }

    if (!response.ok) {
      errorCore(`Stream API request failed: ${response.status}`);
      resolveAllWaiters(videoId);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      errorCore("No response body reader available.");
      resolveAllWaiters(videoId);
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (value) {
        buffer += decoder.decode(value, { stream: true });
        // Split by double newline (SSE message separator)
        const messages = buffer.split(/\n\n|\r\n\r\n/);
        // Keep the last partial message in the buffer
        buffer = messages.pop() || "";

        for (const message of messages) {
          await parseSSEMessage(message, providerParameters);
        }
      }

      if (done) {
        // Process any remaining data in the buffer
        if (buffer.trim()) {
          await parseSSEMessage(buffer, providerParameters);
        }
        completedNormally = true;
        break;
      }
    }
  } catch (err) {
    if (signal.aborted) {
      logCore("Stream aborted.");
    } else {
      errorCore("Stream error:", err);
    }
  } finally {
    // Ensure all waiters are resolved (cleared) when stream ends
    MANAGED_KEYS.forEach(key => {
      if (completedNormally && !providerParameters.sourceMap[key].filled) {
        providerParameters.sourceMap[key].filled = true;
      }
      resolveWaiter(providerParameters, key);
    });
    resolveAllWaiters(videoId);
    activeStreams.delete(videoId);
  }
}

/**
 * Parses a single SSE message block which may contain multiple lines (event, data, etc.)
 */
async function parseSSEMessage(message: string, params: ProviderParameters) {
  let currentEvent = "";
  let dataBuffer = "";
  const lines = message.split(/\r?\n/);

  for (const line of lines) {
    if (line.startsWith("event:")) {
      currentEvent = line.substring(line.indexOf(":") + 1).trim();
    } else if (line.startsWith("data:")) {
      dataBuffer += line.substring(line.indexOf(":") + 1).trim();
    }
  }

  if (dataBuffer) {
    try {
      if (dataBuffer === "[DONE]") return;
      const data = JSON.parse(dataBuffer);
      await processStreamData(currentEvent, data, params);
    } catch (e) {
      errorCore("Error parsing stream JSON:", e, "Event:", currentEvent, "Data:", dataBuffer);
    }
  }
}

async function processStreamData(event: string, data: any, params: ProviderParameters) {
  const { sourceMap } = params;
  const durationMs = params.duration * 1000;

  if (event === "metadata") {
    if (data.album && !params.album) params.album = data.album;
    if (data.song && params.song !== data.song) params.song = data.song;
    if (data.artist && params.artist !== data.artist) params.artist = data.artist;
    if (data.duration && params.duration !== Number(data.duration)) params.duration = Number(data.duration);

    sourceMap["metadata"].lyricSourceResult = {
      lyrics: null,
      source: "Metadata",
      sourceHref: "",
      album: data.album,
      artist: data.artist,
      song: data.song,
      duration: Number(data.duration),
      cacheAllowed: true,
    };
    sourceMap["metadata" as LyricSourceKey].filled = true;
    resolveWaiter(params, "metadata");
    return;
  }

  if (event === "provider") {
    const provider = data.provider;
    const results = data.results;

    if (!results) return;

    // Musixmatch
    if (provider === "musixmatch") {
      if (results.wordByWord) {
        const lyrics = parseLRC(results.wordByWord, durationMs);
        lrcFixers(lyrics);
        sourceMap["musixmatch-richsync"].lyricSourceResult = {
          lyrics,
          source: "Musixmatch",
          sourceHref: "https://www.musixmatch.com",
          musicVideoSynced: false,
          album: params.album || "",
          artist: params.artist,
          song: params.song,
          duration: params.duration,
          cacheAllowed: true,
        };
        sourceMap["musixmatch-richsync"].filled = true;
        resolveWaiter(params, "musixmatch-richsync");
      }

      if (results.synced) {
        const lyrics = parseLRC(results.synced, durationMs);
        sourceMap["musixmatch-synced"].lyricSourceResult = {
          lyrics,
          source: "Musixmatch",
          sourceHref: "https://www.musixmatch.com",
          musicVideoSynced: false,
        };
        sourceMap["musixmatch-synced"].filled = true;
        resolveWaiter(params, "musixmatch-synced");
      }
    }

    // LRCLib
    if (provider === "lrclib") {
      if (results.synced) {
        const lyrics = parseLRC(results.synced, durationMs);
        sourceMap["lrclib-synced"].lyricSourceResult = {
          lyrics,
          source: "LRCLib",
          sourceHref: "https://lrclib.net",
          musicVideoSynced: false,
        };
        sourceMap["lrclib-synced"].filled = true;
        resolveWaiter(params, "lrclib-synced");
      }

      if (results.plain) {
        const lyrics = PlainParser.parse(results.plain);
        sourceMap["lrclib-plain"].lyricSourceResult = {
          lyrics,
          source: "LRCLib",
          sourceHref: "https://lrclib.net",
          musicVideoSynced: false,
          cacheAllowed: false,
        };
        sourceMap["lrclib-plain"].filled = true;
        resolveWaiter(params, "lrclib-plain");
      }
    }

    // Legato (KuGou)
    if (provider === "kugou") {
      if (results.lyrics) {
        let decodedLyrics = JSON.parse(results.lyrics);
        const lyrics = parseLRC(decodedLyrics.lyrics, durationMs);
        sourceMap["legato-synced"].lyricSourceResult = {
          lyrics,
          source: "Better Lyrics Legato",
          sourceHref: HOMEPAGE_URL,
          musicVideoSynced: false,
        };
        sourceMap["legato-synced"].filled = true;
        resolveWaiter(params, "legato-synced");
      }
    }

    // Portato (QQ)
    if (provider === "qq") {
      if (results.lyrics) {
        let decodedLyrics = JSON.parse(results.lyrics);
        const lyrics = parseQRC(decodedLyrics.lyrics, durationMs, {
          title: params.song,
          artist: params.artist,
        });
        if (lyrics.length > 0) {
          sourceMap["portato-richsynced"].lyricSourceResult = {
            lyrics,
            source: "Better Lyrics Portato",
            sourceHref: HOMEPAGE_URL,
            musicVideoSynced: false,
            cacheAllowed: true,
          };
        }
        sourceMap["portato-richsynced"].filled = true;
        resolveWaiter(params, "portato-richsynced");
      }
    }

    // BetterLyrics (TTML)
    if (provider === "golyrics") {
      if (results.lyrics) {
        let ttml = results.lyrics;
        try {
          // Check if it's double-encoded JSON
          const parsed = JSON.parse(ttml);
          if (parsed.ttml) ttml = parsed.ttml;
        } catch (_e) {
          // Not double-encoded, use as is
        }
        fillTtml(ttml, params);
        // fillTtml marks filled and updates sourceMap directly
        resolveWaiter(params, "bLyrics-synced");
        resolveWaiter(params, "bLyrics-richsynced");
      }
    }

    // Binimum (TTML via BiniLyrics)
    if (provider === "binimum") {
      if (results.lyrics) {
        fillTtml(results.lyrics, params, {
          richsyncKey: "binimum-richsynced",
          syncedKey: "binimum-synced",
          source: "BiniLyrics",
          sourceHref: "https://lyrics-api.binimum.org/",
        });

        const timingType: "syllable" | "line" | null = results.timingType ?? null;
        if (timingType === "syllable") {
          if (!sourceMap["binimum-richsynced"].lyricSourceResult) {
            sourceMap["binimum-richsynced"].lyricSourceResult = sourceMap["binimum-synced"].lyricSourceResult;
            sourceMap["binimum-synced"].lyricSourceResult = null;
          }
        } else if (timingType === "line") {
          if (!sourceMap["binimum-synced"].lyricSourceResult) {
            sourceMap["binimum-synced"].lyricSourceResult = sourceMap["binimum-richsynced"].lyricSourceResult;
          }
          sourceMap["binimum-richsynced"].lyricSourceResult = null;
        }

        resolveWaiter(params, "binimum-richsynced");
        resolveWaiter(params, "binimum-synced");
      }
    }
  }
}

/**
 * Unified provider entry point.
 * Ensures the stream is running and waits for the specific source to be filled.
 */
export default async function unified(
  providerParameters: ProviderParameters,
  targetSource: LyricSourceKey
): Promise<void> {
  const { videoId } = providerParameters;

  // If already filled, return immediately (should be handled by getLyrics, but good for safety)
  if (providerParameters.sourceMap[targetSource].filled) {
    return;
  }

  // Ensure stream is running
  if (!activeStreams.has(videoId)) {
    const streamPromise = startStream(providerParameters);
    activeStreams.set(videoId, streamPromise);
    // Note: We don't await the stream promise itself, as it resolves when the stream *ends*
  }

  // Register waiter
  return new Promise<void>(resolve => {
    // Double check if it got filled while we were setting up
    if (providerParameters.sourceMap[targetSource].filled) {
      resolve();
      return;
    }

    let videoWaiters = waiters.get(videoId);
    if (!videoWaiters) {
      videoWaiters = new Map();
      waiters.set(videoId, videoWaiters);
    }
    videoWaiters.set(targetSource, resolve);
  });
}
