import { bufferToBase64, canonicalJson, ECDSA_PARAMS, getIdentity, HASH_ALGORITHM } from "../store/keyIdentity";
import { UNISON_API_URL } from "@/core/constants";
import type { CLyricsData } from "./clyrics-types";
import { convertFormat } from "./clyricsManager";

export enum LyricFormatType {
    TTML = "ttml",
    LRC = "lrc",
    PLAIN = "plain"
}

export enum LyricSyncType {
    /** Word/syllable lyric synchronization */
    RICH = "richsync",
    /** Line lyric synchronization */
    LINE = "linesync",
    /** Manual scrolling unsynced lyric */
    PLAIN = "plain"
}

export enum ProviderPublisher {
    UNISON = "unison",
    LRCLIB = "lrclib",
}

export interface UnisonLyricsSubmission {
	videoId: string
	song: string
	artist: string
	album?: string
	duration: number
	lyrics: string
	format: LyricFormatType
	language?: string
	syncType?: LyricSyncType
}

function verifyNonce(result: Uint8Array, target: Uint8Array) {
    if (result.length !== target.length) {
        return false;
    }

    for (let i = 0; i < result.length - 1; i++) {
        if (result[i] > target[i]) {
            return false;
        } else if (result[i] < target[i]) {
            break;
        }
    }

    return true;
}

function hexToBytes(hex: string) {
    if (hex.length % 2 !== 0) {
        throw new Error("Invalid hex string");
    }

    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

async function solveLRCLIBchallenge(prefix: string, targetHex: string) {
    let nonce = 0;
    const target = hexToBytes(targetHex);

    while (true) {
        const input = `${prefix}${nonce}`;
        const inputBytes = new TextEncoder().encode(input);

        const hashBuffer = await crypto.subtle.digest("SHA-256", inputBytes);

        const hashed = new Uint8Array(hashBuffer);

        const result = verifyNonce(hashed, target);
        if (result) { break; }
        else { nonce++; }
    }

    return nonce.toString();
}

export async function publishLyrics(clyrics: CLyricsData, type: LyricFormatType, syncType: LyricSyncType, provider: ProviderPublisher) {
    if (!Object.values(LyricFormatType).find(v => v == type) || !Object.values(LyricSyncType).find(v => v == syncType)) {
        return false;
    }

    if (type == LyricFormatType.TTML && provider == ProviderPublisher.LRCLIB) {
        return false;
    }

    if (provider == ProviderPublisher.UNISON) {
        const identity = await getIdentity();
        const lyricStr = convertFormat(clyrics, type, syncType);
        if (!lyricStr) { return false; }
        
        const payload = {
            keyId: identity.keyId,
            timestamp: Date.now(),
            nonce: crypto.randomUUID(),
            
            videoId: clyrics.videoId,
            song: clyrics.song,
            artist: clyrics.artist,
            album: clyrics.album,
            duration: clyrics.duration,
            lyrics: lyricStr,
            format: type,
            language: clyrics.language,
            syncType: syncType
        }
        
        const payloadString = canonicalJson(payload);
        const payloadBuffer = new TextEncoder().encode(payloadString);
    
        const privateKey = await crypto.subtle.importKey("jwk", identity.privateKey, ECDSA_PARAMS, false, ["sign"]);
        const signatureBuffer = await crypto.subtle.sign({ name: "ECDSA", hash: HASH_ALGORITHM }, privateKey, payloadBuffer);
        
        const response = await fetch(UNISON_API_URL + "/submit", {
            method: "POST",
            body: JSON.stringify({
                payload,
                signature: bufferToBase64(signatureBuffer),
                publicKey: identity.publicKey
            })
        })
        return {
            success: response.ok,
            status: response.status,
            statusText: response.statusText,
        };
    } else if (provider == ProviderPublisher.LRCLIB) {

    }

    return false;
}