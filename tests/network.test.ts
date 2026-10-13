import assert from 'node:assert/strict';
import { test } from 'node:test';
import { networkAction, networkCall, networkRead, topicsIn } from '../src/lib/network';

const person = '11111111-1111-4111-8111-111111111111';

test('rede: #temas saem do texto e a publicação chega ao banco só com o permitido', () => {
  assert.deepEqual(topicsIn('Resumo de #Ética, cap. 2 #neuro-ciência e #ética de novo'), ['ética', 'neurociência']);
  assert.deepEqual(topicsIn('sem tema'), []);
  const post = networkAction.parse({ action: 'create_post', body: '  Dica #estudo  ', style: 'card_blue', audience: 'public' });
  assert.deepEqual(networkCall(post), { fn: 'create_network_post', args: { post_body: 'Dica #estudo', post_style: 'card_blue', post_audience: 'public', post_space: null, post_topics: ['estudo'] } });
  assert.equal(networkAction.safeParse({ action: 'create_post', body: 'x', audience: 'group' }).success, false, 'grupo sem escolher o grupo');
  assert.equal(networkAction.safeParse({ action: 'create_post', body: 'x', audience: 'followers', space: person }).success, false, 'grupo só com público de grupo');
  assert.equal(networkAction.safeParse({ action: 'create_post', body: '   ' }).success, false, 'publicação vazia');
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
