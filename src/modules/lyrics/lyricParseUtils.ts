/**
 * @author Stephen Brown
 * Source: https://github.com/stephenjjbrown/string-similarity-js/
 * @licence MIT License - https://github.com/stephenjjbrown/string-similarity-js/blob/master/LICENSE.md
 * @param str1 First string to match
 * @param str2 Second string to match
 * @param [substringLength=2] Optional. Length of substring to be used in calculating similarity. Default 2.
 * @param [caseSensitive=false] Optional. Whether you want to consider case in string matching. Default false;
 * @returns Number between 0 and 1, with 0 being a low match score.
 */
export const stringSimilarity = (str1: string, str2: string, substringLength = 2, caseSensitive = false): number => {
  if (!caseSensitive) {
    str1 = str1.toLowerCase();
    str2 = str2.toLowerCase();
  }
  if (str1.length < substringLength || str2.length < substringLength) return 0;
  const map = new Map<string, number>();
  for (let i = 0; i < str1.length - (substringLength - 1); i++) {
    const substr1 = str1.substring(i, i + substringLength);
    map.set(substr1, map.has(substr1) ? map.get(substr1)! + 1 : 1);
  }
  let match = 0;
  for (let j = 0; j < str2.length - (substringLength - 1); j++) {
    let substr2 = str2.substring(j, j + substringLength);
    let count = map.has(substr2) ? map.get(substr2)! : 0;
    if (count > 0) {
      map.set(substr2, count - 1);
      match++;
    }
  }
  return (match * 2) / (str1.length + str2.length - (substringLength - 1) * 2);
};
