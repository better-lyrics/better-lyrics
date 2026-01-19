// Raw types:

/**
 * Represents the innermost timed word span.
 * e.g., <span begin=".." end="..">Word</span>
 * The parser often wraps this, e.g., { "#text": " ", span: [ { "#text": "Word" } ], ... }
 */
interface TimedWord {
  "#text": string;
}

/**
 * Represents a single timed lyric span, which typically contains
 * whitespace ("#text") and the actual timed word ("span").
 */
interface LyricSpan {
  "#text"?: string;
  span?: TimedWord[];
  ":@"?: {
    "@_begin"?: string;
    "@_end"?: string;
  };
}

/**
 * Represents a text container within the metadata (like translations or
 * transliterations). It can be simple text or contain complex spans.
 */
interface MetadataTextContainer {
  "#text"?: string;
  span?: LyricSpan[];
  ":@"?: {
    "@_begin"?: string;
    "@_end"?: string;
    "@_role"?: string;
  };
}

/**
 * Represents the attributes for a paragraph <p> element.
 */
interface ParagraphAttributes {
  "@_begin"?: string;
  "@_end"?: string;
  "@_key": string;
  "@_agent": string;
  "@_role": string;
}

export interface SpanElement {
  "#text"?: string;
  span?: LyricSpan[];
  ":@": ParagraphAttributes;
}

/**
 * A unified paragraph element.
 * For line-synced lyrics, it will have a top-level "#text" property.
 * For word-synced lyrics, it will have a "span" array property.
 *
 * If the attribute @_role === x-bg this is a background lyric. span will be a SpanElement instead of a LyricSpan
 */
export type ParagraphElementOrBackground = SpanElement & {
  span?: SpanElement[]; // Used for word-synced lyrics.
};

/**
 * Represents the attributes for a <div> element.
 */
interface DivAttributes {
  "@_begin"?: string;
  "@_end"?: string;
  "@_songPart": string;
  "@_key"?: string;
  "@_agent"?: string;
}

/**
 * Represents a <div> element, which contains paragraphs.
 */
export interface DivElement {
  p: ParagraphElementOrBackground[];
  ":@": DivAttributes;
}

/**
 * Represents the <body> element.
 */
interface BodyElement {
  div: DivElement[];
  ":@"?: {
    "@_dur": string;
  };
}

/**
 * Represents a <songwriter> element.
 */
interface Songwriter {
  "#text": string;
}

/**
 * A container for <songwriter> elements.
 */
interface SongwriterContainer {
  songwriter: Songwriter[];
}

/**
 * Represents a single <translation> item.
 */
interface TranslationItem {
  text: MetadataTextContainer[];
  ":@": {
    "@_for": string;
  };
}

/**
 * A container for <translation> items.
 */
export interface TranslationContainer {
  translation: TranslationItem[];
  ":@": {
    "@_type": string;
    "@_lang": string;
  };
}

/**
 * Represents a single <transliteration> item.
 */
export interface TransliterationItem {
  text: ParagraphElementOrBackground[];
  ":@": {
    "@_for": string;
  };
}

/**
 * A container for <transliteration> items.
 */
export interface TransliterationContainer {
  transliteration: TransliterationItem[];
  ":@": {
    "@_lang": string;
  };
}

/**
 * Represents the attributes for the <metadata> element.
 */
interface MetadataAttributes {
  "@_type"?: string;
  "@_id"?: string;
  "@_leadingSilence"?: string;
}

/**
 * Represents a <ttm:name> element within an agent.
 */
interface AgentName {
  "#text": string;
}

/**
 * Represents a <ttm:agent> element attributes.
 */
interface AgentAttributes {
  "@_type"?: string;
  "@_id": string;
}

/**
 * Represents a <ttm:agent> element.
 */
export interface AgentElement {
  name?: AgentName[];
  ":@": AgentAttributes;
}

/**
 * Represents any metadata element (agent, translations, transliterations, or nested containers).
 */
export type MetadataElement = {
  agent?: unknown[];
  translations?: TranslationContainer[];
  transliterations?: TransliterationContainer[];
  songwriters?: SongwriterContainer[];
  ":@"?: MetadataAttributes;
} & Record<string, unknown[] | MetadataAttributes | undefined>;

/**
 * Represents the <head> element.
 */
interface HeadElement {
  metadata: MetadataElement[];
}

/**
 * Represents the root <tt> element.
 */
interface TtmlElement {
  head?: HeadElement[];
  body?: BodyElement[];
  ":@": {
    "@_timing": string;
    "@_lang": string;
    "@_dur": string;
  };
}

/**
 * Represents the object wrapper from the JSON parser.
 */
interface TtmlRootObject {
  tt: TtmlElement[];
}

/**
 * The final Root type for your TTML JSON output.
 */
export type TtmlRoot = TtmlRootObject[];

// Friendly Types

/** A single, timed element. This can be a word, a syllable, or a space. */
export interface CleanWord {
  begin: number;
  end: number;
  text: string;
  isBackground: boolean;
}

/** A single line of lyrics */
export interface CleanLine {
  key: string;
  begin: number;
  end: number;
  text?: string;
  words?: CleanWord[];
}

/** A section of the song (e.g., "Verse", "Chorus") */
export interface CleanSection {
  begin: number;
  end: number;
  songPart: string;
  lines: CleanLine[];
}

/** The root object containing all processed lyric data */
export interface CleanTtml {
  timing: "Line" | "Word";
  lang: string;
  duration: number;
  songwriters: string[];
  translations?: Record<string, string>;
  transliterations?: Record<string, CleanWord[]>;
  sections: CleanSection[];
}
