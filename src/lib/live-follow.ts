import { collections, entityCollection, entityView, recordTitle, type Collection, type RecordItem } from './assistant-records';
import type { Workspace } from './workspace';

// When the open app receives a newer version of the person's space made elsewhere (Claude, ChatGPT,
// Telegram, WhatsApp, the voice or another device), this tells what changed, as the screens show it, so
// the app can open that screen and point at the item.
export type TouchedView = 'agenda' | 'notes' | 'finances' | 'routine' | 'planning' | 'studies' | 'flashcards' | 'settings' | 'focus';
export type Touched = { view: TouchedView; kind: 'created' | 'updated' | 'removed' | 'setting'; title: string; id?: string };

const views = Object.fromEntries(Object.entries(entityCollection).map(([entity, collection]) => [collection, entityView[entity as keyof typeof entityView]])) as Partial<Record<Collection, TouchedView>>;
const viewOf = (collection: Collection): TouchedView => views[collection] ?? 'focus';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function touchedItems(before: Workspace, after: Workspace, limit = 8): Touched[] {
  const touched: Touched[] = [];
  for (const collection of collections) {
    const old = new Map(((before[collection] ?? []) as RecordItem[]).map(item => [item.id, item]));
    const next = new Map(((after[collection] ?? []) as RecordItem[]).map(item => [item.id, item]));
    for (const [id, item] of next) {
      const prior = old.get(id);
      if (!prior) touched.push({ view: viewOf(collection), kind: 'created', title: recordTitle(item), id });
      else if (!same(prior, item)) touched.push({ view: viewOf(collection), kind: 'updated', title: recordTitle(item), id });
    }
    for (const [id, item] of old) if (!next.has(id)) touched.push({ view: viewOf(collection), kind: 'removed', title: recordTitle(item) });
  }
  if (!same(before.finance, after.finance)) touched.push({ view: 'finances', kind: 'setting', title: 'Saldo inicial' });
  if (!same(before.term, after.term)) touched.push({ view: 'studies', kind: 'setting', title: 'Datas do semestre' });
  if (!same(before.profile, after.profile)) touched.push({ view: 'settings', kind: 'setting', title: 'Perfil' });
  return touched.slice(0, limit);
}

const verbs = { created: 'criou', updated: 'atualizou', removed: 'removeu', setting: 'ajustou' } as const;
export const touchedLabel = (item: Touched) => `A IA ${verbs[item.kind]}: ${item.title}`;
