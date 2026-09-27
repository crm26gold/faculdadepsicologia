import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeLink, safeMediaSource, validMedia, MEDIA_LIMIT } from '../src/lib/note-media';
import { spellingTokens } from '../src/lib/spelling';

test('links reject active content, relative paths and credentials', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.test', 'https://user:pass@example.com', 'java\nscript:alert(1)']) assert.equal(safeLink(bad), false);
  assert.equal(safeLink('https://example.com/a?q=teste'), true);
  assert.equal(safeLink('mailto:person@example.com'), true);
});
test('private media references exclude external URLs and traversal', () => {
  assert.ok(safeMediaSource('/api/note-media/11111111-1111-4111-8111-111111111111.png'));
  for (const bad of ['https://tracker.test/photo.png', 'data:image/png;base64,xx', '/api/note-media/../secret', '/api/note-media/file.svg']) assert.equal(safeMediaSource(bad), '');
});
test('media upload type and size limits', () => {
  assert.equal(validMedia('image/png', MEDIA_LIMIT), true);
  assert.equal(validMedia('audio/mpeg', 100), true);
  for (const [type, size] of [['image/svg+xml', 10], ['text/html', 10], ['image/png', MEDIA_LIMIT + 1], ['audio/mpeg', 0]] as const) assert.equal(validMedia(type, size), false);
});
test('spelling positions preserve accents and exclude URLs/email', () => {
  const text = 'Atenção imbiqo https://example.com/imbiqo pessoa@example.com';
  assert.deepEqual(spellingTokens(text, 4), [{ word: 'Atenção', from: 4, to: 11 }, { word: 'imbiqo', from: 12, to: 18 }]);
});
