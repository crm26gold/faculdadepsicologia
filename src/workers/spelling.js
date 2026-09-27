import { createHunspellFromStrings } from './hunspell/dist/Hunspell.js';
let dictionary;
const ready = Promise.all(['index.aff', 'index.dic'].map(async name => {
  const response = await fetch(new URL(name, import.meta.url));
  if (!response.ok) throw new Error('Dicionário indisponível');
  return response.text();
})).then(([aff, dic]) => createHunspellFromStrings(aff, dic)).then(value => { dictionary = value; });
// No document content leaves this Worker. Only static assets are fetched.
self.onmessage = async ({ data }) => {
  try {
    await ready;
    if (data.kind === 'suggest') {
      self.postMessage({ id: data.id, kind: 'suggest', word: data.word, suggestions: dictionary.getSpellingSuggestions(data.word).slice(0, 8) });
    } else {
      const words = [...new Set(data.words)];
      self.postMessage({ id: data.id, kind: 'check', incorrect: words.filter(word => !dictionary.testSpelling(word)) });
    }
  } catch { self.postMessage({ id: data.id, kind: 'error' }); }
};
