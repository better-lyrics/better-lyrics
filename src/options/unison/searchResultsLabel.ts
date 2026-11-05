const QUERY_SLOT = "\uE000";

interface SearchResultsLabel {
  before: string;
  query: string;
  after: string;
}

export function searchResultsMessage(count: number): { key: string; subs: string[] } {
  return count === 1
    ? { key: "unison_searchResultsOne", subs: [QUERY_SLOT] }
    : { key: "unison_searchResults", subs: [QUERY_SLOT, count.toLocaleString()] };
}

export function splitSearchResultsMessage(message: string, query: string): SearchResultsLabel {
  const at = message.indexOf(QUERY_SLOT);
  const trimmed = query.trim();
  if (at < 0) return { before: message, query: "", after: "" };
  return { before: message.slice(0, at), query: trimmed, after: message.slice(at + QUERY_SLOT.length) };
}
