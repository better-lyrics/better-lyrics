import { t } from "@core/i18n";

export interface CreditPart {
  text: string;
  strong: boolean;
}

// -- Wording --------------------------

const MARK = "\u2063";
const token = (i: number) => `${MARK}${i}${MARK}`;
const TOKEN_SPLIT = new RegExp(`${MARK}(\\d)${MARK}`);

export function creditParts(names: string[]): CreditPart[] {
  const shown = names.slice(0, 2);
  const key =
    names.length === 1 ? "unison_credit_one" : names.length === 2 ? "unison_credit_two" : "unison_credit_many";
  const subs = names.length > 2 ? [token(0), token(1), String(names.length - 2)] : shown.map((_, i) => token(i));
  return t(key, subs)
    .split(TOKEN_SPLIT)
    .map((piece, i) => (i % 2 ? { text: shown[Number(piece)], strong: true } : { text: piece, strong: false }))
    .filter(part => part.text);
}
