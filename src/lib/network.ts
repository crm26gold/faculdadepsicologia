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
export type Reaction = 'gostei' | 'util';

export type Person = { id: string; name: string; avatar: Avatar | null; bio?: string };
export type NetworkPost = {
  id: string; author: Person; body: string; style: PostStyle; audience: Audience; topics: string[]; created_at: string;
  space: { id: string; name: string } | null; counts: Record<Reaction, number>; mine: Reaction[];
};
export type PersonProfile = Person & {
  bio: string; closed: boolean; is_me: boolean; discoverable: boolean | null; show_follows: boolean;
  status: 'none' | 'requested' | 'following'; follows_me: boolean; requested_me: boolean;
  followers: number; following: number; posts: NetworkPost[];
};
export type NetworkEvent = {
  id: number; kind: 'follow' | 'follow_request' | 'follow_accepted' | Reaction | 'join_request' | 'join_approved';
  created_at: string; read: boolean; actor: Person | null; post: { id: string; body: string } | null; space: { id: string; name: string } | null;
};
export type Updates = { requests: Person[]; events: NetworkEvent[] };

/** Os #temas citados no texto viram a busca por tema da publicação. */
export const topicsIn = (body: string) => normalizeTopics((body.match(/#[^\s#.,;:!?()]+/g) ?? []).join(' '));

const id = z.uuid();
export const networkAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create_post'), body: z.string().trim().min(1, 'Escreva alguma coisa.').max(2200), style: z.enum(postStyles).default('text'),
    audience: z.enum(audiences).default('followers'), space: id.nullable().default(null) })
    .refine(value => (value.audience === 'group') === Boolean(value.space), 'Escolha o grupo.'),
  z.object({ action: z.literal('delete_post'), post: id }),
  z.object({ action: z.literal('react'), post: id, kind: z.enum(['gostei', 'util']) }),
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
    case 'create_post': return { fn: 'create_network_post', args: { post_body: body.body, post_style: body.style, post_audience: body.audience,
      post_space: body.audience === 'group' ? body.space : null, post_topics: topicsIn(body.body) } };
    case 'delete_post': return { fn: 'delete_network_post', args: { target: body.post } };
    case 'react': return { fn: 'toggle_reaction', args: { target: body.post, reaction: body.kind } };
    case 'follow': return { fn: 'follow_person', args: { target: body.person } };
    case 'unfollow': return { fn: 'unfollow_person', args: { target: body.person } };
    case 'answer_follow': return { fn: 'answer_follow', args: { follower: body.person, accept: body.accept } };
    case 'remove_follower': return { fn: 'remove_follower', args: { follower: body.person } };
    case 'mark_read': return { fn: 'mark_updates_read', args: {} };
  }
}

/** Leituras pela URL: feed, perfil, busca de pessoas, tema, atualizações e listas. Null quando o pedido não faz sentido. */
export function networkRead(params: URLSearchParams): DbCall | null {
  const uuid = (value: string | null) => id.safeParse(value).success ? value : null;
  const raw = params.get('before');
  const before = raw && !Number.isNaN(Date.parse(raw)) && raw.length <= 40 ? raw : null;
  if (raw && !before) return null;
  const feed = params.get('feed');
  if (feed === 'following' || feed === 'groups') return { fn: 'network_feed', args: { feed, target: null, before } };
  if (feed === 'space') { const target = uuid(params.get('id')); return target ? { fn: 'network_feed', args: { feed, target, before } } : null; }
  if (params.has('person')) { const target = uuid(params.get('person')); return target ? { fn: 'person_profile', args: { target } } : null; }
  if (params.has('people')) { const term = params.get('people') ?? ''; return term.length <= 60 ? { fn: 'search_people', args: { term } } : null; }
  if (params.has('topic')) { const tag = normalizeTopics(params.get('topic') ?? '')[0]; return tag ? { fn: 'topic_posts', args: { tag, before } } : null; }
  if (params.get('updates') === '1') return { fn: 'network_updates', args: {} };
  if (params.has('follows')) {
    const target = uuid(params.get('follows')), which = params.get('list');
    return target && (which === 'followers' || which === 'following') ? { fn: 'follow_list', args: { target, which } } : null;
  }
  return null;
}
