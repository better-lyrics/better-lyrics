// DOM Class Names
export const TITLE_CLASS: string = "title ytmusic-player-bar";
export const SUBTITLE_CLASS: string = "subtitle style-scope ytmusic-player-bar";
export const TAB_HEADER_CLASS: string = "tab-header style-scope ytmusic-player-page";
export const TAB_CONTENT_CLASS: string = "tab-content style-scope tp-yt-paper-tab";
export const LYRICS_CLASS: string = "blyrics-container";
export const CURRENT_LYRICS_CLASS: string = "blyrics--active";
export const ZERO_DURATION_ANIMATION_CLASS: string = "blyrics-zero-dur-animate";
export const RTL_CLASS: string = "blyrics-rtl";
export const WORD_CLASS: string = "blyrics--word";
export const BACKGROUND_LYRIC_CLASS = "blyrics-background-lyric";
export const ANIMATING_CLASS: string = "blyrics--animating";
export const PRE_ANIMATING_CLASS: string = "blyrics--pre-animating";
export const USER_SCROLLING_CLASS: string = "blyrics-user-scrolling";
export const TRANSLATED_LYRICS_CLASS: string = "blyrics--translated";
export const ROMANIZED_LYRICS_CLASS: string = "blyrics--romanized";
export const ERROR_LYRICS_CLASS: string = "blyrics--error";
export const FOOTER_CLASS: string = "blyrics-footer";
export const WATERMARK_CLASS: string = "blyrics-watermark";
export const TIME_INFO_CLASS: string = "time-info style-scope ytmusic-player-bar";

// DOM Selectors
export const SONG_IMAGE_SELECTOR: string = "#song-image>#thumbnail>#img";
export const TAB_RENDERER_SELECTOR: string = "#tab-renderer";
export const NO_LYRICS_TEXT_SELECTOR: string =
  "#tab-renderer > ytmusic-message-renderer > yt-formatted-string.text.style-scope.ytmusic-message-renderer";

// DOM IDs and Attributes
export const LYRICS_LOADER_ID: string = "blyrics-loader";
export const LYRICS_WRAPPER_ID: string = "blyrics-wrapper";
export const LYRICS_SPACING_ELEMENT_ID: string = "blyrics-spacing-element";
export const LYRICS_DISABLED_ATTR: string = "blyrics-dfs";
export const LYRICS_STYLIZED_ATTR: string = "blyrics-stylized";
export const LYRICS_RTL_ATTR: string = "blyrics-rtl-enabled";

// Assets and Resources
export const DISCORD_LOGO_SRC: string =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiPjxwYXRoIGZpbGw9IiNhYWEiIGQ9Ik0xOS4yNyA1LjMzQzE3Ljk0IDQuNzEgMTYuNSA0LjI2IDE1IDRhLjA5LjA5IDAgMCAwLS4wNy4wM2MtLjE4LjMzLS4zOS43Ni0uNTMgMS4wOWExNi4wOSAxNi4wOSAwIDAgMC00LjggMGMtLjE0LS4zNC0uMzUtLjc2LS41NC0xLjA5Yy0uMDEtLjAyLS4wNC0uMDMtLjA3LS4wM2MtMS41LjI2LTIuOTMuNzEtNC4yNyAxLjMzYy0uMDEgMC0uMDIuMDEtLjAzLjAyYy0yLjcyIDQuMDctMy40NyA4LjAzLTMuMSAxMS45NWMwIC4wMi4wMS4wNC4wMy4wNWMxLjggMS4zMiAzLjUzIDIuMTIgNS4yNCAyLjY1Yy4wMy4wMS4wNiAwIC4wNy0uMDJjLjQtLjU1Ljc2LTEuMTMgMS4wNy0xLjc0Yy4wMi0uMDQgMC0uMDgtLjA0LS4wOWMtLjU3LS4yMi0xLjExLS40OC0xLjY0LS43OGMtLjA0LS4wMi0uMDQtLjA4LS4wMS0uMTFjLjExLS4wOC4yMi0uMTcuMzMtLjI1Yy4wMi0uMDIuMDUtLjAyLjA3LS4wMWMzLjQ0IDEuNTcgNy4xNSAxLjU3IDEwLjU1IDBjLjAyLS4wMS4wNS0uMDEuMDcuMDFjLjExLjA5LjIyLjE3LjMzLjI2Yy4wNC4wMy4wNC4wOS0uMDEuMTFjLS41Mi4zMS0xLjA3LjU2LTEuNjQuNzhjLS4wNC4wMS0uMDUuMDYtLjA0LjA5Yy4zMi42MS42OCAxLjE5IDEuMDcgMS43NGMuMDMuMDEuMDYuMDIuMDkuMDFjMS43Mi0uNTMgMy40NS0xLjMzIDUuMjUtMi42NWMuMDItLjAxLjAzLS4wMy4wMy0uMDVjLjQ0LTQuNTMtLjczLTguNDYtMy4xLTExLjk1Yy0uMDEtLjAxLS4wMi0uMDItLjA0LS4wMk04LjUyIDE0LjkxYy0xLjAzIDAtMS44OS0uOTUtMS44OS0yLjEycy44NC0yLjEyIDEuODktMi4xMmMxLjA2IDAgMS45Ljk2IDEuODkgMi4xMmMwIDEuMTctLjg0IDIuMTItMS44OSAyLjEybTYuOTcgMGMtMS4wMyAwLTEuODktLjk1LTEuODktMi4xMnMuODQtMi4xMiAxLjg5LTIuMTJjMS4wNiAwIDEuOS45NiAxLjg5IDIuMTJjMCAxLjE3LS44MyAyLjEyLTEuODkgMi4xMiIvPjwvc3ZnPg==";
export const EMPTY_THUMBNAIL_SRC: string =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
export const FONT_LINK: string = "https://api.fontshare.com/v2/css?f[]=satoshi@1&display=swap";
export const NOTO_SANS_UNIVERSAL_LINK: string =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@100..900&family=Noto+Sans+Armenian:wght@100..900&family=Noto+Sans+Bengali:wght@100..900&family=Noto+Sans+Devanagari:wght@100..900&family=Noto+Sans+Georgian:wght@100..900&family=Noto+Sans+Gujarati:wght@100..900&family=Noto+Sans+HK:wght@100..900&family=Noto+Sans+Hebrew:wght@100..900&family=Noto+Sans+JP:wght@100..900&family=Noto+Sans+KR:wght@100..900&family=Noto+Sans+Kannada:wght@100..900&family=Noto+Sans+Khmer:wght@100..900&family=Noto+Sans+Lao+Looped:wght@100..900&family=Noto+Sans+Lao:wght@100..900&family=Noto+Sans+Malayalam:wght@100..900&family=Noto+Sans+Marchen&family=Noto+Sans+Meetei+Mayek:wght@100..900&family=Noto+Sans+Multani&family=Noto+Sans+NKo&family=Noto+Sans+Old+Permic&family=Noto+Sans+SC:wght@100..900&family=Noto+Sans+Shavian&family=Noto+Sans+Sinhala:wght@100..900&family=Noto+Sans+Sunuwar&family=Noto+Sans+TC:wght@100..900&family=Noto+Sans+Takri&family=Noto+Sans+Tamil:wght@100..900&family=Noto+Sans+Telugu:wght@100..900&family=Noto+Sans+Thai+Looped:wght@100..900&family=Noto+Sans+Thai:wght@100..900&family=Noto+Sans+Vithkuqi:wght@400..700&family=Noto+Sans+Warang+Citi&family=Noto+Sans:ital,wght@0,100..900;1,100..900&family=Roboto:ital,wght@0,100..900;1,100..900&display=swap";

// API URLs and Functions
export const LYRICS_API_URL: string = "https://lyrics-api-go-better-lyrics-api-pr-12.up.railway.app/getLyrics";
export const DISCORD_INVITE_URL: string = "https://discord.gg/UsHE3d5fWF";
export const LRCLIB_API_URL: string = "https://lrclib.net/api/get";
export const LRCLIB_UPLOAD_URL: string = "https://lrclibup.boidu.dev/";
export const LRCLIB_CLIENT_HEADER: string = "BetterLyrics Extension (https://github.com/better-lyrics/better-lyrics)";
export const TRANSLATE_LYRICS_URL = function (lang: string, text: string): string {
  return `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;
};
export const TRANSLATE_IN_ROMAJI = function (lang: string, text: string): string {
  return `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${lang}&tl=${lang}-Latn&dt=t&dt=rm&q=${encodeURIComponent(text)}`;
};

// Supported Languages
export const romanizationLanguages: string[] = [
  "ja", // Japanese - Romaji
  "ru", // Russian - Romanization
  "ko", // Korean - Romanization
  "zh-CN", // Simplified Chinese - Pinyin
  "zh-TW", // Traditional Chinese - Pinyin
  // "hi" , // Hindi
  "zh", // Chinese
  "bn", // Bengali - Romanization
  "th", // Thai - Romanization
  "el", // Greek - Romanization
  "he", // Hebrew - Romanization
  "ar", // Arabic - Romanization
  "ta", // Tamil - Romanization
  "te", // Telugu - Romanization
  "ml", // Malayalam - Romanization
  "kn", // Kannada - Romanization
  "gu", // Gujarati - Romanization
  "pa", // Punjabi - Romanization
  "mr", // Marathi - Romanization
  "ur", // Urdu - Romanization
  "si", // Sinhala - Romanization
  "my", // Burmese - Romanization
  "ka", // Georgian - Romanization
  "km", // Khmer - Romanization
  "lo", // Lao - Romanization
  "fa", // Persian - Romanization
];

// Log Prefixes
export const LOG_PREFIX: string = "[BetterLyrics]";
export const IGNORE_PREFIX: string = "(Safe to ignore)";

// Initialization and General Logs
export const INITIALIZE_LOG: string =
  "%c[BetterLyrics] Loaded Successfully. Logs are enabled by default. You can disable them in the extension options.";
export const GENERAL_ERROR_LOG: string = "[BetterLyrics] Error:";

// Lyrics Fetch and Processing Logs
export const FETCH_LYRICS_LOG: string = "[BetterLyrics] Fetching lyrics for:";
export const LYRICS_FOUND_LOG: string = "[BetterLyrics] Lyrics found, injecting into the page";
export const NO_LYRICS_FOUND_LOG: string = "[BetterLyrics] No lyrics found for the current song";
export const LYRICS_CACHE_FOUND_LOG: string = "[BetterLyrics] Lyrics found in cache, skipping backend fetch";
export const LYRICS_LEGACY_LOG: string = "[BetterLyrics] Using legacy method to fetch song info";
export const LRCLIB_LYRICS_FOUND_LOG: string = "[BetterLyrics] Lyrics found from LRCLIB";
export const NO_LRCLIB_LYRICS_FOUND_LOG: string = "[BetterLyrics] No lyrics found on LRCLIB";
export const PROVIDER_SWITCHED_LOG: string = "[BetterLyrics] Switching to provider = ";

// UI State Logs
export const LYRICS_TAB_HIDDEN_LOG: string =
  "[BetterLyrics] (Safe to ignore) Lyrics tab is hidden, skipping lyrics fetch";
export const LYRICS_TAB_VISIBLE_LOG: string = "[BetterLyrics] Lyrics tab is visible, fetching lyrics";
export const LYRICS_TAB_CLICKED_LOG: string = "[BetterLyrics] Lyrics tab clicked, fetching lyrics";
export const LYRICS_WRAPPER_NOT_VISIBLE_LOG: string =
  "[BetterLyrics] (Safe to ignore) Lyrics wrapper is not visible, unable to inject lyrics";
export const LYRICS_WRAPPER_CREATED_LOG: string = "[BetterLyrics] Lyrics wrapper created";
export const FOOTER_NOT_VISIBLE_LOG: string =
  "[BetterLyrics] (Safe to ignore) Footer is not visible, unable to inject source link";
export const LYRICS_TAB_NOT_DISABLED_LOG: string =
  "[BetterLyrics] (Safe to ignore) Lyrics tab is not disabled, unable to enable it";
export const SONG_SWITCHED_LOG: string = "[BetterLyrics] Song has been switched";
export const ALBUM_ART_ADDED_LOG: string = "[BetterLyrics] Album art added to the layout";
export const ALBUM_ART_ADDED_FROM_MUTATION_LOG: string =
  "[BetterLyrics] Album art added to the layout from mutation event";
export const ALBUM_ART_REMOVED_LOG: string = "[BetterLyrics] Album art removed from the layout";
export const LOADING_WITHOUT_SONG_META: string = "[BetterLyrics] Trying to load without Song/Artist info";
export const SKIPPING_LOAD_WITH_META: string = "[BetterLyrics] Skipping Reload From Metadata Available: Already Loaded";
export const LOADER_TRANSITION_ENDED: string = "[BetterLyrics] Loader Transition Ended";
export const LOADER_ANIMATION_END_FAILED: string = "[BetterLyrics] Loader Animation Didn't End";
export const LOADER_FOUND_LOG: string = "[BetterLyrics] Found Loader, waiting for completion";
export const LOADER_NOT_FOUND_LOG: string = "[BetterLyrics] Timed out waiting for loader";
export const LOADER_FINISHED_LOG: string = "[BetterLyrics] Loader completed successfully";
export const PAUSING_LYRICS_SCROLL_LOG: string = "[BetterLyrics] Pausing Lyrics Autoscroll Due to User Scroll";

// Feature State Logs
export const AUTO_SWITCH_ENABLED_LOG: string = "[BetterLyrics] Auto switch enabled, switching to lyrics tab";
export const TRANSLATION_ENABLED_LOG: string = "[BetterLyrics] Translation enabled, translating lyrics. Language: ";
export const TRANSLATION_ERROR_LOG: string = "[BetterLyrics] Unable to translate lyrics due to error";
export const SYNC_DISABLED_LOG: string =
  "[BetterLyrics] Syncing lyrics disabled due to all lyrics having a start time of 0";
export const YT_MUSIC_LYRICS_AVAILABLE_LOG: string =
  "[BetterLyrics] Lyrics are available on the page & backend failed to fetch lyrics";
export const LOADER_ACTIVE_LOG: string = "[BetterLyrics] (Safe to ignore) Loader is active, skipping lyrics sync";

// Error and Storage Logs
export const HTTP_ERROR_LOG: string = "[BetterLyrics] HTTP Error:";
export const SERVER_ERROR_LOG: string = "[BetterLyrics] Server Error:";
export const CACHE_PROCESS_ERROR_LOG: string = "[BetterLyrics] Error caching and processing lyrics";
export const PURGE_LOG: string = "[BetterLyrics] Purged key from storage: ";
export const STORAGE_TRANSIENT_SET_LOG: string = "[BetterLyrics] Set transient storage for key: ";
export const STORAGE_TRANSIENT_GET_LOG: string = "[BetterLyrics] Get transient storage for key: ";
export const NO_LYRICS_ELEMENT_LOG: string =
  "[BetterLyrics] No lyrics element found on the page, skipping lyrics injection";
export const INVALID_SONG_ARTIST_LOG: string = "[BetterLyrics] Invalid song or artist data";
export const EMPTY_SONG_ARTIST_LOG: string = "[BetterLyrics] Empty song or artist name";
export const CACHE_PARSE_ERROR_LOG: string = "[BetterLyrics] Error parsing cached lyrics";
export const INVALID_API_RESPONSE_LOG: string = "[BetterLyrics] Invalid API response structure";
export const PRIMARY_API_TIMEOUT_LOG: string = "[BetterLyrics] Primary API request timed out";
export const LRCLIB_TIMEOUT_LOG: string = "[BetterLyrics] LRCLIB request timed out";
export const NO_VALID_LRCLIB_LYRICS_LOG: string = "[BetterLyrics] No valid lyrics returned from LRCLIB";
export const INVALID_CACHE_DATA_LOG: string = "[BetterLyrics] Invalid data structure in cache";
export const CACHE_PARSING_ERROR: string = "[BetterLyrics] Error parsing cached data";
export const LYRICS_CHECK_INTERVAL_ERROR: string = "[BetterLyrics] Error in lyrics check interval:";
export const NO_LYRICS_TEXT: string = "No lyrics found for this song";
export const MUSIC_NOTES: string = "♪𝅘𝅥𝅮𝅘𝅥𝅯𝅘𝅥𝅰𝅘𝅥𝅱𝅘𝅥𝅲";

export const DEFAULT_LINE_SYNCED_WORD_DELAY_MS = 50;
