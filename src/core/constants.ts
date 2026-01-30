import type { LyricSourceKey } from "@modules/lyrics/providers/shared";

// DOM Class Names
export const TAB_HEADER_CLASS = "tab-header style-scope ytmusic-player-page" as const;
export const TAB_CONTENT_CLASS = "tab-content style-scope tp-yt-paper-tab" as const;
export const LYRICS_CLASS = "blyrics-container" as const;
export const CURRENT_LYRICS_CLASS = "blyrics--active" as const;
export const ZERO_DURATION_ANIMATION_CLASS = "blyrics-zero-dur-animate" as const;
export const RTL_CLASS = "blyrics-rtl" as const;
export const WORD_CLASS = "blyrics--word" as const;
export const BACKGROUND_LYRIC_CLASS = "blyrics-background-lyric" as const;
export const ANIMATING_CLASS = "blyrics--animating" as const;
export const PAUSED_CLASS = "blyrics--paused" as const;
export const PRE_ANIMATING_CLASS = "blyrics--pre-animating" as const;
export const USER_SCROLLING_CLASS = "blyrics-user-scrolling" as const;
export const TRANSLATED_LYRICS_CLASS = "blyrics--translated" as const;
export const ROMANIZED_LYRICS_CLASS = "blyrics--romanized" as const;
export const FOOTER_CLASS = "blyrics-footer" as const;

// DOM Selectors
export const TAB_RENDERER_SELECTOR = "#tab-renderer" as const;
export const NO_LYRICS_TEXT_SELECTOR =
  "#tab-renderer > ytmusic-message-renderer > yt-formatted-string.text.style-scope.ytmusic-message-renderer" as const;
export const FULLSCREEN_BUTTON_SELECTOR = ".fullscreen-button" as const;

// DOM IDs and Attributes
export const LYRICS_LOADER_ID = "blyrics-loader" as const;
export const LYRICS_WRAPPER_ID = "blyrics-wrapper" as const;
export const LYRICS_SPACING_ELEMENT_ID = "blyrics-spacing-element" as const;
export const LYRICS_DISABLED_ATTR = "blyrics-dfs" as const;
export const HIDDEN_CLASS = "blyrics-hidden" as const;

// Assets and Resources
export const DISCORD_LOGO_SRC =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiPjxwYXRoIGZpbGw9IiNhYWEiIGQ9Ik0xOS4yNyA1LjMzQzE3Ljk0IDQuNzEgMTYuNSA0LjI2IDE1IDRhLjA5LjA5IDAgMCAwLS4wNy4wM2MtLjE4LjMzLS4zOS43Ni0uNTMgMS4wOWExNi4wOSAxNi4wOSAwIDAgMC00LjggMGMtLjE0LS4zNC0uMzUtLjc2LS41NC0xLjA5Yy0uMDEtLjAyLS4wNC0uMDMtLjA3LS4wM2MtMS41LjI2LTIuOTMuNzEtNC4yNyAxLjMzYy0uMDEgMC0uMDIuMDEtLjAzLjAyYy0yLjcyIDQuMDctMy40NyA4LjAzLTMuMSAxMS45NWMwIC4wMi4wMS4wNC4wMy4wNWMxLjggMS4zMiAzLjUzIDIuMTIgNS4yNCAyLjY1Yy4wMy4wMS4wNiAwIC4wNy0uMDJjLjQtLjU1Ljc2LTEuMTMgMS4wNy0xLjc0Yy4wMi0uMDQgMC0uMDgtLjA0LS4wOWMtLjU3LS4yMi0xLjExLS40OC0xLjY0LS43OGMtLjA0LS4wMi0uMDQtLjA4LS4wMS0uMTFjLjExLS4wOC4yMi0uMTcuMzMtLjI1Yy4wMi0uMDIuMDUtLjAyLjA3LS4wMWMzLjQ0IDEuNTcgNy4xNSAxLjU3IDEwLjU1IDBjLjAyLS4wMS4wNS0uMDEuMDcuMDFjLjExLjA5LjIyLjE3LjMzLjI2Yy4wNC4wMy4wNC4wOS0uMDEuMTFjLS41Mi4zMS0xLjA3LjU2LTEuNjQuNzhjLS4wNC4wMS0uMDUuMDYtLjA0LjA5Yy4zMi42MS42OCAxLjE5IDEuMDcgMS43NGMuMDMuMDEuMDYuMDIuMDkuMDFjMS43Mi0uNTMgMy40NS0xLjMzIDUuMjUtMi42NWMuMDItLjAxLjAzLS4wMy4wMy0uMDVjLjQ0LTQuNTMtLjczLTguNDYtMy4xLTExLjk1Yy0uMDEtLjAxLS4wMi0uMDItLjA0LS4wMk04LjUyIDE0LjkxYy0xLjAzIDAtMS44OS0uOTUtMS44OS0yLjEycy44NC0yLjEyIDEuODktMi4xMmMxLjA2IDAgMS45Ljk2IDEuODkgMi4xMmMwIDEuMTctLjg0IDIuMTItMS44OSAyLjEybTYuOTcgMGMtMS4wMyAwLTEuODktLjk1LTEuODktMi4xMnMuODQtMi4xMiAxLjg5LTIuMTJjMS4wNiAwIDEuOS45NiAxLjg5IDIuMTJjMCAxLjE3LS44MyAyLjEyLTEuODkgMi4xMiIvPjwvc3ZnPg==" as const;
export const GENIUS_LOGO_SRC =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAyNCIgaGVpZ2h0PSIxMDI0IiB2aWV3Qm94PSIwIDAgMTAyNCAxMDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8ZyBjbGlwLXBhdGg9InVybCgjY2xpcDBfMTU4XzUpIj4KPHBhdGggZD0iTTEwMjYgNTEyQzEwMjYgNzk0Ljc3IDc5Ni43NyAxMDI0IDUxNCAxMDI0QzIzMS4yMyAxMDI0IDIgNzk0Ljc3IDIgNTEyQzIgMjI5LjIzIDIzMS4yMyAwIDUxNCAwQzc5Ni43NyAwIDEwMjYgMjI5LjIzIDEwMjYgNTEyWiIgZmlsbD0iI0Y2RjA2OSIvPgo8cGF0aCBkPSJNNzcyLjE1MiA0NjkuMzI3Qzc3MS45MTkgNDU2LjAxOCA3NzAuNTE5IDQ0Mi44NjMgNzY4LjM0MyA0MjkuNzg2Qzc1OS44NjkgMzgwLjQxNyA3MzkuMDM1IDMzNi44NTEgNzA2LjYxOCAyOTguNzAyQzcwMy4yNzYgMjk0Ljc1NiA2OTkuNzc3IDI5MC45NjQgNjk2LjEyNCAyODcuMjVDNjkzLjg2OSAyODQuOTI5IDY5MC45OTMgMjg0LjY5NiA2ODguNzM5IDI4Ni4yNDRDNjg2LjU2MiAyODcuNzE0IDY4NS45NCAyODkuOTU4IDY4Ni44NzMgMjkzLjEzMUM2ODcuMTA2IDI5My45MDUgNjg3LjQxNyAyOTQuNjAxIDY4Ny42NSAyOTUuMjk4QzcwMC4wODggMzI4LjMzOSA3MDYuNDYzIDM2Mi40NjQgNzA2LjY5NiAzOTcuNzVDNzA2LjM4NSA0MDQuMTczIDcwNi4wNzQgNDEwLjU5NSA3MDUuNzYzIDQxNy4wMThDNzA0LjgzIDQzNC41ODMgNzAyLjAzMiA0NTEuODM5IDY5Ny42MDEgNDY4Ljc4NkM2ODMuMzc1IDUyMy4zMzkgNjU1Ljg1NSA1NzAuMjMyIDYxNC4zNDMgNjA4LjUzNkM1NjAuMjM3IDY1OC40NDYgNDk1Ljk0NyA2ODQuMTM3IDQyMi4yNTEgNjg2LjIyNkM0MDMuNjcxIDY4Ni43NjggMzg1LjI0NyA2ODUuMjIgMzY2Ljk3OSA2ODIuMDQ4QzM0OC4zMjIgNjc4Ljg3NSAzMzAuMDUzIDY3My45MjMgMzEyLjQwNiA2NjcuMTEzQzMwOC41MTkgNjY1LjY0MyAzMDUuNzk5IDY2Ni4zMzkgMzA0LjI0NCA2NjkuMDQ4QzMwMi42ODkgNjcxLjYwMSAzMDMuMzExIDY3NCAzMDYuMzQzIDY3Ni44NjNDMzA4LjkwOCA2NzkuMjYyIDMxMS40NzMgNjgxLjU4MyAzMTQuMTE3IDY4My45MDVDMzY0LjgwMiA3MjcuNjI1IDQyMy44MDYgNzUwLjE0MyA0OTAuNzM5IDc1Mi4wNzdDNTA2LjkwOCA3NTIuNTQyIDUyMy4wNzggNzUxLjMwNCA1MzkuMDkyIDc0OC42NzNDNTk2Ljc3NCA3MzkuMzg3IDY0Ny4xNDggNzE0Ljg1NyA2ODguNzM5IDY3NEM3NDUuNzk5IDYxNy45NzYgNzczLjcwNyA1NDkuNDk0IDc3Mi4xNTIgNDY5LjMyN1oiIGZpbGw9ImJsYWNrIi8+CjxwYXRoIGQ9Ik0zMjguMjY1IDU0NC41NDJDMzMwLjUxOSA1NDIuODM5IDMzMC45MDggNTQwLjU5NSAzMjkuNjY0IDUzNi44MDRDMzI5LjUwOSA1MzYuNDE3IDMyOS40MzEgNTM2LjEwNyAzMjkuMjc2IDUzNS43MkMzMTkuNjM2IDUwOC42MzcgMzE2LjkxNSA0ODAuNzggMzIxLjAzNSA0NTIuMzgxQzMyNi40NzcgNDE1LjAwNiAzNDIuNDEzIDM4Mi42NjEgMzY4LjM3OCAzNTUuMjY4QzM3MC40NzcgMzUzLjAyNCAzNzEuNDg4IDM1MC43OCAzNzEuNDg4IDM0Ny42ODVDMzcxLjQxIDMzOC4wMTIgMzcxLjQxIDMyOC4zMzkgMzcxLjQxIDMxOC42NjdDMzcxLjQxIDMwOS4xNDkgMzcxLjQxIDI5OS41NTQgMzcxLjQxIDI5MC4wMzZDMzcxLjQxIDI4My44NDUgMzY5LjU0NCAyODEuOTExIDM2My4zMjUgMjgxLjkxMUMzNDQuMTI0IDI4MS45MTEgMzI1IDI4MS45MTEgMzA1Ljc5OSAyODEuODMzQzMwMi42MTEgMjgxLjgzMyAzMDAuMDQ2IDI4Mi43NjIgMjk3Ljc5MiAyODQuOTI5QzI2NS45MTkgMzE1LjgwNCAyNDguOTcyIDM1My40ODggMjQ2LjMyOSAzOTcuNTE4QzI0NS4zMTggNDE0LjMxIDI0Ny4yNjEgNDMwLjk0NiAyNTEuNjE1IDQ0Ny4yNzRDMjYyLjQ5OCA0ODcuOTc2IDI4NS41MDkgNTIwLjA4OSAzMjAuNDEzIDU0My43NjhDMzIzLjkxMiA1NDYuMTY3IDMyNS45MzMgNTQ2LjMyMSAzMjguMjY1IDU0NC41NDJaIiBmaWxsPSJibGFjayIvPgo8cGF0aCBkPSJNNDM0LjUzNCA0MjMuMjA4QzQzOS4yNzYgNDU4LjQ5NCA0NzIuNzgxIDQ4My40MTEgNTA4LjA3NCA0NzcuNzYyQzUzOS40MDMgNDcyLjczMiA1NjIuMTggNDQ2LjE5IDU2Mi4xOCA0MTQuNTQyQzU2Mi4xOCA0MDguMTk2IDU2Mi4xOCA0MDEuOTI5IDU2Mi4xOCAzOTUuNTgzQzU2Mi4xOCAzODcuMzA0IDU2Mi4xOCAzNzkuMTAxIDU2Mi4xOCAzNzAuODIxQzU2Mi4xOCAzNjUuNTYgNTYzLjU4IDM2NC4yNDQgNTY4Ljg2NiAzNjQuMTY3QzU3My43NjMgMzY0LjA4OSA1NzguNzM5IDM2NC4yNDQgNTgzLjYzNiAzNjQuMDg5QzU4OC4xNDUgMzYzLjkzNSA1OTAuMTY2IDM2MS4yMjYgNTg5LjM4OSAzNTYuODkzQzU4OS4yMzMgMzU2LjExOSA1ODkuMTU1IDM1NS4zNDUgNTg5IDM1NC42NDlDNTgzLjA5MiAzMjkuODEgNTcyLjM2NCAzMDcuMzY5IDU1Ni44MTYgMjg3LjA5NUM1NTMuOTQgMjgzLjM4MSA1NTAuNzUzIDI4MS45ODggNTQ2LjI0NCAyODIuMDY1QzUzMy4xODQgMjgyLjIyIDUyMC4xMjQgMjgyLjA2NSA1MDYuOTg2IDI4Mi4xNDNDNTA1LjU4NyAyODIuMTQzIDUwNC4xMSAyODIuMjIgNTAyLjcxIDI4Mi40NTJDNDk5LjQ0NSAyODIuOTk0IDQ5Ny45NjggMjg0LjU0MiA0OTcuNTAyIDI4Ny43OTJDNDk3LjM0NiAyODkuMDMgNDk3LjQyNCAyOTAuMzQ1IDQ5Ny40MjQgMjkxLjY2MUM0OTcuNDI0IDMxMS45MzUgNDk3LjQyNCAzMzIuMTMxIDQ5Ny40MjQgMzUyLjQwNUM0OTcuNDI0IDM2MC43NjIgNDk1Ljc5MiAzNjguODEgNDkyLjM3MSAzNzYuNDdDNDgyLjI2NSAzOTguNjAxIDQ2NC43NzQgNDEwLjkwNSA0NDAuNjc1IDQxNC4xNTVDNDM1LjYyMiA0MTQuODUxIDQzNC4xNDUgNDE2LjQ3NiA0MzQuMzc4IDQyMS40MjlDNDM0LjQ1NiA0MjEuODkzIDQzNC40NTYgNDIyLjU4OSA0MzQuNTM0IDQyMy4yMDhaIiBmaWxsPSJibGFjayIvPgo8L2c+CjxkZWZzPgo8Y2xpcFBhdGggaWQ9ImNsaXAwXzE1OF81Ij4KPHJlY3Qgd2lkdGg9IjEwMjQiIGhlaWdodD0iMTAyNCIgZmlsbD0id2hpdGUiLz4KPC9jbGlwUGF0aD4KPC9kZWZzPgo8L3N2Zz4=" as const;
export const FONT_LINK = "https://api.fontshare.com/v2/css?f[]=satoshi@1&display=swap" as const;
export const NOTO_SANS_UNIVERSAL_LINK =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@100..900&family=Noto+Sans+Armenian:wght@100..900&family=Noto+Sans+Bengali:wght@100..900&family=Noto+Sans+Devanagari:wght@100..900&family=Noto+Sans+Georgian:wght@100..900&family=Noto+Sans+Gujarati:wght@100..900&family=Noto+Sans+HK:wght@100..900&family=Noto+Sans+Hebrew:wght@100..900&family=Noto+Sans+JP:wght@100..900&family=Noto+Sans+KR:wght@100..900&family=Noto+Sans+Kannada:wght@100..900&family=Noto+Sans+Khmer:wght@100..900&family=Noto+Sans+Lao+Looped:wght@100..900&family=Noto+Sans+Lao:wght@100..900&family=Noto+Sans+Malayalam:wght@100..900&family=Noto+Sans+Marchen&family=Noto+Sans+Meetei+Mayek:wght@100..900&family=Noto+Sans+Multani&family=Noto+Sans+NKo&family=Noto+Sans+Old+Permic&family=Noto+Sans+SC:wght@100..900&family=Noto+Sans+Shavian&family=Noto+Sans+Sinhala:wght@100..900&family=Noto+Sans+Sunuwar&family=Noto+Sans+TC:wght@100..900&family=Noto+Sans+Takri&family=Noto+Sans+Tamil:wght@100..900&family=Noto+Sans+Telugu:wght@100..900&family=Noto+Sans+Thai+Looped:wght@100..900&family=Noto+Sans+Thai:wght@100..900&family=Noto+Sans+Vithkuqi:wght@400..700&family=Noto+Sans+Warang+Citi&family=Noto+Sans:ital,wght@0,100..900;1,100..900&family=Roboto:ital,wght@0,100..900;1,100..900&display=swap" as const;

// API URLs and Functions
export const LYRICS_API_URL = "https://lyrics-api.boidu.dev/getLyrics" as const;
export const DISCORD_INVITE_URL = "https://discord.gg/UsHE3d5fWF" as const;
export const LRCLIB_API_URL = "https://lrclib.net/api/get" as const;
export const LEGATO_API_URL = "https://lyrics-api.boidu.dev/kugou/getLyrics" as const;
export const LRCLIB_UPLOAD_URL = "https://lrclibup.boidu.dev/" as const;
export const LRCLIB_CLIENT_HEADER = "BetterLyrics Extension (https://github.com/better-lyrics/better-lyrics)" as const;
export const THEME_STORE_API_URL = "https://better-lyrics-themes-api.boidu.dev" as const;
export const THEME_STORE_TURNSTILE_URL = `${THEME_STORE_API_URL}/turnstile` as const;
export const THEME_REGISTRY_BASE = "https://raw.githubusercontent.com/better-lyrics/themes" as const;
export const THEME_REGISTRY_URL = `${THEME_REGISTRY_BASE}/master` as const;
export const TRANSLATE_LYRICS_URL = function (lang: string, text: string): string {
  return `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;
};
export const TRANSLATE_IN_ROMAJI = function (lang: string, text: string): string {
  return `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${lang}&tl=${lang}-Latn&dt=t&dt=rm&q=${encodeURIComponent(text)}`;
};

export const CUBEY_LYRICS_API_URL_TURNSTILE = "https://lyrics.api.dacubeking.com/" as const;

export const CUBEY_LYRICS_API_URL = "https://lyrics.api.dacubeking.com/" as const;

// Supported Romanization Languages
// Display names are fallback only - use getLanguageDisplayName() from @core/i18n for UI
// to get auto-localized names via Intl.DisplayNames API
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
export const LOG_PREFIX = "[BetterLyrics]" as const;
export const LOG_PREFIX_CONTENT = "[BetterLyrics:Content]" as const;
export const LOG_PREFIX_BACKGROUND = "[BetterLyrics:Background]" as const;
export const LOG_PREFIX_EDITOR = "[BetterLyrics:Editor]" as const;
export const LOG_PREFIX_STORE = "[BetterLyrics:Store]" as const;

// Initialization and General Logs
export const INITIALIZE_LOG =
  "%c[BetterLyrics] Loaded Successfully. Logs are enabled by default. You can disable them in the extension options." as const;
export const GENERAL_ERROR_LOG = "[BetterLyrics] Error:" as const;

// Lyrics Fetch and Processing Logs
export const FETCH_LYRICS_LOG = "[BetterLyrics] Fetching lyrics for:" as const;
export const LYRICS_FOUND_LOG = "[BetterLyrics] Lyrics found, injecting into the page" as const;
export const NO_LYRICS_FOUND_LOG = "[BetterLyrics] No lyrics found for the current song" as const;
export const LRCLIB_LYRICS_FOUND_LOG = "[BetterLyrics] Lyrics found from LRCLIB" as const;
export const PROVIDER_SWITCHED_LOG = "[BetterLyrics] Switching to provider = " as const;

// UI State Logs
export const LYRICS_TAB_HIDDEN_LOG =
  "[BetterLyrics] (Safe to ignore) Lyrics tab is hidden, skipping lyrics fetch" as const;
export const LYRICS_TAB_CLICKED_LOG = "[BetterLyrics] Lyrics tab clicked, fetching lyrics" as const;
export const LYRICS_WRAPPER_NOT_VISIBLE_LOG =
  "[BetterLyrics] (Safe to ignore) Lyrics wrapper is not visible, unable to inject lyrics" as const;
export const LYRICS_WRAPPER_CREATED_LOG = "[BetterLyrics] Lyrics wrapper created" as const;
export const FOOTER_NOT_VISIBLE_LOG =
  "[BetterLyrics] (Safe to ignore) Footer is not visible, unable to inject source link" as const;
export const LYRICS_TAB_NOT_DISABLED_LOG =
  "[BetterLyrics] (Safe to ignore) Lyrics tab is not disabled, unable to enable it" as const;
export const SONG_SWITCHED_LOG = "[BetterLyrics] Song has been switched" as const;
export const LOADER_TRANSITION_ENDED = "[BetterLyrics] Loader Transition Ended" as const;
export const LOADER_ANIMATION_END_FAILED = "[BetterLyrics] Loader Animation Didn't End" as const;
export const PAUSING_LYRICS_SCROLL_LOG = "[BetterLyrics] Pausing Lyrics Autoscroll Due to User Scroll" as const;

// Feature State Logs
export const AUTO_SWITCH_ENABLED_LOG = "[BetterLyrics] Auto switch enabled, switching to lyrics tab" as const;
export const TRANSLATION_ENABLED_LOG = "[BetterLyrics] Translation enabled, translating lyrics. Language: " as const;
export const TRANSLATION_ERROR_LOG = "[BetterLyrics] Unable to translate lyrics due to error" as const;
export const SYNC_DISABLED_LOG =
  "[BetterLyrics] Syncing lyrics disabled due to all lyrics having a start time of 0" as const;

// Error and Storage Logs
export const SERVER_ERROR_LOG = "[BetterLyrics] Server Error:" as const;
export const STORAGE_TRANSIENT_SET_LOG = "[BetterLyrics] Set transient storage for key: " as const;
export const NO_LYRICS_ELEMENT_LOG =
  "[BetterLyrics] No lyrics element found on the page, skipping lyrics injection" as const;
export const LYRICS_CHECK_INTERVAL_ERROR = "[BetterLyrics] Error in lyrics check interval:" as const;
export const MUSIC_NOTES = "♪𝅘𝅥𝅮𝅘𝅥𝅯𝅘𝅥𝅰𝅘𝅥𝅱𝅘𝅥𝅲" as const;

export const BLYRICS_INSTRUMENTAL_GAP_MS = 5000;

export const PLAYER_BAR_SELECTOR = "ytmusic-player-bar" as const;
export const AD_PLAYING_ATTR = "is-advertisement" as const;
export const LYRICS_AD_OVERLAY_ID = "blyrics-ad-overlay" as const;

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

interface ProviderConfig {
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
