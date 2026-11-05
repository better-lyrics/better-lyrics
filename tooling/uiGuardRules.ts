const countMatches = (source: string, pattern: RegExp): number => source.match(pattern)?.length ?? 0;

const stripCssComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

const FIELD_SELECTOR = /input|textarea|field|search/i;
const DARK_WELL_COLOUR = String.raw`rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0*\.20*\s*\)|rgba?\(\s*0\s+0\s+0\s*\/\s*(?:0*\.20*|20%)\s*\)`;
const DARK_WELL_BACKGROUND = new RegExp(String.raw`background(?:-color)?\s*:[^;}]*(?:${DARK_WELL_COLOUR})`, "gi");
const INNERMOST_RULE = /([^{}]+)\{([^{}]*)\}/g;

export function countNativeSelects(source: string): number {
  return countMatches(source, /<select\b|createElement\(\s*(["'`])select\1\s*\)/g);
}

export function countUppercase(css: string): number {
  return countMatches(css, /text-transform:\s*uppercase/gi);
}

export function countDarkFieldWells(css: string): number {
  let count = 0;
  for (const [, selector, body] of stripCssComments(css).matchAll(INNERMOST_RULE)) {
    if (FIELD_SELECTOR.test(selector)) count += countMatches(body, DARK_WELL_BACKGROUND);
  }
  return count;
}

const ALLOWED_FONT_SIZE = String.raw`\s*(?:var\(--font-size-[\w-]+\)|inherit|[\d.]+(?:em|%))(?![\w-])`;
const QUOTE = String.raw`["'\`]`;
const RAW_FONT_SIZE = new RegExp(
  [
    String.raw`(?<![-\w])font-size\s*:(?!${ALLOWED_FONT_SIZE})`,
    String.raw`\bstyle\??\.fontSize\s*=(?!=)(?!\s*${QUOTE}${ALLOWED_FONT_SIZE}${QUOTE})`,
    String.raw`\bfontSize\s*:\s*${QUOTE}(?!${ALLOWED_FONT_SIZE})`,
    String.raw`setProperty\(\s*${QUOTE}font-size${QUOTE}\s*,(?!\s*${QUOTE}${ALLOWED_FONT_SIZE}${QUOTE})`,
  ].join("|"),
  "gi"
);

export function countRawFontSizes(source: string): number {
  return countMatches(stripCssComments(source), RAW_FONT_SIZE);
}

const WHITE_LITERAL = new RegExp(
  [
    String.raw`rgba?\(\s*255[\s,]+255[\s,]+255\b`,
    String.raw`hsla?\(\s*[\d.]+(?:deg)?[\s,]+[\d.]+%[\s,]+100%`,
    String.raw`#ffffff(?:[\da-f]{2})?(?![\da-f])`,
    String.raw`#fff[\da-f]?(?![\da-f])`,
    String.raw`(?<![\w-])white(?![\w-])`,
  ].join("|"),
  "i"
);
const CSS_URL = /url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)/gi;
const DECLARATION = /(?<![\w-])(-{0,2}[a-z][\w-]*)\s*:\s*([^;{}]+)(?=[;}])/gi;

export function countRawWhiteAlphas(css: string): number {
  let count = 0;
  const withoutUrls = stripCssComments(css).replace(CSS_URL, "url()");
  for (const [, property, value] of withoutUrls.matchAll(DECLARATION)) {
    if (!property.startsWith("--") && WHITE_LITERAL.test(value)) count++;
  }
  return count;
}
