import { containsNonLatin, detectNonLatinLanguage } from "@braccato/core/text";

const LATIN_LETTERS = /\p{Script=Latin}/gu;
const LATIN_LOOKALIKE_LETTERS = /[\p{Script=Cyrillic}\p{Script=Greek}]/gu;
const NON_LETTERS = /[^\p{L}\p{M}]+/u;

export interface ScriptClassifier {
  hasNonLatinScript(text: string): boolean;
  detectScriptLanguage(text: string): string | null;
}

interface ScriptBalance {
  latin: number;
  lookalikes: number;
}

function scriptBalance(text: string): ScriptBalance {
  return {
    latin: text.match(LATIN_LETTERS)?.length ?? 0,
    lookalikes: text.match(LATIN_LOOKALIKE_LETTERS)?.length ?? 0,
  };
}

function leansLatin({ latin, lookalikes }: ScriptBalance): boolean | null {
  return latin === lookalikes ? null : latin > lookalikes;
}

export function createScriptClassifier(songLines: readonly string[]): ScriptClassifier {
  const song = scriptBalance(songLines.join("\n"));

  const isStylizedLatinWord = (word: string, line: ScriptBalance): boolean => {
    const balance = scriptBalance(word);
    if (balance.lookalikes === 0) return false;
    return leansLatin(balance) ?? leansLatin(line) ?? leansLatin(song) ?? false;
  };

  const hasNonLatinScript = (text: string): boolean => {
    const line = scriptBalance(text);
    return text.split(NON_LETTERS).some(word => containsNonLatin(word) && !isStylizedLatinWord(word, line));
  };

  return {
    hasNonLatinScript,
    detectScriptLanguage: text => (hasNonLatinScript(text) ? detectNonLatinLanguage(text) : null),
  };
}
