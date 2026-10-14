// Rede do Networking: seguir, publicações, reações e atualizações. As permissões ficam no banco;
// aqui só se valida formato e se traduz a ação da tela para a função do banco.
import { z } from 'zod';
import { normalizeTopics, type Avatar } from './community';

export const postStyles = ['text', 'card_blue', 'card_sand', 'card_lavender', 'card_rose', 'card_green'] as const;
export type PostStyle = typeof postStyles[number];
export const styleLabels: Record<PostStyle, string> = {
  text: 'Texto', card_blue: 'Card azul', card_sand: 'Card areia', card_lavender: 'Card lavanda', card_rose: 'Card rosa', card_green: 'Card verde',
};
export const audiences = ['followers', 'public', 'group', 'private'] as const;
export type Audience = typeof audiences[number];
export const audienceLabels: Record<Audience, string> = { followers: 'Seguidores', public: 'Todos', group: 'Um grupo', private: 'Só eu' };
/** "Dar força" (forca) só nos marcos dos desafios; "Útil" só nas publicações comuns; "Gostei" em tudo. */
export type Reaction = 'gostei' | 'util' | 'forca';

export type Person = { id: string; name: string; avatar: Avatar | null; bio?: string };
export type Photo = { id: string; w: number; h: number; alt?: string };
/** Marco de desafio publicado pelo app no grupo: dias seguidos (7, 15, 30) ou 0, quando concluiu. */
export type Milestone = { challenge: string; title: string; days: number; done?: number; of?: number };
export type NetworkPost = {
  id: string; author: Person; body: string; style: PostStyle | 'milestone'; audience: Audience; topics: string[]; created_at: string;
  space: { id: string; name: string } | null; counts: Record<'gostei' | 'util', number> & { forca?: number }; mine: Reaction[];
  milestone?: Milestone | null;
  photos: Photo[]; expires_at: string | null; highlight?: string | null; saved?: boolean; saved_at?: string;
};
export type Highlight = { title: string; stories: NetworkPost[] };
export type StoryGroup = { author: Person; stories: NetworkPost[] };
export type PersonProfile = Person & {
  bio: string; closed: boolean; is_me: boolean; discoverable: boolean | null; show_follows: boolean;
  status: 'none' | 'requested' | 'following'; follows_me: boolean; requested_me: boolean;
  followers: number; following: number; posts: NetworkPost[]; highlights?: Highlight[]; photo_large?: string | null;
  /** Você bloqueou esta pessoa: o perfil vira um cartão para desbloquear. */
  blocked?: boolean;
};
export type NetworkEvent = {
  id: number; kind: 'follow' | 'follow_request' | 'follow_accepted' | Reaction | 'join_request' | 'join_approved' | 'medal';
  created_at: string; read: boolean; actor: Person | null; post: { id: string; body: string } | null; space: { id: string; name: string } | null;
};
export type Updates = { requests: Person[]; events: NetworkEvent[] };
export const reportReasons = ['spam', 'ofensa', 'assedio', 'improprio', 'outro'] as const;
export const reasonLabels: Record<typeof reportReasons[number], string> = {
  spam: 'Spam, golpe ou propaganda', ofensa: 'Ofensa ou discurso de ódio', assedio: 'Assédio ou ameaça', improprio: 'Conteúdo impróprio', outro: 'Outro motivo',
};
export const eventText: Record<NetworkEvent['kind'], string> = {
  follow: 'começou a seguir você', follow_request: 'pediu para seguir você', follow_accepted: 'aceitou seu pedido para seguir',
  gostei: 'gostou da sua publicação', util: 'achou útil sua publicação', join_request: 'pediu para entrar no grupo', join_approved: 'aceitou você no grupo',
  forca: 'deu força na sua conquista', medal: 'concluiu um desafio e ganhou uma medalha',
};

/** Conversa do grupo: a mensagem como a tela mostra, e uma página da conversa. */
export type ChatMessage = {
  id: string; author: string | null; body: string; created_at: string; changed_at: string;
  /** joined: a linha "Fulano entrou no grupo", escrita pelo banco. */
  kind?: 'text' | 'joined';
  /** Quem apagou: a própria pessoa ou a moderação (dono ou líder do grupo, ou a administração por denúncia). */
  deleted: 'author' | 'moderation' | null;
  reply: { id: string; author: string | null; excerpt: string; photo: boolean; deleted: boolean; blocked?: boolean } | null;
  /** stored false: a foto já saiu do servidor; pode continuar no aparelho de quem viu. */
  photo: { width: number; height: number; alt: string; stored: boolean } | null;
  blocked: boolean;
  /** Só no aparelho: enviando ou não enviada. */
  pending?: 'sending' | 'failed';
};
export type ChatPage = {
  messages: ChatMessage[]; people: Record<string, Person | null>; read_at: string | null;
  moderator: boolean; open: boolean; muted: boolean; photo_days: number | null;
};

/** Desafios do grupo e conquistas. Os dias são datas de São Paulo (AAAA-MM-DD); domingo = 0. */
export type ChallengeKind = 'feito' | 'quantidade';
export type ChallengeDay = { amount: number | null; done: boolean };
export type Challenge = {
  id: string; title: string; description: string; kind: ChallengeKind; unit: string; goal: number | null;
  starts_on: string; ends_on: string; rest_days: number[]; today: string;
  state: 'active' | 'soon' | 'ended' | 'cancelled'; creator: Person | null; can_manage: boolean;
  people: number; done_today: { count: number; people: Person[] }; progress: number;
  me: null | { streak: number; done_days: number; required: number; today: ChallengeDay | null; yesterday: ChallengeDay | null;
    recent: { day: string; done: boolean; rest: boolean }[]; medal: boolean };
};
export type TodayChallenge = {
  id: string; title: string; kind: ChallengeKind; unit: string; goal: number | null; space: { id: string; name: string };
  rest: boolean; amount: number | null; done: boolean; streak: number;
};
export const achievementAudiences = ['private', 'followers', 'public'] as const;
export type AchievementAudience = typeof achievementAudiences[number];
export const achievementAudienceLabels: Record<AchievementAudience, string> = { private: 'Só eu', followers: 'Seguidores', public: 'Público' };
export type Achievement = {
  id: string; kind: 'medal'; title: string; created_at: string; audience?: AchievementAudience | null;
  detail: { kind?: ChallengeKind; unit?: string; goal?: number | null; days?: number; done?: number; space?: string; starts_on?: string; ends_on?: string };
};
export type Achievements = { shown: boolean; items: Achievement[] };
export const weekdayShort = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
/** "Achar horário em comum": cada hora marcada é um índice (posição do dia × 24 + hora). */
export type TimeFinder = {
  id: string; title: string; days: string[]; from_hour: number; to_hour: number; chosen: { day: string; hour: number } | null;
  creator: Person | null; can_manage: boolean; created_at: string; mine: number[]; marks: { person: Person | null; slots: number[] }[];
};

/** Uma notificação por conversa: quem escreveu por último, o trecho e quantas chegaram. */
export type ChatPush = { space: string; group: string; count: number; author: string | null; excerpt: string; photo: boolean };
export function chatPush(item: ChatPush) {
  const cut = item.excerpt.slice(0, 60), end = cut.lastIndexOf(' ');
  const said = item.excerpt.length <= 60 ? item.excerpt : `${(end > 40 ? cut.slice(0, end) : cut).trimEnd()}…`;
  const line = `${item.author || 'Alguém'}: ${item.photo ? `📷 ${said || 'Foto'}` : said || 'Mensagem'}`;
  return { title: item.group, body: item.count > 1 ? `${item.count} mensagens novas · ${line}` : line };
}

/** Uma notificação por pessoa a cada minuto do relógio: a primeira novidade escrita e quantas mais chegaram. */
export type PushEvent = { kind: NetworkEvent['kind']; actor: string | null; post: string | null; space: string | null };
export function networkPush(events: PushEvent[]) {
  const [first] = events;
  const cut = first.post?.slice(0, 60) ?? '', end = cut.lastIndexOf(' ');
  // O trecho para numa palavra inteira.
  const post = !first.post ? '' : first.post.length <= 60 ? first.post : `${(end > 40 ? cut.slice(0, end) : cut).trimEnd()}…`;
  // A medalha é da própria pessoa: o texto fala com ela.
  const line = first.kind === 'medal' ? `🏅 Você concluiu um desafio${first.space ? ` em ${first.space}` : ''} e ganhou uma medalha`
    : `${first.actor || 'Alguém'} ${eventText[first.kind]}${first.space ? ` ${first.space}` : ''}${post ? `: “${post}”` : ''}`;
  const more = events.length - 1;
  return { title: 'Networking', body: more ? `${line} e mais ${more} ${more === 1 ? 'novidade' : 'novidades'}` : line };
}

/** Os #temas citados no texto viram a busca por tema da publicação. */
export const topicsIn = (body: string) => normalizeTopics((body.match(/#[^\s#.,;:!?()]+/g) ?? []).join(' '));

// Fotos: o aparelho reduz antes de enviar; aqui e no banco só passa JPEG ou WebP de verdade, de até 300 KB.
export const PHOTO_LIMIT = 300 * 1024;
export const photoTypes = ['image/jpeg', 'image/webp'] as const;
export function photoOk(data: string, mime: string) {
  if (data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return false;
  const size = data.length / 4 * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
  if (size < 64 || size > PHOTO_LIMIT) return false;
  const head = atob(data.slice(0, 16));
  return mime === 'image/jpeg' ? head.startsWith('\xff\xd8\xff') : mime === 'image/webp' && head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP';
}
const side = z.number().int().min(1).max(4096);
const photo = z.object({ data: z.string().max(PHOTO_LIMIT / 3 * 4 + 4), mime: z.enum(photoTypes), width: side, height: side,
  alt: z.string().trim().max(300, 'A descrição da foto vai até 300 letras.').default('') })
  .refine(value => photoOk(value.data, value.mime), 'Use uma foto JPG ou WebP de até 300 KB.');

const id = z.uuid();
const dayText = z.iso.date('Data inválida.');
// O banco guarda duas casas decimais: 0,001 viraria zero.
const amountOf = (message: string) => z.number().min(0.01, message).max(100000, 'Até 100.000.');
export const networkAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create_post'), body: z.string().trim().max(2200), style: z.enum(postStyles).default('text'),
    audience: z.enum(audiences).default('followers'), space: id.nullable().default(null),
    photos: z.array(photo).max(4, 'Até 4 fotos por publicação.').default([]), story: z.boolean().default(false) })
    .refine(value => (value.audience === 'group') === Boolean(value.space), 'Escolha o grupo.')
    .refine(value => value.body || value.photos.length, 'Escreva alguma coisa ou escolha uma foto.')
    .refine(value => !value.story || (value.photos.length <= 1 && value.audience !== 'private'), 'O story leva uma foto e não pode ser só para você.'),
  z.object({ action: z.literal('delete_post'), post: id }),
  z.object({ action: z.literal('react'), post: id, kind: z.enum(['gostei', 'util', 'forca']) }),
  z.object({ action: z.literal('save'), post: id }),
  z.object({ action: z.literal('block'), person: id, blocking: z.boolean() }),
  z.object({ action: z.literal('report'), person: id, post: id.nullable().default(null), message: id.nullable().default(null), reason: z.enum(reportReasons),
    note: z.string().trim().max(500, 'A observação vai até 500 letras.').default('') }),
  z.object({ action: z.literal('send_message'), space: id, body: z.string().trim().max(4000, 'A mensagem vai até 4.000 letras.'),
    reply: id.nullable().default(null), photo: photo.nullable().default(null) })
    .refine(value => value.body || value.photo, 'Escreva alguma coisa ou escolha uma foto.'),
  z.object({ action: z.literal('delete_message'), message: id }),
  z.object({ action: z.literal('mute_group'), space: id, muted: z.boolean() }),
  z.object({ action: z.literal('challenge_create'), space: id, title: z.string().trim().min(1, 'Dê um nome ao desafio.').max(120, 'O nome vai até 120 letras.'),
    description: z.string().trim().max(1000, 'A descrição vai até 1.000 letras.').default(''), kind: z.enum(['feito', 'quantidade']),
    unit: z.string().trim().max(20, 'A unidade vai até 20 letras.').default(''), goal: amountOf('A meta do dia vai de 0,01 a 100.000.').nullable().default(null),
    start: dayText, days: z.number().int().min(3, 'O desafio dura pelo menos 3 dias.').max(365, 'O desafio dura até 365 dias.'),
    rest: z.array(z.number().int().min(0).max(6)).max(3, 'Até 3 dias de descanso por semana.').transform(value => [...new Set(value)]).default([]) })
    .refine(value => value.kind === 'feito' || (value.goal && value.unit), 'Diga a meta do dia e a unidade (páginas, km, copos…).'),
  z.object({ action: z.literal('challenge_manage'), challenge: id, title: z.string().trim().max(120, 'O nome vai até 120 letras.').default(''),
    description: z.string().trim().max(1000, 'A descrição vai até 1.000 letras.').default(''), cancel: z.boolean().default(false) })
    .refine(value => value.cancel || value.title, 'Dê um nome ao desafio.'),
  z.object({ action: z.literal('challenge_join'), challenge: id, joining: z.boolean() }),
  z.object({ action: z.literal('challenge_checkin'), challenge: id, day: dayText, done: z.boolean(),
    amount: amountOf('Diga quanto fez.').nullable().default(null) }),
  z.object({ action: z.literal('achievement_audience'), achievement: id, audience: z.enum(achievementAudiences) }),
  z.object({ action: z.literal('show_achievements'), shown: z.boolean() }),
  z.object({ action: z.literal('finder_create'), space: id, title: z.string().trim().min(1, 'Dê um nome, como “Reunião do trabalho”.').max(120, 'O nome vai até 120 letras.'),
    days: z.array(dayText).min(1, 'Escolha pelo menos um dia.').max(7, 'Até 7 dias.'), from: z.number().int().min(0).max(23), to: z.number().int().min(1).max(24) })
    .refine(value => value.to > value.from, 'A hora final vem depois da inicial.'),
  z.object({ action: z.literal('finder_mark'), finder: id, slots: z.array(z.number().int().min(0).max(167)).max(168) }),
  z.object({ action: z.literal('finder_manage'), finder: id, day: dayText.nullable().default(null), hour: z.number().int().min(0).max(23).nullable().default(null),
    remove: z.boolean().default(false) }).refine(value => value.remove || (value.day && value.hour !== null), 'Escolha o dia e a hora.'),
  z.object({ action: z.literal('keep_story'), post: id, title: z.string().trim().max(30, 'O título do destaque vai até 30 letras.') }),
  z.object({ action: z.literal('follow'), person: id }),
  z.object({ action: z.literal('unfollow'), person: id }),
  z.object({ action: z.literal('answer_follow'), person: id, accept: z.boolean() }),
  z.object({ action: z.literal('remove_follower'), person: id }),
  z.object({ action: z.literal('mark_read') }),
]);
type NetworkAction = z.infer<typeof networkAction>;
type DbCall = { fn: string; args: Record<string, unknown> };

export function networkCall(body: NetworkAction): DbCall {
  switch (body.action) {
    case 'create_post': return { fn: 'create_network_post', args: { post_body: body.body, post_style: body.photos.length ? 'text' : body.style,
      post_audience: body.audience, post_space: body.audience === 'group' ? body.space : null, post_topics: topicsIn(body.body),
      post_photos: body.photos, is_story: body.story } };
    case 'delete_post': return { fn: 'delete_network_post', args: { target: body.post } };
    case 'react': return { fn: 'toggle_reaction', args: { target: body.post, reaction: body.kind } };
    case 'save': return { fn: 'toggle_save', args: { target: body.post } };
    case 'block': return { fn: 'block_person', args: { target: body.person, blocking: body.blocking } };
    case 'report': return body.message ? { fn: 'report_message', args: { target: body.message, why: body.reason, details: body.note } }
      : { fn: 'report_content', args: { target: body.person, post: body.post, why: body.reason, details: body.note } };
    case 'send_message': return { fn: 'send_message', args: { target: body.space, message_body: body.body, reply: body.reply, photo: body.photo } };
    case 'delete_message': return { fn: 'delete_message', args: { target: body.message } };
    case 'mute_group': return { fn: 'mute_space', args: { target: body.space, muted: body.muted } };
    case 'challenge_create': return { fn: 'challenge_create', args: { target: body.space, challenge_title: body.title, challenge_details: body.description,
      challenge_kind: body.kind, unit_name: body.kind === 'quantidade' ? body.unit : '', goal: body.kind === 'quantidade' ? body.goal : null,
      start_day: body.start, duration: body.days, rest: body.rest } };
    case 'challenge_manage': return { fn: 'challenge_manage', args: { target: body.challenge, challenge_title: body.title, challenge_details: body.description, cancel: body.cancel } };
    case 'challenge_join': return { fn: 'challenge_join', args: { target: body.challenge, joining: body.joining } };
    case 'challenge_checkin': return { fn: 'challenge_checkin', args: { target: body.challenge, which_day: body.day, done: body.done, how_much: body.amount } };
    case 'achievement_audience': return { fn: 'achievement_audience', args: { target: body.achievement, next_audience: body.audience } };
    case 'show_achievements': return { fn: 'show_achievements', args: { shown: body.shown } };
    case 'finder_create': return { fn: 'finder_create', args: { target: body.space, finder_title: body.title, finder_days: body.days, first_hour: body.from, last_hour: body.to } };
    case 'finder_mark': return { fn: 'finder_mark', args: { target: body.finder, marked: body.slots } };
    case 'finder_manage': return { fn: 'finder_manage', args: { target: body.finder, pick_day: body.day, pick_hour: body.hour, remove: body.remove } };
    case 'keep_story': return { fn: 'keep_story', args: { target: body.post, title: body.title } };
    case 'follow': return { fn: 'follow_person', args: { target: body.person } };
    case 'unfollow': return { fn: 'unfollow_person', args: { target: body.person } };
    case 'answer_follow': return { fn: 'answer_follow', args: { follower: body.person, accept: body.accept } };
    case 'remove_follower': return { fn: 'remove_follower', args: { follower: body.person } };
    case 'mark_read': return { fn: 'mark_updates_read', args: {} };
  }
}

/** Leituras pela URL: feed, stories, perfil, busca de pessoas, tema, atualizações, salvos, bloqueados, listas, conversa do grupo,
 * desafios, conquistas e horários em comum. Null quando o pedido não faz sentido. */
export function networkRead(params: URLSearchParams): DbCall | null {
  const uuid = (value: string | null) => id.safeParse(value).success ? value : null;
  const raw = params.get('before');
  const before = raw && !Number.isNaN(Date.parse(raw)) && raw.length <= 40 ? raw : null;
  if (raw && !before) return null;
  const feed = params.get('feed');
  if (feed === 'following' || feed === 'groups') return { fn: 'network_feed', args: { feed, target: null, before } };
  if (feed === 'space') { const target = uuid(params.get('id')); return target ? { fn: 'network_feed', args: { feed, target, before } } : null; }
  if (params.has('stories')) { const which = params.get('stories'); return which === 'following' || which === 'groups' ? { fn: 'network_stories', args: { feed: which } } : null; }
  if (params.has('person')) { const target = uuid(params.get('person')); return target ? { fn: 'person_profile', args: { target } } : null; }
  if (params.has('people')) { const term = params.get('people') ?? ''; return term.length <= 60 ? { fn: 'search_people', args: { term } } : null; }
  if (params.has('topic')) { const tag = normalizeTopics(params.get('topic') ?? '')[0]; return tag ? { fn: 'topic_posts', args: { tag, before } } : null; }
  if (params.get('updates') === '1') return { fn: 'network_updates', args: {} };
  if (params.get('saved') === '1') return { fn: 'saved_feed', args: { before } };
  if (params.get('blocked') === '1') return { fn: 'my_blocks', args: {} };
  if (params.has('challenges')) {
    const which = params.get('challenges');
    if (which === 'today') return { fn: 'my_challenges_today', args: {} };
    const target = uuid(which); return target ? { fn: 'space_challenges', args: { target } } : null;
  }
  if (params.has('finders')) { const target = uuid(params.get('finders')); return target ? { fn: 'space_finders', args: { target } } : null; }
  if (params.has('achievements')) { const target = uuid(params.get('achievements')); return target ? { fn: 'person_achievements', args: { target } } : null; }
  if (params.has('chat')) {
    const target = uuid(params.get('chat')), rawAfter = params.get('after');
    const after = rawAfter && !Number.isNaN(Date.parse(rawAfter)) && rawAfter.length <= 40 ? rawAfter : null;
    return target && (!rawAfter || after) ? { fn: 'chat_messages', args: { target, after, before, seen: params.get('seen') === '1' } } : null;
  }
  if (params.has('follows')) {
    const target = uuid(params.get('follows')), which = params.get('list');
    return target && (which === 'followers' || which === 'following') ? { fn: 'follow_list', args: { target, which } } : null;
  }
  return null;
}
