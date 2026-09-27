export type SpellingIssue = { word: string; from: number; to: number };
export function spellingTokens(text: string, offset = 0): SpellingIssue[] {
  const excluded = [...text.matchAll(/(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w.-]+\.[a-z]+/gi)].map(match => [match.index!, match.index! + match[0].length]);
  return [...text.matchAll(/\p{L}[\p{L}\p{M}]*(?:[-’']\p{L}[\p{L}\p{M}]*)*/gu)]
    .filter(match => match[0].length > 1 && match[0].length <= 60 && !excluded.some(([start, end]) => match.index! >= start && match.index! < end))
    .map(match => ({ word: match[0], from: offset + match.index!, to: offset + match.index! + match[0].length }));
}
