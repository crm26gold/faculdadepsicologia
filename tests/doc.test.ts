import assert from 'node:assert/strict';
import { test } from 'node:test';
import { docText, docToHtml, emptyDoc, sanitizeDoc, toEditorJson, wordCount } from '../src/lib/doc';
import { acceptedTerms, contactAction, hasPro, spaceAction, TERMS_VERSION, upcomingBirthdays, workAction } from '../src/lib/community';

test('documento de parte remove fontes, cores, estilos e nós desconhecidos', () => {
  const doc = sanitizeDoc({ type: 'doc', content: [
    { type: 'paragraph', attrs: { style: 'color:red' }, content: [
      { type: 'text', text: 'Texto', marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#f00', fontFamily: 'Comic Sans' } }] },
    ] },
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Título' }] },
    { type: 'image', attrs: { src: 'https://evil.example/x.png' } },
    { type: 'table', content: [] },
    { type: 'codeBlock', content: [{ type: 'text', text: 'código' }] },
  ] });
  assert.deepEqual(doc, { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Texto', marks: [{ type: 'bold' }] }] },
    { type: 'heading', level: 2, content: [{ type: 'text', text: 'Título' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'código' }] },
  ] });
});

test('links perigosos são descartados e texto é escapado na exportação', () => {
  const doc = sanitizeDoc({ type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: '<script>alert(1)</script>', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
    { type: 'text', text: ' fonte', marks: [{ type: 'link', attrs: { href: 'https://example.invalid/a?b="c"' } }] },
  ] }] });
  const html = docToHtml(doc);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('href="https://example.invalid/a?b=&quot;c&quot;"'));
});

test('entradas inválidas viram documento vazio e listas são preservadas', () => {
  for (const value of [null, 'texto', 42, [], { type: 'paragraph' }]) assert.deepEqual(sanitizeDoc(value), emptyDoc());
  const doc = sanitizeDoc({ type: 'doc', content: [{ type: 'orderedList', content: [
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'um' }] }] },
    { type: 'bogus' },
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'dois' }] }] },
  ] }] });
  assert.equal(docToHtml(doc), '<ol><li><p>um</p></li><li><p>dois</p></li></ol>');
  assert.equal(docText(doc), 'um\ndois');
  assert.equal(wordCount(doc), 2);
  assert.deepEqual(sanitizeDoc(toEditorJson(doc)), doc);
});

test('ações coletivas validam formato antes de chegar ao banco', () => {
  assert.equal(spaceAction.safeParse({ action: 'create_post', space: crypto.randomUUID(), kind: 'material', title: 'Vídeo', link: 'javascript:alert(1)' }).success, false);
  assert.equal(spaceAction.safeParse({ action: 'create_post', space: crypto.randomUUID(), kind: 'material', title: 'Vídeo', link: 'https://youtu.be/x' }).success, true);
  assert.equal(spaceAction.safeParse({ action: 'accept_invitation', token: '../../etc' }).success, false);
  assert.equal(spaceAction.safeParse({ action: 'create_poll', space: crypto.randomUUID(), question: 'Q?', options: ['só uma'] }).success, false);
  assert.equal(workAction.safeParse({ action: 'create_assignments', spaces: [crypto.randomUUID()], title: 'T', style: { font: 'Comic Sans' } }).success, false);
  assert.equal(workAction.safeParse({ action: 'create_assignments', spaces: [crypto.randomUUID()], title: 'T', style: { font: 'Arial', size: 12, spacing: 1.5 } }).success, true);
  assert.equal(contactAction.safeParse({ action: 'save', contact: null, name: ' ', email: '' }).success, false);
});

test('plano e termos: piloto liberado, Pro com validade e aceite por versão', () => {
  const account = { user_id: 'u', email: '', display_name: '', is_master: false, plan: 'academic' as const, plan_source: 'free' as const, pro_until: null, ai_credits: 0, features: [], created_at: '' };
  assert.equal(hasPro({ account, settings: { open_access: true } }), true);
  assert.equal(hasPro({ account, settings: { open_access: false } }), false);
  assert.equal(hasPro({ account: { ...account, plan: 'pro', pro_until: '2000-01-01' }, settings: { open_access: false } }), false);
  assert.equal(hasPro({ account: { ...account, plan: 'pro' }, settings: { open_access: false } }), true);
  assert.equal(acceptedTerms({ consents: [{ document: 'terms', version: TERMS_VERSION }] }), false);
  assert.equal(acceptedTerms({ consents: [{ document: 'terms', version: TERMS_VERSION }, { document: 'privacy', version: TERMS_VERSION }] }), true);
});

test('aniversários próximos atravessam a virada do ano', () => {
  const contact = (name: string, birthdate: string | null) => ({ id: name, name, email: '', phone: '', birthdate, notes: '', created_at: '' });
  const result = upcomingBirthdays([contact('Hoje', '2000-12-30'), contact('Janeiro', '1999-01-05'), contact('Longe', '2001-06-01'), contact('Sem data', null)], '2026-12-30');
  assert.deepEqual(result.map(item => [item.contact.name, item.inDays]), [['Hoje', 0], ['Janeiro', 6]]);
});
