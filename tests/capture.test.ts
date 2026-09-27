import test from 'node:test';
import assert from 'node:assert/strict';
import { captureNote, isUnorganized, CAPTURE_LIMIT } from '../src/lib/capture';
import { emptyWorkspace, parseWorkspace } from '../src/lib/workspace';

test('long emoji titles stay within the schema without splitting characters', () => {
  const note = captureNote('😀'.repeat(100), 'emoji', '2026-09-27T12:00:00Z');
  assert.equal(note.title, '😀'.repeat(50));
  assert.equal(parseWorkspace(JSON.stringify({ ...emptyWorkspace(), notes: [note] })).notes[0].title, note.title);
});

test('capture preserves text as escaped paragraphs, not executable HTML', () => {
  const note = captureNote('Minha ideia\n<script>alert(1)</script> & texto', 'capture', '2026-09-27T12:00:00Z');
  assert.equal(note.title, 'Minha ideia');
  assert.equal(note.content, '<p>Minha ideia</p><p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; texto</p>');
  assert.ok(isUnorganized(note));
  assert.deepEqual(parseWorkspace(JSON.stringify({ ...emptyWorkspace(), notes: [note] })).notes[0], note);
});
test('classification removes a capture from inbox without changing its content', () => {
  const note = captureNote('Uma reflexão', 'capture', '2026-09-27T12:00:00Z');
  for (const field of ['areaId', 'subjectId', 'notebookId'] as const) assert.equal(isUnorganized({ ...note, [field]: 'linked' }), false);
  assert.equal(isUnorganized({ ...note, areaId: undefined, notebookId: undefined }), true);
  assert.throws(() => captureNote('   ', 'n', note.updatedAt));
  assert.throws(() => captureNote('a'.repeat(CAPTURE_LIMIT + 1), 'n', note.updatedAt));
});
