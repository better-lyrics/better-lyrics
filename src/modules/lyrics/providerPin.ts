import { PROVIDER_CONFIGS, PROVIDER_PIN_STORAGE_PREFIX } from "@constants";
import { logError } from "@core/logger";
import { getTransientStorage, setPersistentStorage } from "@core/storage";
import type { LyricSourceKey } from "@modules/lyrics/providers/shared";

function pinKey(videoId: string): string {
  return `${PROVIDER_PIN_STORAGE_PREFIX}${videoId}`;
}

interface ProviderPin {
  key: LyricSourceKey;
  unisonLyricsId: number | null;
}

export interface UnisonLyric {
  key: LyricSourceKey;
  lyricsId: number;
}

function providerName(key: LyricSourceKey): string | undefined {
  return PROVIDER_CONFIGS.find(config => config.key === key)?.displayName;
}

function sameProvider(a: LyricSourceKey, b: LyricSourceKey): boolean {
  return a === b || providerName(a) === providerName(b);
}

export function orderByPin(priority: LyricSourceKey[], pinned: LyricSourceKey | null): LyricSourceKey[] {
  if (!pinned || !priority.includes(pinned)) return priority;
  const siblings = priority.filter(key => key !== pinned && sameProvider(key, pinned));
  return [pinned, ...siblings, ...priority.filter(key => !sameProvider(key, pinned))];
}

export function pinnedVariants(priority: LyricSourceKey[], pinned: LyricSourceKey): LyricSourceKey[] {
  return priority.filter(key => sameProvider(key, pinned));
}

export function unisonRanksAbove(priority: LyricSourceKey[], pinned: LyricSourceKey): boolean {
  const pinnedRank = priority.indexOf(pinned);
  return !isUnisonKey(pinned) && priority.slice(0, Math.max(pinnedRank, 0)).some(isUnisonKey);
}

export function keepsPin(pinned: LyricSourceKey, loaded: LyricSourceKey | undefined): boolean {
  return loaded !== undefined && sameProvider(loaded, pinned);
}

export function pinForPick(key: LyricSourceKey, available: LyricSourceKey[]): LyricSourceKey | null {
  return key === available[0] ? null : key;
}

export function isUnisonKey(key: LyricSourceKey): boolean {
  return sameProvider(key, "unison-richsynced");
}

export function pinWithVote(
  pinned: LyricSourceKey | null,
  unisonVote: number | null | undefined
): LyricSourceKey | null {
  return pinned && isUnisonKey(pinned) && unisonVote === -1 ? null : pinned;
}

export function unisonOverride(
  priority: LyricSourceKey[],
  pin: ProviderPin,
  unison: UnisonLyric | null
): LyricSourceKey | null {
  if (!unison || isUnisonKey(pin.key) || unison.lyricsId === pin.unisonLyricsId) return null;
  const unisonRank = priority.indexOf(unison.key);
  return unisonRank !== -1 && unisonRank < priority.indexOf(pin.key) ? unison.key : null;
}

export async function loadProviderPin(videoId: string): Promise<ProviderPin | null> {
  const saved = await getTransientStorage(pinKey(videoId));
  return saved && typeof saved.key === "string" ? (saved as ProviderPin) : null;
}

export async function saveProviderPin(videoId: string, pin: ProviderPin | null): Promise<void> {
  if (pin) {
    await setPersistentStorage(pinKey(videoId), pin);
    return;
  }
  try {
    await chrome.storage.local.remove(pinKey(videoId));
  } catch (error) {
    logError(error);
  }
}
