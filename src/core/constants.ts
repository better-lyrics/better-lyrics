import type { LyricSourceKey } from "@modules/lyrics/providers/shared";

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
export const PAUSED_CLASS: string = "blyrics--paused";
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
export const FULLSCREEN_BUTTON_SELECTOR: string = ".fullscreen-button";

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
export const GENIUS_LOGO_SRC: string =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAyNCIgaGVpZ2h0PSIxMDI0IiB2aWV3Qm94PSIwIDAgMTAyNCAxMDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8ZyBjbGlwLXBhdGg9InVybCgjY2xpcDBfMTU4XzUpIj4KPHBhdGggZD0iTTEwMjYgNTEyQzEwMjYgNzk0Ljc3IDc5Ni43NyAxMDI0IDUxNCAxMDI0QzIzMS4yMyAxMDI0IDIgNzk0Ljc3IDIgNTEyQzIgMjI5LjIzIDIzMS4yMyAwIDUxNCAwQzc5Ni43NyAwIDEwMjYgMjI5LjIzIDEwMjYgNTEyWiIgZmlsbD0iI0Y2RjA2OSIvPgo8cGF0aCBkPSJNNzcyLjE1MiA0NjkuMzI3Qzc3MS45MTkgNDU2LjAxOCA3NzAuNTE5IDQ0Mi44NjMgNzY4LjM0MyA0MjkuNzg2Qzc1OS44NjkgMzgwLjQxNyA3MzkuMDM1IDMzNi44NTEgNzA2LjYxOCAyOTguNzAyQzcwMy4yNzYgMjk0Ljc1NiA2OTkuNzc3IDI5MC45NjQgNjk2LjEyNCAyODcuMjVDNjkzLjg2OSAyODQuOTI5IDY5MC45OTMgMjg0LjY5NiA2ODguNzM5IDI4Ni4yNDRDNjg2LjU2MiAyODcuNzE0IDY4NS45NCAyODkuOTU4IDY4Ni44NzMgMjkzLjEzMUM2ODcuMTA2IDI5My45MDUgNjg3LjQxNyAyOTQuNjAxIDY4Ny42NSAyOTUuMjk4QzcwMC4wODggMzI4LjMzOSA3MDYuNDYzIDM2Mi40NjQgNzA2LjY5NiAzOTcuNzVDNzA2LjM4NSA0MDQuMTczIDcwNi4wNzQgNDEwLjU5NSA3MDUuNzYzIDQxNy4wMThDNzA0LjgzIDQzNC41ODMgNzAyLjAzMiA0NTEuODM5IDY5Ny42MDEgNDY4Ljc4NkM2ODMuMzc1IDUyMy4zMzkgNjU1Ljg1NSA1NzAuMjMyIDYxNC4zNDMgNjA4LjUzNkM1NjAuMjM3IDY1OC40NDYgNDk1Ljk0NyA2ODQuMTM3IDQyMi4yNTEgNjg2LjIyNkM0MDMuNjcxIDY4Ni43NjggMzg1LjI0NyA2ODUuMjIgMzY2Ljk3OSA2ODIuMDQ4QzM0OC4zMjIgNjc4Ljg3NSAzMzAuMDUzIDY3My45MjMgMzEyLjQwNiA2NjcuMTEzQzMwOC41MTkgNjY1LjY0MyAzMDUuNzk5IDY2Ni4zMzkgMzA0LjI0NCA2NjkuMDQ4QzMwMi42ODkgNjcxLjYwMSAzMDMuMzExIDY3NCAzMDYuMzQzIDY3Ni44NjNDMzA4LjkwOCA2NzkuMjYyIDMxMS40NzMgNjgxLjU4MyAzMTQuMTE3IDY4My45MDVDMzY0LjgwMiA3MjcuNjI1IDQyMy44MDYgNzUwLjE0MyA0OTAuNzM5IDc1Mi4wNzdDNTA2LjkwOCA3NTIuNTQyIDUyMy4wNzggNzUxLjMwNCA1MzkuMDkyIDc0OC42NzNDNTk2Ljc3NCA3MzkuMzg3IDY0Ny4xNDggNzE0Ljg1NyA2ODguNzM5IDY3NEM3NDUuNzk5IDYxNy45NzYgNzczLjcwNyA1NDkuNDk0IDc3Mi4xNTIgNDY5LjMyN1oiIGZpbGw9ImJsYWNrIi8+CjxwYXRoIGQ9Ik0zMjguMjY1IDU0NC41NDJDMzMwLjUxOSA1NDIuODM5IDMzMC45MDggNTQwLjU5NSAzMjkuNjY0IDUzNi44MDRDMzI5LjUwOSA1MzYuNDE3IDMyOS40MzEgNTM2LjEwNyAzMjkuMjc2IDUzNS43MkMzMTkuNjM2IDUwOC42MzcgMzE2LjkxNSA0ODAuNzggMzIxLjAzNSA0NTIuMzgxQzMyNi40NzcgNDE1LjAwNiAzNDIuNDEzIDM4Mi42NjEgMzY4LjM3OCAzNTUuMjY4QzM3MC40NzcgMzUzLjAyNCAzNzEuNDg4IDM1MC43OCAzNzEuNDg4IDM0Ny42ODVDMzcxLjQxIDMzOC4wMTIgMzcxLjQxIDMyOC4zMzkgMzcxLjQxIDMxOC42NjdDMzcxLjQxIDMwOS4xNDkgMzcxLjQxIDI5OS41NTQgMzcxLjQxIDI5MC4wMzZDMzcxLjQxIDI4My44NDUgMzY5LjU0NCAyODEuOTExIDM2My4zMjUgMjgxLjkxMUMzNDQuMTI0IDI4MS45MTEgMzI1IDI4MS45MTEgMzA1Ljc5OSAyODEuODMzQzMwMi42MTEgMjgxLjgzMyAzMDAuMDQ2IDI4Mi43NjIgMjk3Ljc5MiAyODQuOTI5QzI2NS45MTkgMzE1LjgwNCAyNDguOTcyIDM1My40ODggMjQ2LjMyOSAzOTcuNTE4QzI0NS4zMTggNDE0LjMxIDI0Ny4yNjEgNDMwLjk0NiAyNTEuNjE1IDQ0Ny4yNzRDMjYyLjQ5OCA0ODcuOTc2IDI4NS41MDkgNTIwLjA4OSAzMjAuNDEzIDU0My43NjhDMzIzLjkxMiA1NDYuMTY3IDMyNS45MzMgNTQ2LjMyMSAzMjguMjY1IDU0NC41NDJaIiBmaWxsPSJibGFjayIvPgo8cGF0aCBkPSJNNDM0LjUzNCA0MjMuMjA4QzQzOS4yNzYgNDU4LjQ5NCA0NzIuNzgxIDQ4My40MTEgNTA4LjA3NCA0NzcuNzYyQzUzOS40MDMgNDcyLjczMiA1NjIuMTggNDQ2LjE5IDU2Mi4xOCA0MTQuNTQyQzU2Mi4xOCA0MDguMTk2IDU2Mi4xOCA0MDEuOTI5IDU2Mi4xOCAzOTUuNTgzQzU2Mi4xOCAzODcuMzA0IDU2Mi4xOCAzNzkuMTAxIDU2Mi4xOCAzNzAuODIxQzU2Mi4xOCAzNjUuNTYgNTYzLjU4IDM2NC4yNDQgNTY4Ljg2NiAzNjQuMTY3QzU3My43NjMgMzY0LjA4OSA1NzguNzM5IDM2NC4yNDQgNTgzLjYzNiAzNjQuMDg5QzU4OC4xNDUgMzYzLjkzNSA1OTAuMTY2IDM2MS4yMjYgNTg5LjM4OSAzNTYuODkzQzU4OS4yMzMgMzU2LjExOSA1ODkuMTU1IDM1NS4zNDUgNTg5IDM1NC42NDlDNTgzLjA5MiAzMjkuODEgNTcyLjM2NCAzMDcuMzY5IDU1Ni44MTYgMjg3LjA5NUM1NTMuOTQgMjgzLjM4MSA1NTAuNzUzIDI4MS45ODggNTQ2LjI0NCAyODIuMDY1QzUzMy4xODQgMjgyLjIyIDUyMC4xMjQgMjgyLjA2NSA1MDYuOTg2IDI4Mi4xNDNDNTA1LjU4NyAyODIuMTQzIDUwNC4xMSAyODIuMjIgNTAyLjcxIDI4Mi40NTJDNDk5LjQ0NSAyODIuOTk0IDQ5Ny45NjggMjg0LjU0MiA0OTcuNTAyIDI4Ny43OTJDNDk3LjM0NiAyODkuMDMgNDk3LjQyNCAyOTAuMzQ1IDQ5Ny40MjQgMjkxLjY2MUM0OTcuNDI0IDMxMS45MzUgNDk3LjQyNCAzMzIuMTMxIDQ5Ny40MjQgMzUyLjQwNUM0OTcuNDI0IDM2MC43NjIgNDk1Ljc5MiAzNjguODEgNDkyLjM3MSAzNzYuNDdDNDgyLjI2NSAzOTguNjAxIDQ2NC43NzQgNDEwLjkwNSA0NDAuNjc1IDQxNC4xNTVDNDM1LjYyMiA0MTQuODUxIDQzNC4xNDUgNDE2LjQ3NiA0MzQuMzc4IDQyMS40MjlDNDM0LjQ1NiA0MjEuODkzIDQzNC40NTYgNDIyLjU4OSA0MzQuNTM0IDQyMy4yMDhaIiBmaWxsPSJibGFjayIvPgo8L2c+CjxkZWZzPgo8Y2xpcFBhdGggaWQ9ImNsaXAwXzE1OF81Ij4KPHJlY3Qgd2lkdGg9IjEwMjQiIGhlaWdodD0iMTAyNCIgZmlsbD0id2hpdGUiLz4KPC9jbGlwUGF0aD4KPC9kZWZzPgo8L3N2Zz4=";
export const EMPTY_THUMBNAIL_SRC: string =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
export const FONT_LINK: string = "https://api.fontshare.com/v2/css?f[]=satoshi@1&display=swap";
export const NOTO_SANS_UNIVERSAL_LINK: string =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@100..900&family=Noto+Sans+Armenian:wght@100..900&family=Noto+Sans+Bengali:wght@100..900&family=Noto+Sans+Devanagari:wght@100..900&family=Noto+Sans+Georgian:wght@100..900&family=Noto+Sans+Gujarati:wght@100..900&family=Noto+Sans+HK:wght@100..900&family=Noto+Sans+Hebrew:wght@100..900&family=Noto+Sans+JP:wght@100..900&family=Noto+Sans+KR:wght@100..900&family=Noto+Sans+Kannada:wght@100..900&family=Noto+Sans+Khmer:wght@100..900&family=Noto+Sans+Lao+Looped:wght@100..900&family=Noto+Sans+Lao:wght@100..900&family=Noto+Sans+Malayalam:wght@100..900&family=Noto+Sans+Marchen&family=Noto+Sans+Meetei+Mayek:wght@100..900&family=Noto+Sans+Multani&family=Noto+Sans+NKo&family=Noto+Sans+Old+Permic&family=Noto+Sans+SC:wght@100..900&family=Noto+Sans+Shavian&family=Noto+Sans+Sinhala:wght@100..900&family=Noto+Sans+Sunuwar&family=Noto+Sans+TC:wght@100..900&family=Noto+Sans+Takri&family=Noto+Sans+Tamil:wght@100..900&family=Noto+Sans+Telugu:wght@100..900&family=Noto+Sans+Thai+Looped:wght@100..900&family=Noto+Sans+Thai:wght@100..900&family=Noto+Sans+Vithkuqi:wght@400..700&family=Noto+Sans+Warang+Citi&family=Noto+Sans:ital,wght@0,100..900;1,100..900&family=Roboto:ital,wght@0,100..900;1,100..900&display=swap";

// API URLs and Functions
export const LYRICS_API_URL: string = "https://lyrics-api.boidu.dev/getLyrics";
export const DISCORD_INVITE_URL: string = "https://discord.gg/UsHE3d5fWF";
export const LRCLIB_API_URL: string = "https://lrclib.net/api/get";
export const LEGATO_API_URL: string = "https://lyrics-api.boidu.dev/kugou/getLyrics";
export const LRCLIB_UPLOAD_URL: string = "https://lrclibup.boidu.dev/";
export const LRCLIB_CLIENT_HEADER: string = "BetterLyrics Extension (https://github.com/better-lyrics/better-lyrics)";
export const THEME_STORE_API_URL: string = "https://better-lyrics-themes-api.boidu.dev";
export const THEME_STORE_TURNSTILE_URL: string = `${THEME_STORE_API_URL}/turnstile`;
export const THEME_REGISTRY_BASE: string = "https://raw.githubusercontent.com/better-lyrics/themes";
export const THEME_REGISTRY_URL: string = `${THEME_REGISTRY_BASE}/master`;
export const TRANSLATE_LYRICS_URL = function (lang: string, text: string): string {
  return `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;
};
export const TRANSLATE_IN_ROMAJI = function (lang: string, text: string): string {
  return `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${lang}&tl=${lang}-Latn&dt=t&dt=rm&q=${encodeURIComponent(text)}`;
};

export const CUBEY_LYRICS_API_URL_TURNSTILE = "https://lyrics.api.dacubeking.com/";

export const CUBEY_LYRICS_API_URL = "https://lyrics.api.dacubeking.com/";

// Supported Romanization Languages (code → display name)
export const ROMANIZATION_LANGUAGES: Record<string, string> = {
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  ru: "Russian",
  hi: "Hindi",
  ar: "Arabic",
  th: "Thai",
  el: "Greek",
  he: "Hebrew",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  ml: "Malayalam",
  kn: "Kannada",
  gu: "Gujarati",
  pa: "Punjabi",
  mr: "Marathi",
  ur: "Urdu",
  si: "Sinhala",
  my: "Burmese",
  ka: "Georgian",
  km: "Khmer",
  lo: "Lao",
  fa: "Persian",
};

// Log Prefixes
export const LOG_PREFIX: string = "[BetterLyrics]";
export const LOG_PREFIX_CONTENT: string = "[BetterLyrics:Content]";
export const LOG_PREFIX_BACKGROUND: string = "[BetterLyrics:Background]";
export const LOG_PREFIX_EDITOR: string = "[BetterLyrics:Editor]";
export const LOG_PREFIX_STORE: string = "[BetterLyrics:Store]";
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
export const ALBUM_ART_SIZE_CHANGED: string = "[BetterLyrics] Album art size changed to";
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
export const MUSIC_NOTES: string = "♪𝅘𝅥𝅮𝅘𝅥𝅯𝅘𝅥𝅰𝅘𝅥𝅱𝅘𝅥𝅲";

export const BLYRICS_INSTRUMENTAL_GAP_MS = 5000;

export const STORAGE_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

export const PLAYER_BAR_SELECTOR: string = "ytmusic-player-bar";
export const AD_PLAYING_ATTR: string = "is-advertisement";
export const LYRICS_AD_OVERLAY_ID: string = "blyrics-ad-overlay";

export type SyncType = "syllable" | "word" | "line" | "unsynced";

// Do not modify, its the same as server and mismatch will lead to wrong display names
export const IDENTITY_ADJECTIVES = [
  "Melodic",
  "Harmonic",
  "Acoustic",
  "Electric",
  "Mellow",
  "Groovy",
  "Funky",
  "Vibrant",
  "Golden",
  "Crystal",
  "Velvet",
  "Cosmic",
  "Stellar",
  "Radiant",
  "Mystic",
  "Serene",
  "Dynamic",
  "Smooth",
  "Crisp",
  "Warm",
  "Bright",
  "Deep",
  "Swift",
  "Bold",
  "Noble",
  "Grand",
  "Royal",
  "Epic",
  "Vivid",
  "Lucid",
  "Prime",
  "Pure",
  "Sonic",
  "Hyper",
  "Ultra",
  "Mega",
  "Super",
  "Astral",
  "Lunar",
  "Solar",
  "Neon",
  "Retro",
  "Classic",
  "Modern",
  "Fusion",
  "Primal",
  "Zen",
  "Nova",
  "Alpha",
  "Omega",
  "Delta",
  "Sigma",
  "Quantum",
  "Atomic",
  "Cyber",
  "Digital",
  "Analog",
  "Stereo",
  "Studio",
  "Live",
  "Remix",
  "Master",
  "Platinum",
  "Diamond",
] as const;

export const IDENTITY_NOUNS = [
  "Bass",
  "Guitar",
  "Piano",
  "Drum",
  "Synth",
  "Chord",
  "Beat",
  "Riff",
  "Note",
  "Tempo",
  "Rhythm",
  "Melody",
  "Verse",
  "Chorus",
  "Bridge",
  "Hook",
  "Track",
  "Vinyl",
  "Record",
  "Album",
  "Mix",
  "Tape",
  "Loop",
  "Sample",
  "Treble",
  "Octave",
  "Scale",
  "Arpeggio",
  "Cadence",
  "Motif",
  "Theme",
  "Score",
  "Cymbal",
  "Snare",
  "Kick",
  "Hihat",
  "Conga",
  "Bongo",
  "Shaker",
  "Gong",
  "Violin",
  "Cello",
  "Flute",
  "Horn",
  "Trumpet",
  "Sax",
  "Harp",
  "Bell",
  "Staccato",
  "Legato",
  "Crescendo",
  "Fermata",
  "Vibrato",
  "Tremolo",
  "Glissando",
  "Sforzando",
  "Forte",
  "Allegro",
  "Adagio",
  "Presto",
  "Andante",
  "Largo",
  "Vivace",
  "Maestro",
] as const;

export const IDENTITY_ACTIONS = [
  "Solo",
  "Remix",
  "Groove",
  "Flow",
  "Vibe",
  "Echo",
  "Pulse",
  "Drift",
  "Wave",
  "Loop",
  "Drop",
  "Rise",
  "Fade",
  "Blend",
  "Sync",
  "Glide",
  "Swing",
  "Bounce",
  "Slide",
  "Roll",
  "Spin",
  "Twist",
  "Shake",
  "Break",
  "Jam",
  "Play",
  "Rock",
  "Pop",
  "Jazz",
  "Funk",
  "Soul",
  "Blues",
  "Surge",
  "Rush",
  "Dash",
  "Zoom",
  "Flash",
  "Spark",
  "Blast",
  "Burst",
  "Chill",
  "Cruise",
  "Coast",
  "Sway",
  "Float",
  "Hover",
  "Soar",
  "Leap",
  "Strike",
  "Stomp",
  "Clap",
  "Snap",
  "Tap",
  "Slap",
  "Pluck",
  "Strum",
  "Hum",
  "Sing",
  "Chant",
  "Call",
  "Shout",
  "Whisper",
  "Croon",
  "Belt",
] as const;

export interface ProviderConfig {
  key: LyricSourceKey;
  displayName: string;
  syncType: SyncType;
  priority: number;
}

export const PROVIDER_CONFIGS: ProviderConfig[] = [
  { key: "bLyrics-richsynced", displayName: "Better Lyrics", syncType: "syllable", priority: 0 },
  { key: "musixmatch-richsync", displayName: "Musixmatch", syncType: "word", priority: 1 },
  { key: "yt-captions", displayName: "Youtube Captions", syncType: "line", priority: 2 },
  { key: "bLyrics-synced", displayName: "Better Lyrics", syncType: "line", priority: 3 },
  { key: "lrclib-synced", displayName: "LRCLib", syncType: "line", priority: 4 },
  { key: "legato-synced", displayName: "Legato", syncType: "line", priority: 5 },
  { key: "musixmatch-synced", displayName: "Musixmatch", syncType: "line", priority: 6 },
  { key: "yt-lyrics", displayName: "Youtube", syncType: "unsynced", priority: 7 },
  { key: "lrclib-plain", displayName: "LRCLib", syncType: "unsynced", priority: 8 },
] as const;

export const LYRIC_SOURCE_KEYS = PROVIDER_CONFIGS.map(p => p.key);
