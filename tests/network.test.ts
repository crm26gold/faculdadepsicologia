import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatPush, networkAction, networkCall, networkPush, networkRead, photoOk, topicsIn } from '../src/lib/network';

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
    post_photos: [{ ...photo(), alt: '' }], is_story: false }, 'com foto, a legenda é opcional e o card vira texto');
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

test('rede: Salvos, destaques e descrição da foto', () => {
  assert.deepEqual(networkCall(networkAction.parse({ action: 'save', post: person })), { fn: 'toggle_save', args: { target: person } });
  assert.deepEqual(networkCall(networkAction.parse({ action: 'keep_story', post: person, title: '  Estágio ' })), { fn: 'keep_story', args: { target: person, title: 'Estágio' } });
  assert.deepEqual(networkCall(networkAction.parse({ action: 'keep_story', post: person, title: '' })).args, { target: person, title: '' }, 'título vazio tira do perfil');
  assert.equal(networkAction.safeParse({ action: 'keep_story', post: person, title: 'a'.repeat(31) }).success, false, 'título longo');
  assert.equal(networkAction.safeParse({ action: 'save', post: 'x' }).success, false);
  const post = networkAction.parse({ action: 'create_post', body: '', photos: [{ ...photo(), alt: '  Mapa mental do capítulo 3 ' }] });
  assert.equal((networkCall(post).args.post_photos as { alt: string }[])[0].alt, 'Mapa mental do capítulo 3');
  assert.equal(networkAction.safeParse({ action: 'create_post', body: '', photos: [{ ...photo(), alt: 'a'.repeat(301) }] }).success, false, 'descrição longa');
  const read = (query: string) => networkRead(new URLSearchParams(query));
  assert.deepEqual(read('saved=1'), { fn: 'saved_feed', args: { before: null } });
  assert.deepEqual(read('saved=1&before=2026-10-13T10:00:00Z'), { fn: 'saved_feed', args: { before: '2026-10-13T10:00:00Z' } });
});

test('rede: a notificação conta a primeira novidade e quantas mais chegaram', () => {
  assert.deepEqual(networkPush([{ kind: 'follow', actor: 'Ana', post: null, space: null }]), { title: 'Networking', body: 'Ana começou a seguir você' });
  assert.equal(networkPush([{ kind: 'join_request', actor: 'Caio', post: null, space: 'Corrida' }]).body, 'Caio pediu para entrar no grupo Corrida');
  const long = 'Resumo do capítulo 3 de Ética com os três princípios e exemplos da aula de hoje';
  assert.equal(networkPush([{ kind: 'gostei', actor: 'Duda', post: long, space: null },
    { kind: 'util', actor: 'Ana', post: long, space: null }]).body, 'Duda gostou da sua publicação: “Resumo do capítulo 3 de Ética com os três princípios e…” e mais 1 novidade');
  assert.equal(networkPush([{ kind: 'gostei', actor: null, post: '', space: null }, { kind: 'follow', actor: 'B', post: null, space: null },
    { kind: 'follow', actor: 'C', post: null, space: null }]).body, 'Alguém gostou da sua publicação e mais 2 novidades', 'foto sem legenda e conta apagada');
});

test('rede: bloquear e denunciar vão ao banco só com o permitido', () => {
  assert.deepEqual(networkCall(networkAction.parse({ action: 'block', person, blocking: true })), { fn: 'block_person', args: { target: person, blocking: true } });
  assert.deepEqual(networkCall(networkAction.parse({ action: 'report', person, reason: 'spam', note: '  propaganda ' })),
    { fn: 'report_content', args: { target: person, post: null, why: 'spam', details: 'propaganda' } });
  assert.equal(networkAction.safeParse({ action: 'report', person, reason: 'chato' }).success, false, 'motivo fora da lista');
  assert.equal(networkAction.safeParse({ action: 'report', person, reason: 'outro', note: 'a'.repeat(501) }).success, false, 'observação longa');
  assert.equal(networkAction.safeParse({ action: 'block', person: 'x', blocking: true }).success, false);
  assert.deepEqual(networkRead(new URLSearchParams('blocked=1')), { fn: 'my_blocks', args: {} });
});

test('rede: a conversa do grupo vai ao banco só com o permitido', () => {
  const space = '22222222-2222-4222-8222-222222222222', message = '33333333-3333-4333-8333-333333333333';
  assert.deepEqual(networkCall(networkAction.parse({ action: 'send_message', space, body: '  Oi, turma ' })),
    { fn: 'send_message', args: { target: space, message_body: 'Oi, turma', reply: null, photo: null } });
  assert.deepEqual(networkCall(networkAction.parse({ action: 'send_message', space, body: '', reply: message, photo: photo() })).args,
    { target: space, message_body: '', reply: message, photo: { ...photo(), alt: '' } }, 'só a foto, respondendo');
  assert.equal(networkAction.safeParse({ action: 'send_message', space, body: '   ' }).success, false, 'vazia');
  assert.equal(networkAction.safeParse({ action: 'send_message', space, body: 'a'.repeat(4001) }).success, false, 'longa demais');
  assert.equal(networkAction.safeParse({ action: 'send_message', space, body: 'x', photo: { ...photo(), mime: 'image/png' } }).success, false, 'PNG chega convertido');
  assert.deepEqual(networkCall(networkAction.parse({ action: 'delete_message', message })), { fn: 'delete_message', args: { target: message } });
  assert.deepEqual(networkCall(networkAction.parse({ action: 'mute_group', space, muted: true })), { fn: 'mute_space', args: { target: space, muted: true } });
  assert.deepEqual(networkCall(networkAction.parse({ action: 'report', person, message, reason: 'assedio' })),
    { fn: 'report_message', args: { target: message, why: 'assedio', details: '' } }, 'denúncia da mensagem');
  const read = (query: string) => networkRead(new URLSearchParams(query));
  assert.deepEqual(read(`chat=${space}&seen=1`), { fn: 'chat_messages', args: { target: space, after: null, before: null, seen: true } });
  assert.deepEqual(read(`chat=${space}&after=2026-10-13T20:49:24.959889%2B00:00`)?.args,
    { target: space, after: '2026-10-13T20:49:24.959889+00:00', before: null, seen: false });
  assert.equal(read('chat=x'), null);
  assert.equal(read(`chat=${space}&after=ontem`), null, 'cursor inválido');
});

test('rede: a notificação da conversa diz o grupo, quem escreveu e quantas chegaram', () => {
  assert.deepEqual(chatPush({ space: 's', group: 'Ética', count: 1, author: 'Bia', excerpt: 'Prova na sexta', photo: false }), { title: 'Ética', body: 'Bia: Prova na sexta' });
  assert.equal(chatPush({ space: 's', group: 'Ética', count: 3, author: 'Bia', excerpt: '', photo: true }).body, '3 mensagens novas · Bia: 📷 Foto');
  assert.equal(chatPush({ space: 's', group: 'Ética', count: 1, author: null, excerpt: 'Olha o quadro', photo: true }).body, 'Alguém: 📷 Olha o quadro');
  const long = 'Pessoal, a prova de amanhã vai cobrir os capítulos três, quatro e cinco do livro';
  assert.equal(chatPush({ space: 's', group: 'Ética', count: 1, author: 'Bia', excerpt: long, photo: false }).body, 'Bia: Pessoal, a prova de amanhã vai cobrir os capítulos três,…');
});

test('rede: desafios vão ao banco só com o permitido', () => {
  const space = '22222222-2222-4222-8222-222222222222', challenge = '44444444-4444-4444-8444-444444444444';
  const create = (extra: Record<string, unknown>) => networkAction.safeParse({ action: 'challenge_create', space, title: ' Ler ', kind: 'feito', start: '2026-10-14', days: 30, ...extra });
  const made = create({ rest: [0, 6, 0] });
  assert.ok(made.success);
  assert.deepEqual(networkCall(made.data), { fn: 'challenge_create', args: { target: space, challenge_title: 'Ler', challenge_details: '', challenge_kind: 'feito',
    unit_name: '', goal: null, start_day: '2026-10-14', duration: 30, rest: [0, 6] } }, 'sem meta no "feito" e descanso sem repetir');
  const amount = create({ kind: 'quantidade', goal: 10, unit: ' páginas ' });
  assert.ok(amount.success);
  assert.deepEqual(networkCall(amount.data).args, { target: space, challenge_title: 'Ler', challenge_details: '', challenge_kind: 'quantidade',
    unit_name: 'páginas', goal: 10, start_day: '2026-10-14', duration: 30, rest: [] });
  assert.equal(create({ kind: 'quantidade', goal: 10 }).success, false, 'quantidade sem unidade');
  assert.equal(create({ kind: 'quantidade', unit: 'km' }).success, false, 'quantidade sem meta');
  assert.equal(create({ days: 2 }).success, false, 'curto demais');
  assert.equal(create({ days: 366 }).success, false, 'longo demais');
  assert.equal(create({ rest: [1, 2, 3, 4] }).success, false, 'descanso demais');
  assert.equal(create({ rest: [7] }).success, false, 'dia da semana inválido');
  assert.equal(create({ start: '14/10/2026' }).success, false, 'data fora do formato');
  assert.equal(create({ start: '2026-02-30' }).success, false, 'data que não existe');
  assert.equal(create({ kind: 'quantidade', unit: 'km', goal: 0.001 }).success, false, 'meta que vira zero no banco');
  assert.equal(create({ title: '  ' }).success, false, 'sem nome');
  assert.deepEqual(networkCall(networkAction.parse({ action: 'challenge_checkin', challenge, day: '2026-10-14', done: true, amount: 12.5 })),
    { fn: 'challenge_checkin', args: { target: challenge, which_day: '2026-10-14', done: true, how_much: 12.5 } });
  assert.equal(networkAction.safeParse({ action: 'challenge_checkin', challenge, day: '2026-10-14', done: true, amount: -1 }).success, false, 'quantidade negativa');
  assert.equal(networkAction.safeParse({ action: 'challenge_checkin', challenge, day: '2026-10-14', done: true, amount: 0.004 }).success, false, 'quantidade que vira zero');
  assert.deepEqual(networkCall(networkAction.parse({ action: 'challenge_join', challenge, joining: false })), { fn: 'challenge_join', args: { target: challenge, joining: false } });
  assert.deepEqual(networkCall(networkAction.parse({ action: 'challenge_manage', challenge, cancel: true })),
    { fn: 'challenge_manage', args: { target: challenge, challenge_title: '', challenge_details: '', cancel: true } });
  assert.equal(networkAction.safeParse({ action: 'challenge_manage', challenge, title: ' ' }).success, false, 'renomear sem nome');
  assert.deepEqual(networkCall(networkAction.parse({ action: 'achievement_audience', achievement: challenge, audience: 'followers' })),
    { fn: 'achievement_audience', args: { target: challenge, next_audience: 'followers' } });
  assert.equal(networkAction.safeParse({ action: 'achievement_audience', achievement: challenge, audience: 'group' }).success, false, 'medalha não vai para grupo');
  assert.deepEqual(networkCall(networkAction.parse({ action: 'show_achievements', shown: false })), { fn: 'show_achievements', args: { shown: false } });
  assert.deepEqual(networkCall(networkAction.parse({ action: 'react', post: challenge, kind: 'forca' })).args, { target: challenge, reaction: 'forca' });
  const read = (query: string) => networkRead(new URLSearchParams(query));
  assert.deepEqual(read(`challenges=${space}`), { fn: 'space_challenges', args: { target: space } });
  assert.deepEqual(read('challenges=today'), { fn: 'my_challenges_today', args: {} });
  assert.deepEqual(read(`achievements=${person}`), { fn: 'person_achievements', args: { target: person } });
  assert.equal(read('challenges=x'), null);
  assert.equal(read('achievements=x'), null);
});

test('rede: a medalha avisa a própria pessoa; "Dar força" diz quem foi', () => {
  assert.deepEqual(networkPush([{ kind: 'medal', actor: 'Caio', post: 'Concluí o desafio “Ler” 🏅', space: 'Treino' }]),
    { title: 'Networking', body: '🏅 Você concluiu um desafio em Treino e ganhou uma medalha' });
  assert.equal(networkPush([{ kind: 'forca', actor: 'Bia', post: '7 dias seguidos em “Ler” 🔥', space: null }]).body,
    'Bia deu força na sua conquista: “7 dias seguidos em “Ler” 🔥”');
});
