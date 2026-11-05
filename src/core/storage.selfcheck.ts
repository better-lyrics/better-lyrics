import assert from "node:assert/strict";

const local: Record<string, unknown> = {};
const sync: Record<string, unknown> = {};
const failures = { localRemove: false, syncSet: false };
Object.assign(globalThis, {
  chrome: {
    storage: {
      local: {
        get: async () => ({ ...local }),
        getBytesInUse: async (keys?: string[] | null) =>
          (keys ?? Object.keys(local)).reduce(
            (sum, key) => (key in local ? sum + key.length + JSON.stringify(local[key]).length : sum),
            0
          ),
        remove: async (keys: string[]) => {
          if (failures.localRemove) throw new Error("local remove failed");
          for (const key of keys) delete local[key];
        },
      },
      sync: {
        set: async (items: Record<string, unknown>) => {
          if (failures.syncSet) throw new Error("sync set failed");
          Object.assign(sync, items);
        },
      },
    },
  },
});

const {
  clearLyricCache,
  getStorageBreakdown,
  getUpdatedCacheInfo,
  refreshCacheInfo,
  storageCategoryForKey,
  summarizeLyricCache,
} = await import("@core/storage");
const { compressString } = await import("@core/compression");

const entry = { type: "transient", value: "x", expiry: 0 };
const seed = (items: Record<string, unknown>): void => {
  for (const key of Object.keys(local)) delete local[key];
  Object.assign(local, items);
};

// -- Happy paths --------------------------
{
  seed({
    "blyrics_abcdefghijk_bLyrics-richsynced": entry,
    "blyrics_abcdefghijk_lrclib-synced": entry,
    "blyrics_zyxwvutsrqp_yt-lyrics": entry,
    blyrics_featured_themes: { themes: [] },
    blyrics_stableReleaseCheck: { checkedAt: 1 },
    userIdentity: { keyId: "k" },
  });
  const info = await getUpdatedCacheInfo();
  assert.equal(info.count, 2, "counts unique songs across lyric cache keys");
  assert.equal(info.size, JSON.stringify(entry).length * 3, "size covers only lyric cache keys");

  await clearLyricCache();
  assert.deepEqual(
    Object.keys(local).sort(),
    ["blyrics_featured_themes", "blyrics_stableReleaseCheck", "userIdentity"],
    "clearing lyrics keeps featured themes, the release check and identity"
  );
  assert.deepEqual(sync.cacheInfo, { count: 0, size: 0 }, "the stored stat is refreshed after clearing");
}

// -- Edge cases --------------------------
{
  seed({ blyrics_featured_themes: { themes: [] }, blyrics_stableReleaseCheck: { checkedAt: 1 } });
  assert.deepEqual(
    await getUpdatedCacheInfo(),
    { count: 0, size: 0 },
    "only non-lyric caches: the stat reads as empty, matching nothing to clear"
  );

  seed({ blyrics_abcdefghijk_metadata: entry });
  const metaOnly = await getUpdatedCacheInfo();
  assert.equal(metaOnly.count, 1, "cached song metadata counts as a cached song");
  await clearLyricCache();
  assert.deepEqual(Object.keys(local), [], "cached song metadata is cleared with the lyrics");

  seed({ "blyrics__yt-lyrics": entry, "blyrics_yt-lyrics": entry });
  assert.deepEqual(await getUpdatedCacheInfo(), { count: 0, size: 0 }, "keys without a video id are not lyric caches");

  seed({ "other_abcdefghijk_yt-lyrics": entry });
  assert.deepEqual(await getUpdatedCacheInfo(), { count: 0, size: 0 }, "keys without the cache prefix are ignored");
}

// -- Invariants --------------------------
{
  seed({ "blyrics_abcdefghijk_yt-lyrics": entry, blyrics_featured_themes: {} });
  await clearLyricCache();
  await clearLyricCache();
  assert.deepEqual(Object.keys(local), ["blyrics_featured_themes"], "clearing twice is idempotent");
}

// -- Error paths --------------------------
{
  seed({ "blyrics_abcdefghijk_yt-lyrics": entry, blyrics_featured_themes: {} });
  sync.cacheInfo = { count: 1, size: 99 };
  failures.syncSet = true;
  const cleared = await clearLyricCache();
  failures.syncSet = false;
  assert.deepEqual(
    Object.keys(local),
    ["blyrics_featured_themes"],
    "regression: a failed stat refresh still counts as cleared once the lyrics are removed"
  );
  assert.deepEqual(
    cleared,
    { count: 0, size: 0 },
    "regression: the clear returns the cleared stats even when saving them fails"
  );
  assert.deepEqual(
    sync.cacheInfo,
    { count: 1, size: 99 },
    "the stale saved copy is why callers render the returned stats"
  );

  seed({ "blyrics_abcdefghijk_yt-lyrics": entry });
  failures.syncSet = true;
  const current = await refreshCacheInfo();
  failures.syncSet = false;
  assert.deepEqual(
    current,
    { count: 1, size: JSON.stringify(entry).length },
    "a refresh returns the computed stats when saving them fails"
  );

  seed({ "blyrics_abcdefghijk_yt-lyrics": entry });
  failures.localRemove = true;
  await assert.rejects(clearLyricCache(), /local remove failed/, "a failed removal rejects");
  failures.localRemove = false;
}

// -- Storage categories --------------------------
{
  assert.equal(storageCategoryForKey("blyrics_abcdefghijk_bLyrics-richsynced"), "lyrics");
  assert.equal(storageCategoryForKey("blyrics_abcdefghijk_metadata"), "lyrics", "metadata belongs to the lyric cache");
  assert.equal(storageCategoryForKey("storeTheme:abc"), "themes");
  assert.equal(storageCategoryForKey("storeThemeIndex"), "themes");
  assert.equal(storageCategoryForKey("customThemes"), "themes");
  assert.equal(storageCategoryForKey("customCSS"), "themes");
  assert.equal(storageCategoryForKey("customCSS_chunk_3"), "themes");
  assert.equal(storageCategoryForKey("customCSS_chunked"), "themes", "regression: chunk bookkeeping is theme storage");
  assert.equal(storageCategoryForKey("customCSS_chunkCount"), "themes");
  assert.equal(storageCategoryForKey("cssCompressed"), "themes");
  assert.equal(storageCategoryForKey("userThemeRatings"), "themes");
  assert.equal(storageCategoryForKey("userThemeInstalls"), "themes");
  assert.equal(storageCategoryForKey("blyrics_featured_themes"), "themes");
  assert.equal(storageCategoryForKey("blyricsOffset_abc_bLyrics-synced"), "offsets");
  assert.equal(storageCategoryForKey("jwtToken"), "other");
  assert.equal(storageCategoryForKey("userIdentity"), "other");
  assert.equal(storageCategoryForKey("blyrics_stableReleaseCheck"), "other", "a blyrics_ prefix alone is not lyrics");
  assert.equal(storageCategoryForKey(""), "other");
}

// -- Lyric cache summary --------------------------
{
  const lyric = (body: object) => ({ type: "transient", value: compressString(JSON.stringify(body)), expiry: 0 });
  const missing = lyric({ version: 1, missing: true });
  const found = lyric({ version: 1, lyrics: [{ words: "hi", startTimeMs: 0, durationMs: 1 }] });
  const summary = summarizeLyricCache({
    "blyrics_aaaaaaaaaaa_bLyrics-richsynced": missing,
    "blyrics_aaaaaaaaaaa_lrclib-synced": found,
    blyrics_aaaaaaaaaaa_metadata: found,
    "blyrics_bbbbbbbbbbb_musixmatch-richsync": found,
    "blyrics_bbbbbbbbbbb_yt-lyrics": found,
    "blyrics_ccccccccccc_bLyrics-richsynced": missing,
    "blyrics_ddddddddddd_yt-lyrics": found,
    blyrics_eeeeeeeeeee_metadata: found,
    blyrics_featured_themes: { themes: [] },
  });
  assert.equal(summary.songs, 3, "counts songs with at least one real lyric entry");
  assert.deepEqual(
    summary.bySyncType,
    { syllable: 0, word: 1, line: 1, unsynced: 1 },
    "each song counts once, at its best sync type"
  );
}

// -- Lyric cache summary: edge cases --------------------------
{
  const body = JSON.stringify({ version: 1, lyrics: [] });
  assert.equal(
    summarizeLyricCache({
      "blyrics_aaaaaaaaaaa_lrclib-synced": { type: "transient", value: body, expiry: Date.now() - 1 },
    }).songs,
    0,
    "regression: expired entries waiting for the purge are not cached lyrics"
  );
  assert.equal(
    summarizeLyricCache({
      "blyrics_aaaaaaaaaaa_lrclib-synced": { type: "transient", value: body, expiry: Date.now() + 60_000 },
    }).songs,
    1,
    "unexpired entries count"
  );
  assert.deepEqual(summarizeLyricCache({}), { songs: 0, bySyncType: { syllable: 0, word: 0, line: 0, unsynced: 0 } });
  const legacy = { type: "transient", value: "not json", expiry: 0 };
  assert.equal(
    summarizeLyricCache({ "blyrics_aaaaaaaaaaa_lrclib-synced": legacy }).songs,
    1,
    "unreadable entries still count as lyrics"
  );
  const missingPlain = { type: "transient", value: JSON.stringify({ missing: true }), expiry: 0 };
  assert.equal(
    summarizeLyricCache({ "blyrics_aaaaaaaaaaa_lrclib-synced": missingPlain }).songs,
    0,
    "uncompressed misses are misses too"
  );
}

// -- Storage breakdown --------------------------
{
  seed({
    "blyrics_aaaaaaaaaaa_lrclib-synced": entry,
    "storeTheme:abc": { css: "a{}" },
    "blyricsOffset_aaaaaaaaaaa_lrclib-synced": entry,
    jwtToken: "t",
  });
  const breakdown = await getStorageBreakdown();
  const bytes = (key: string) => key.length + JSON.stringify(local[key]).length;
  assert.equal(breakdown.lyrics.songs, 1);
  assert.deepEqual(breakdown.bytes, {
    lyrics: bytes("blyrics_aaaaaaaaaaa_lrclib-synced"),
    themes: bytes("storeTheme:abc"),
    offsets: bytes("blyricsOffset_aaaaaaaaaaa_lrclib-synced"),
    other: bytes("jwtToken"),
  });
  assert.equal(
    breakdown.totalBytes,
    Object.values(breakdown.bytes).reduce((a, b) => a + b, 0),
    "total is the sum of the categories"
  );

  const storageLocal = (globalThis as unknown as { chrome: { storage: { local: Record<string, unknown> } } }).chrome
    .storage.local;
  const getBytesInUse = storageLocal.getBytesInUse;
  delete storageLocal.getBytesInUse;
  const estimated = await getStorageBreakdown();
  storageLocal.getBytesInUse = getBytesInUse;
  assert.deepEqual(estimated.bytes, breakdown.bytes, "without getBytesInUse (Firefox before 144) bytes are estimated");
}
{
  seed({});
  const empty = await getStorageBreakdown();
  assert.equal(empty.totalBytes, 0);
  assert.equal(empty.lyrics.songs, 0);
}

console.log("storage self-check passed");
