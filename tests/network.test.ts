import assert from 'node:assert/strict';
import { test } from 'node:test';
import { networkAction, networkCall, networkRead, photoOk, topicsIn } from '../src/lib/network';

const person = '11111111-1111-4111-8111-111111111111';

test('rede: #temas saem do texto e a publicação chega ao banco só com o permitido', () => {
  assert.deepEqual(topicsIn('Resumo de #Ética, cap. 2 #neuro-ciência e #ética de novo'), ['ética', 'neurociência']);
  assert.deepEqual(topicsIn('sem tema'), []);
  const post = networkAction.parse({ action: 'create_post', body: '  Dica #estudo  ', style: 'card_blue', audience: 'public' });
  assert.deepEqual(networkCall(post), { fn: 'create_network_post', args: { post_body: 'Dica #estudo', post_style: 'card_blue', post_audience: 'public', post_space: null,
    post_topics: ['estudo'], post_photos: [], is_story: false } });
  assert.equal(networkAction.safeParse({ action: 'create_post', body: 'x', audience: 'group' }).success, false, 'grupo sem escolher o grupo');
  assert.equal(networkAction.safeParse({ action: 'create_post', body: 'x', audience: 'followers', space: person }).success, false, 'grupo só com público de grupo');
  assert.equal(networkAction.safeParse({ action: 'create_post', body: '   ' }).success, false, 'publicação vazia');
  assert.equal(networkAction.safeParse({ action: 'create_post', body: '', photos: [] }).success, false, 'sem texto e sem foto');
  assert.equal(networkAction.safeParse({ action: 'create_post', body: 'x'.repeat(2201) }).success, false, 'texto longo demais');
  assert.equal(networkAction.safeParse({ action: 'react', post: person, kind: 'amei' }).success, false, 'reação fora da lista');
  assert.deepEqual(networkCall(networkAction.parse({ action: 'answer_follow', person, accept: true })), { fn: 'answer_follow', args: { follower: person, accept: true } });
  assert.deepEqual(networkCall(networkAction.parse({ action: 'mark_read' })), { fn: 'mark_updates_read', args: {} });
});

test('rede: leituras pela URL aceitam só pedidos bem formados', () => {
  const read = (query: string) => networkRead(new URLSearchParams(query));
  assert.deepEqual(read('feed=following'), { fn: 'network_feed', args: { feed: 'following', target: null, before: null } });
  assert.deepEqual(read(`feed=space&id=${person}&before=2026-10-13T10:00:00Z`), { fn: 'network_feed', args: { feed: 'space', target: person, before: '2026-10-13T10:00:00Z' } });
  assert.equal(read('feed=space&id=x'), null);
  assert.equal(read('feed=following&before=ontem'), null, 'data inválida');
  assert.deepEqual(read('topic=%23Ética'), { fn: 'topic_posts', args: { tag: 'ética', before: null } });
  assert.equal(read('topic=%23'), null);
  assert.deepEqual(read(`follows=${person}&list=followers`), { fn: 'follow_list', args: { target: person, which: 'followers' } });
  assert.equal(read(`follows=${person}&list=todos`), null);
  assert.deepEqual(read('updates=1'), { fn: 'network_updates', args: {} });
  assert.equal(read('qualquer=1'), null);
});

const jpeg = (size = 200) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size)]).toString('base64');
const webp = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBPVP8 '), Buffer.alloc(100)]).toString('base64');
const photo = (data = jpeg(), mime = 'image/jpeg') => ({ data, mime, width: 1080, height: 1350 });

test('rede: só passa foto JPEG ou WebP de verdade, até 300 KB e até 4 por publicação', () => {
  assert.ok(photoOk(jpeg(), 'image/jpeg'));
  assert.ok(photoOk(webp, 'image/webp'));
  assert.equal(photoOk(webp, 'image/jpeg'), false, 'tipo declarado diferente do arquivo');
  assert.equal(photoOk(Buffer.from('<svg onload=alert(1)>' + ' '.repeat(80)).toString('base64'), 'image/jpeg'), false, 'arquivo que não é foto');
  assert.equal(photoOk(jpeg(300 * 1024), 'image/jpeg'), false, 'maior que 300 KB');
  assert.equal(photoOk('não é base64!', 'image/jpeg'), false);
  const post = networkAction.parse({ action: 'create_post', body: '', style: 'card_rose', photos: [photo()] });
  assert.deepEqual(networkCall(post).args, { post_body: '', post_style: 'text', post_audience: 'followers', post_space: null, post_topics: [],
    post_photos: [photo()], is_story: false }, 'com foto, a legenda é opcional e o card vira texto');
  assert.equal(networkAction.safeParse({ action: 'create_post', body: 'x', photos: Array(5).fill(photo()) }).success, false, 'cinco fotos');
  assert.equal(networkAction.safeParse({ action: 'create_post', body: 'x', photos: [{ ...photo(), mime: 'image/png' }] }).success, false, 'PNG chega convertido');
  assert.equal(networkAction.safeParse({ action: 'create_post', body: 'x', photos: [{ ...photo(), width: 0 }] }).success, false, 'tamanho inválido');
});

test('rede: story leva uma foto ou um card e nunca é só para mim', () => {
  assert.equal(networkCall(networkAction.parse({ action: 'create_post', body: 'Estudando', style: 'card_blue', story: true })).args.is_story, true);
  assert.equal(networkAction.safeParse({ action: 'create_post', body: '', photos: [photo(), photo()], story: true }).success, false, 'duas fotos');
  assert.equal(networkAction.safeParse({ action: 'create_post', body: 'x', audience: 'private', story: true }).success, false, 'só para mim');
  const read = (query: string) => networkRead(new URLSearchParams(query));
  assert.deepEqual(read('stories=following'), { fn: 'network_stories', args: { feed: 'following' } });
  assert.deepEqual(read('stories=groups'), { fn: 'network_stories', args: { feed: 'groups' } });
  assert.equal(read('stories=todos'), null);
});
